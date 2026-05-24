import { NextResponse } from "next/server";
import { loadCaptureAnalysisInput } from "../../lib/analysis-input";
import { buildSearchDocument } from "../../lib/search";
import { analyzeCapture, CaptureAnalysisModelError } from "../../lib/model-router";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";
import { intentCategories, intentLabels, type CaptureAnalysis } from "@sharebook/shared";

function normalizeCollectionName(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const intentCollectionNames = new Set(
  intentCategories.flatMap((category) => [
    normalizeCollectionName(category),
    normalizeCollectionName(category.replace(/_/g, " ")),
    normalizeCollectionName(intentLabels[category])
  ])
);

function normalizeSuggestedCollections(
  analysis: CaptureAnalysis,
  existingCollections: Array<{ name: string }>
): CaptureAnalysis {
  const existingByName = new Map(
    existingCollections.map((collection) => [
      normalizeCollectionName(collection.name),
      collection.name
    ])
  );
  const seen = new Set<string>();
  const suggested_collections = analysis.suggested_collections
    .map((collection) => {
      const normalized = normalizeCollectionName(collection.name);
      const existingName = existingByName.get(normalized);
      return {
        ...collection,
        name: existingName ?? collection.name
      };
    })
    .filter((collection) => {
      const normalized = normalizeCollectionName(collection.name);
      if (!normalized || intentCollectionNames.has(normalized) || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

  return {
    ...analysis,
    suggested_collections
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { captureId?: string; route?: string };
  if (!body.captureId) {
    return NextResponse.json({ error: "captureId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  let analysisInput: Awaited<ReturnType<typeof loadCaptureAnalysisInput>>;
  try {
    analysisInput = await loadCaptureAnalysisInput(supabase, {
      userId: user.id,
      captureId: body.captureId,
      route: body.route
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Capture not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }
  const { capture, urlMetadata } = analysisInput;

  await supabase
    .from("captures")
    .update({ analysis_state: "processing", analysis_error: null })
    .eq("id", capture.id)
    .eq("user_id", user.id);

  try {
    const result = await analyzeCapture(analysisInput.analyzeInput);
    const analysis = normalizeSuggestedCollections(
      result.analysis,
      analysisInput.analyzeInput.userContext?.existingCollections ?? []
    );

    const { data: analysisRun, error: runError } = await supabase
      .from("analysis_runs")
      .insert({
        user_id: user.id,
        capture_id: capture.id,
        model_route: result.route,
        status: "succeeded",
        is_canonical: true,
        provider: result.provider,
        model: result.model,
        prompt_version: result.promptVersion,
        schema_version: result.schemaVersion,
        latency_ms: result.latencyMs,
        usage: result.usage,
        cost_estimate: result.costEstimate,
        raw_output: result.analysis,
        raw_model_output: result.debug.rawModelOutput,
        extracted_json: result.debug.extractedJson,
        repaired_output: result.debug.repairedOutput,
        schema_errors: result.debug.schemaErrors,
        input_snapshot: result.debug.inputSnapshot
      })
      .select("*")
      .single();

    if (runError) throw runError;

    await supabase.from("captured_entities").delete().eq("capture_id", capture.id);
    await supabase.from("platform_evidence").delete().eq("capture_id", capture.id);
    await supabase.from("reminder_suggestions").delete().eq("capture_id", capture.id);
    await supabase.from("collection_suggestions").delete().eq("capture_id", capture.id);
    await supabase.from("search_documents").delete().eq("capture_id", capture.id);

    if (analysis.entities.length) {
      await supabase.from("captured_entities").insert(
        analysis.entities.map((entity) => ({
          user_id: user.id,
          capture_id: capture.id,
          analysis_run_id: analysisRun.id,
          entity_type: entity.type,
          display_name: entity.name,
          normalized_name: entity.normalized_name,
          confidence: entity.confidence,
          evidence: entity.evidence,
          source: entity.source
        }))
      );
    }

    if (analysis.platform_evidence.length) {
      await supabase.from("platform_evidence").insert(
        analysis.platform_evidence.map((evidence) => ({
          user_id: user.id,
          capture_id: capture.id,
          analysis_run_id: analysisRun.id,
          evidence_type: evidence.evidence_type,
          value: evidence.value,
          source: evidence.source,
          confidence: evidence.confidence
        }))
      );
    }

    if (analysis.suggested_reminders.length) {
      await supabase.from("reminder_suggestions").insert(
        analysis.suggested_reminders.map((reminder) => ({
          user_id: user.id,
          capture_id: capture.id,
          analysis_run_id: analysisRun.id,
          trigger_type: reminder.trigger_type,
          trigger_value: reminder.trigger_value,
          rationale: reminder.rationale,
          confidence: reminder.confidence
        }))
      );
    }

    if (analysis.suggested_collections.length) {
      await supabase.from("collection_suggestions").insert(
        analysis.suggested_collections.map((collection) => ({
          user_id: user.id,
          capture_id: capture.id,
          analysis_run_id: analysisRun.id,
          name: collection.name,
          rationale: collection.rationale,
          confidence: collection.confidence
        }))
      );
    }

    const document = buildSearchDocument({
      title: capture.title || urlMetadata?.title,
      sourceText: capture.source_text,
      summary: analysis.summary,
      intent: analysis.default_intent.category,
      contextNote: capture.context_note,
      entities: analysis.entities.map((entity) => ({
        type: entity.type,
        name: entity.name
      })),
      searchPhrases: analysis.search_phrases
    });

    await supabase.from("search_documents").insert({
      user_id: user.id,
      capture_id: capture.id,
      analysis_run_id: analysisRun.id,
      document
    });

    await supabase
      .from("captures")
      .update({
        capture_type: analysis.capture_type,
        display_title: analysis.display_title,
        title: capture.title || urlMetadata?.title || analysis.display_title,
        thumbnail_url: urlMetadata?.image ?? capture.thumbnail_url,
        analysis_state: analysis.needs_review ? "needs_review" : "ready",
        default_intent: analysis.default_intent.category,
        default_intent_confidence: analysis.default_intent.confidence,
        current_save_intent: analysis.default_intent.category,
        intent_rationale: analysis.default_intent.rationale
      })
      .eq("id", capture.id)
      .eq("user_id", user.id);

    return NextResponse.json({ analysis, analysisRun });
  } catch (analysisError) {
    console.error("Capture analysis failed", analysisError);
    const message =
      analysisError instanceof Error
        ? analysisError.message
        : "Capture analysis failed";
    if (analysisError instanceof CaptureAnalysisModelError) {
      await supabase.from("analysis_runs").insert({
        user_id: user.id,
        capture_id: capture.id,
        model_route: analysisError.route,
        status: "failed",
        is_canonical: true,
        provider: analysisError.provider,
        model: analysisError.model,
        prompt_version: analysisError.promptVersion,
        schema_version: analysisError.schemaVersion,
        latency_ms: analysisError.latencyMs,
        usage: analysisError.usage,
        cost_estimate: analysisError.costEstimate,
        raw_output:
          analysisError.debug.repairedOutput ??
          analysisError.debug.extractedJson ??
          {},
        raw_model_output: analysisError.debug.rawModelOutput,
        extracted_json: analysisError.debug.extractedJson,
        repaired_output: analysisError.debug.repairedOutput,
        schema_errors: analysisError.debug.schemaErrors,
        input_snapshot: analysisError.debug.inputSnapshot,
        error_message: message
      });
    }

    await supabase
      .from("captures")
      .update({ analysis_state: "failed", analysis_error: message })
      .eq("id", capture.id)
      .eq("user_id", user.id);

    return NextResponse.json(
      {
        error: message,
        captureId: capture.id
      },
      { status: 500 }
    );
  }
}
