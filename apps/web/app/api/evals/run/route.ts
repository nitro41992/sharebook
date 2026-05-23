import { NextResponse } from "next/server";
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

  const analyzeResponse = await fetch(new URL("/api/analyze", request.url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? ""
    },
    body: JSON.stringify({
      captureId: fixture.capture_id,
      route: body.modelRoute
    })
  });

  const analyzeJson = await analyzeResponse.json();
  if (!analyzeResponse.ok) {
    return NextResponse.json(analyzeJson, { status: analyzeResponse.status });
  }

  const { data: latestRun } = await supabase
    .from("analysis_runs")
    .select("*")
    .eq("user_id", user.id)
    .eq("capture_id", fixture.capture_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const scored = scoreFixture(fixture, analyzeJson.analysis);
  const { data: evalRun, error: evalError } = await supabase
    .from("eval_runs")
    .insert({
      user_id: user.id,
      eval_fixture_id: fixture.id,
      analysis_run_id: latestRun?.id ?? null,
      model_route: body.modelRoute ?? "default",
      passed: scored.passed,
      score: scored.score
    })
    .select("*")
    .single();

  if (evalError) {
    return NextResponse.json({ error: evalError.message }, { status: 500 });
  }

  return NextResponse.json({ evalRun, analysis: analyzeJson.analysis });
}
