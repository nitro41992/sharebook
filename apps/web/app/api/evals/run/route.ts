import { NextResponse } from "next/server";
import { loadCaptureAnalysisInput } from "../../../lib/analysis-input";
import { analyzeCapture, CaptureAnalysisModelError } from "../../../lib/model-router";
import { searchCapturesForUser } from "../../../lib/search";
import { createSupabaseAdminClient, getCurrentUser } from "../../../lib/supabase-server";
import { intentCategories, intentLabels } from "@sharebook/shared";

type EvalFixture = {
  expected_intent: string | null;
  acceptable_intents: string[] | null;
  bad_intents: string[] | null;
  required_entities: string[] | null;
  expected_reminders: string[] | null;
  search_queries: string[] | null;
  capture_id: string;
};

type AnalysisForScoring = {
  default_intent?: {
    category?: string;
  };
  entities?: Array<{
    name: string;
    normalized_name?: string | null;
  }>;
  suggested_reminders?: Array<{
    trigger_value?: string;
    rationale?: string;
  }>;
  suggested_collections?: Array<{
    name?: string;
  }>;
  search_phrases?: string[];
};

function includesText(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function looselyMatches(haystack: string, needle: string) {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedHaystack || !normalizedNeedle) return false;
  return (
    normalizedHaystack === normalizedNeedle ||
    normalizedHaystack.includes(normalizedNeedle) ||
    normalizedNeedle.includes(normalizedHaystack)
  );
}

const broadIntentCollectionNames = new Set(
  intentCategories.flatMap((category) => [
    normalizeText(category),
    normalizeText(category.replace(/_/g, " ")),
    normalizeText(intentLabels[category])
  ])
);

function parseReminderDate(value: string | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

async function scoreFixture(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  userId: string;
  fixture: EvalFixture;
  analysis: AnalysisForScoring;
}) {
  const { fixture, analysis } = input;
  const expectedIntent = fixture.expected_intent;
  const acceptable = new Set([expectedIntent, ...(fixture.acceptable_intents ?? [])].filter(Boolean));
  const bad = new Set(fixture.bad_intents ?? []);
  const actualIntent = analysis?.default_intent?.category ?? null;
  const entityNames = (analysis?.entities ?? []).flatMap((entity) =>
    [entity.name, entity.normalized_name].filter((value): value is string => Boolean(value))
  );
  const requiredEntities = fixture.required_entities ?? [];
  const missingEntities = requiredEntities.filter(
    (entity: string) => !entityNames.some((entityName) => looselyMatches(entityName, entity))
  );
  const intentPass = acceptable.size === 0 || acceptable.has(actualIntent);
  const badIntentHit = actualIntent ? bad.has(actualIntent) : false;
  const entityPass = missingEntities.length === 0;
  const reminders = analysis?.suggested_reminders ?? [];
  const now = new Date();
  const pastReminders = reminders.filter((reminder) => {
    const parsed = parseReminderDate(reminder.trigger_value);
    return parsed ? parsed.getTime() < now.getTime() : false;
  });
  const missingReminders = (fixture.expected_reminders ?? []).filter((expected) => {
    return !reminders.some((reminder) =>
      includesText(`${reminder.trigger_value ?? ""} ${reminder.rationale ?? ""}`, expected)
    );
  });
  const reminderPass = missingReminders.length === 0;
  const broadCollectionSuggestions = (analysis?.suggested_collections ?? [])
    .map((collection) => collection.name ?? "")
    .filter((name) => broadIntentCollectionNames.has(normalizeText(name)));
  const searchMisses = [];
  const generatedSearchPhraseHits: string[] = [];

  for (const query of fixture.search_queries ?? []) {
    if ((analysis?.search_phrases ?? []).some((phrase) => looselyMatches(phrase, query))) {
      generatedSearchPhraseHits.push(query);
    }
    const results = await searchCapturesForUser(input.supabase, {
      userId: input.userId,
      query,
      limit: 10
    });
    if (!results.some((result) => result.capture_id === fixture.capture_id)) {
      searchMisses.push(query);
    }
  }
  const searchPass = searchMisses.length === 0;

  return {
    passed:
      intentPass &&
      entityPass &&
      reminderPass &&
      searchPass &&
      !badIntentHit &&
      pastReminders.length === 0 &&
      broadCollectionSuggestions.length === 0,
    score: {
      actual_intent: actualIntent,
      intent_pass: intentPass,
      bad_intent_hit: badIntentHit,
      missing_entities: missingEntities,
      entity_pass: entityPass,
      missing_reminders: missingReminders,
      past_reminders: pastReminders.map((reminder) => reminder.trigger_value),
      reminder_pass: reminderPass,
      search_misses: searchMisses,
      generated_search_phrase_hits: generatedSearchPhraseHits,
      search_pass: searchPass,
      broad_collection_suggestions: broadCollectionSuggestions
    }
  };
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
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

  const route = body.modelRoute ?? "openai_mini";
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

  const scored = await scoreFixture({
    supabase,
    userId: user.id,
    fixture,
    analysis: analysis ?? {}
  });
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
