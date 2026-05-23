import { NextResponse } from "next/server";
import { loadCaptureAnalysisInput } from "../../../lib/analysis-input";
import { analyzeCapture, CaptureAnalysisModelError } from "../../../lib/model-router";
import { createSupabaseAdminClient, getCurrentUser } from "../../../lib/supabase-server";

async function runComparison(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  captureId: string;
  route: string;
}) {
  const analysisInput = await loadCaptureAnalysisInput(input.supabase, {
    userId: input.userId,
    captureId: input.captureId,
    route: input.route
  });

  try {
    const result = await analyzeCapture(analysisInput.analyzeInput);
    const { data: analysisRun, error } = await input.supabase
      .from("analysis_runs")
      .insert({
        user_id: input.userId,
        capture_id: input.captureId,
        model_route: result.route,
        status: "succeeded",
        is_canonical: false,
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

    if (error) throw error;
    return { route: input.route, analysis: result.analysis, analysisRun };
  } catch (error) {
    if (!(error instanceof CaptureAnalysisModelError)) throw error;
    const { data: analysisRun } = await input.supabase
      .from("analysis_runs")
      .insert({
        user_id: input.userId,
        capture_id: input.captureId,
        model_route: error.route,
        status: "failed",
        is_canonical: false,
        provider: error.provider,
        model: error.model,
        prompt_version: error.promptVersion,
        schema_version: error.schemaVersion,
        latency_ms: error.latencyMs,
        usage: error.usage,
        cost_estimate: error.costEstimate,
        raw_output: error.debug.repairedOutput ?? error.debug.extractedJson ?? {},
        raw_model_output: error.debug.rawModelOutput,
        extracted_json: error.debug.extractedJson,
        repaired_output: error.debug.repairedOutput,
        schema_errors: error.debug.schemaErrors,
        input_snapshot: error.debug.inputSnapshot,
        error_message: error.message
      })
      .select("*")
      .single();

    return { route: input.route, error: error.message, analysisRun };
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { captureId?: string; routes?: string[] };
  if (!body.captureId) {
    return NextResponse.json({ error: "captureId is required" }, { status: 400 });
  }

  const routes = body.routes?.length
    ? body.routes
    : ["high_precision_openai", "openai_mini"];
  const supabase = createSupabaseAdminClient();
  const results = [];

  for (const route of routes) {
    results.push(
      await runComparison({
        supabase,
        userId: user.id,
        captureId: body.captureId,
        route
      })
    );
  }

  return NextResponse.json({ results });
}
