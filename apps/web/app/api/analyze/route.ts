import { NextResponse } from "next/server";
import { buildSearchDocument } from "../../lib/search";
import { analyzeCapture } from "../../lib/model-router";
import { fetchUrlMetadata } from "../../lib/url-metadata";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

async function getSignedAssetUrl(captureId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data: asset } = await supabase
    .from("capture_assets")
    .select("*")
    .eq("user_id", userId)
    .eq("capture_id", captureId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!asset) return null;

  const { data } = await supabase.storage
    .from("captures")
    .createSignedUrl(asset.storage_path, 60 * 10);

  return {
    url: data?.signedUrl ?? null,
    mimeType: asset.mime_type as string | null
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
  const { data: capture, error } = await supabase
    .from("captures")
    .select("*")
    .eq("user_id", user.id)
    .eq("id", body.captureId)
    .single();

  if (error || !capture) {
    return NextResponse.json({ error: error?.message ?? "Capture not found" }, { status: 404 });
  }

  await supabase
    .from("captures")
    .update({ analysis_state: "processing", analysis_error: null })
    .eq("id", capture.id)
    .eq("user_id", user.id);

  try {
    const asset = await getSignedAssetUrl(capture.id, user.id);
    const urlMetadata = capture.source_url
      ? await fetchUrlMetadata(capture.source_url as string)
      : null;

    const result = await analyzeCapture({
      captureId: capture.id,
      sourceApp: capture.source_app,
      url: capture.source_url,
      text: capture.source_text,
      assetUrl: asset?.url,
      mimeType: asset?.mimeType,
      route: body.route,
      urlMetadata
    });

    const { data: analysisRun, error: runError } = await supabase
      .from("analysis_runs")
      .insert({
        user_id: user.id,
        capture_id: capture.id,
        provider: result.provider,
        model: result.model,
        prompt_version: result.promptVersion,
        schema_version: result.schemaVersion,
        latency_ms: result.latencyMs,
        usage: result.usage,
        cost_estimate: result.costEstimate,
        raw_output: result.analysis
      })
      .select("*")
      .single();

    if (runError) throw runError;

    await supabase.from("captured_entities").delete().eq("capture_id", capture.id);
    await supabase.from("platform_evidence").delete().eq("capture_id", capture.id);
    await supabase.from("reminder_suggestions").delete().eq("capture_id", capture.id);
    await supabase.from("collection_suggestions").delete().eq("capture_id", capture.id);
    await supabase.from("search_documents").delete().eq("capture_id", capture.id);

    if (result.analysis.entities.length) {
      await supabase.from("captured_entities").insert(
        result.analysis.entities.map((entity) => ({
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

    if (result.analysis.platform_evidence.length) {
      await supabase.from("platform_evidence").insert(
        result.analysis.platform_evidence.map((evidence) => ({
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

    if (result.analysis.suggested_reminders.length) {
      await supabase.from("reminder_suggestions").insert(
        result.analysis.suggested_reminders.map((reminder) => ({
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

    if (result.analysis.suggested_collections.length) {
      await supabase.from("collection_suggestions").insert(
        result.analysis.suggested_collections.map((collection) => ({
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
      summary: result.analysis.summary,
      intent: result.analysis.default_intent.category,
      contextNote: capture.context_note,
      entities: result.analysis.entities.map((entity) => ({
        type: entity.type,
        name: entity.name
      })),
      searchPhrases: result.analysis.search_phrases
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
        capture_type: result.analysis.capture_type,
        title: capture.title || urlMetadata?.title || result.analysis.summary,
        thumbnail_url: urlMetadata?.image ?? capture.thumbnail_url,
        analysis_state: result.analysis.needs_review ? "needs_review" : "ready",
        default_intent: result.analysis.default_intent.category,
        default_intent_confidence: result.analysis.default_intent.confidence,
        current_save_intent: result.analysis.default_intent.category,
        intent_rationale: result.analysis.default_intent.rationale
      })
      .eq("id", capture.id)
      .eq("user_id", user.id);

    return NextResponse.json({ analysis: result.analysis, analysisRun });
  } catch (analysisError) {
    console.error("Capture analysis failed", analysisError);
    const message =
      analysisError instanceof Error
        ? analysisError.message
        : "Capture analysis failed";
    await supabase
      .from("captures")
      .update({ analysis_state: "failed", analysis_error: message })
      .eq("id", capture.id)
      .eq("user_id", user.id);

    return NextResponse.json(
      {
        error: message
      },
      { status: 500 }
    );
  }
}
