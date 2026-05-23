import { NextResponse } from "next/server";
import { loadCaptureAnalysisInput } from "../../../lib/analysis-input";
import { analyzeCapture, CaptureAnalysisModelError } from "../../../lib/model-router";
import { createSupabaseAdminClient, getCurrentUser } from "../../../lib/supabase-server";

type EvalFixture = {
  expected_intent: string | null;
  acceptable_intents: string[] | null;
  bad_intents: string[] | null;
  required_entities: string[] | null;
};

type AnalysisForScoring = {
  default_intent?: {
    category?: string;
  };
  entities?: Array<{
    name: string;
  }>;
};

function scoreFixture(fixture: EvalFixture, analysis: AnalysisForScoring) {
  const expectedIntent = fixture.expected_intent;
  const acceptable = new Set([expectedIntent, ...(fixture.acceptable_intents ?? [])].filter(Boolean));
  const bad = new Set(fixture.bad_intents ?? []);
  const actualIntent = analysis?.default_intent?.category ?? null;
  const entityNames = new Set(
    (analysis?.entities ?? []).map((entity) => String(entity.name).toLowerCase())
  );
  const requiredEntities = fixture.required_entities ?? [];
  const missingEntities = requiredEntities.filter(
    (entity: string) => !entityNames.has(entity.toLowerCase())
  );
  const intentPass = acceptable.size === 0 || acceptable.has(actualIntent);
  const badIntentHit = actualIntent ? bad.has(actualIntent) : false;
  const entityPass = missingEntities.length === 0;

  return {
    passed: intentPass && entityPass && !badIntentHit,
    score: {
      actual_intent: actualIntent,
      intent_pass: intentPass,
      bad_intent_hit: badIntentHit,
      missing_entities: missingEntities,
      entity_pass: entityPass
    }
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { fixtureId?: string; modelRoute?: string };
  if (!body.fixtureId) {
    return NextResponse.json({ error: "fixtureId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: fixture, error } = await supabase
    .from("eval_fixtures")
    .select("*, captures(*)")
    .eq("user_id", user.id)
    .eq("id", body.fixtureId)
    .single();

  if (error || !fixture) {
    return NextResponse.json({ error: error?.message ?? "Fixture not found" }, { status: 404 });
  }

  const route = body.modelRoute ?? "high_precision_openai";
  const analysisInput = await loadCaptureAnalysisInput(supabase, {
    userId: user.id,
    captureId: fixture.capture_id,
    route
  });

  let latestRun: { id: string } | null = null;
  let analysis: AnalysisForScoring | null = null;

  try {
    const result = await analyzeCapture(analysisInput.analyzeInput);
    analysis = result.analysis;
    const { data: run, error: runError } = await supabase
      .from("analysis_runs")
      .insert({
        user_id: user.id,
        capture_id: fixture.capture_id,
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
      .select("id")
      .single();
    if (runError) throw runError;
    latestRun = run;
  } catch (error) {
    if (!(error instanceof CaptureAnalysisModelError)) {
      const message = error instanceof Error ? error.message : "Eval analysis failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
    const { data: run } = await supabase
      .from("analysis_runs")
      .insert({
        user_id: user.id,
        capture_id: fixture.capture_id,
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
      .select("id")
      .single();
    latestRun = run;
    return NextResponse.json({ error: error.message, analysisRun: run }, { status: 500 });
  }

  const scored = scoreFixture(fixture, analysis ?? {});
  const { data: evalRun, error: evalError } = await supabase
    .from("eval_runs")
    .insert({
      user_id: user.id,
      eval_fixture_id: fixture.id,
      analysis_run_id: latestRun?.id ?? null,
      model_route: route,
      passed: scored.passed,
      score: scored.score
    })
    .select("*")
    .single();

  if (evalError) {
    return NextResponse.json({ error: evalError.message }, { status: 500 });
  }

  return NextResponse.json({ evalRun, analysis });
}
