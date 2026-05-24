import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUser } from "../../../lib/supabase-server";

function textList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

type FeedbackBody = {
  fixtureId?: string;
  captureId?: string;
  label?: string;
  expectedIntent?: string | null;
  acceptableIntents?: string[] | string;
  badIntents?: string[] | string;
  requiredEntities?: string[] | string;
  expectedReminders?: string[] | string;
  searchQueries?: string[] | string;
  notes?: string | null;
};

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const captureId = url.searchParams.get("captureId");
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("eval_fixtures")
    .select(
      `
      *,
      eval_runs(*)
    `
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (captureId) query = query.eq("capture_id", captureId);

  const { data, error } = await query.limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fixtures = (data ?? []).map((fixture) => ({
    ...fixture,
    eval_runs: [...(fixture.eval_runs ?? [])]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 5)
  }));

  return NextResponse.json({ fixtures });
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as FeedbackBody;

  if (!body.captureId) {
    return NextResponse.json({ error: "captureId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .select("id, display_title, title, current_save_intent, default_intent")
    .eq("user_id", user.id)
    .eq("id", body.captureId)
    .single();

  if (captureError || !capture) {
    return NextResponse.json(
      { error: captureError?.message ?? "Capture not found" },
      { status: 404 }
    );
  }

  const { data: fixture, error } = await supabase
    .from("eval_fixtures")
    .insert({
      user_id: user.id,
      capture_id: body.captureId,
      label: body.label || capture.display_title || capture.title || "Untitled fixture",
      expected_intent:
        body.expectedIntent ?? capture.current_save_intent ?? capture.default_intent ?? null,
      acceptable_intents: textList(body.acceptableIntents),
      bad_intents: textList(body.badIntents),
      required_entities: textList(body.requiredEntities),
      expected_reminders: textList(body.expectedReminders),
      search_queries: textList(body.searchQueries),
      notes: body.notes ?? null
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fixture });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as FeedbackBody;
  if (!body.fixtureId) {
    return NextResponse.json({ error: "fixtureId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: fixture, error } = await supabase
    .from("eval_fixtures")
    .update({
      label: body.label,
      expected_intent: body.expectedIntent ?? null,
      acceptable_intents: textList(body.acceptableIntents),
      bad_intents: textList(body.badIntents),
      required_entities: textList(body.requiredEntities),
      expected_reminders: textList(body.expectedReminders),
      search_queries: textList(body.searchQueries),
      notes: body.notes ?? null
    })
    .eq("user_id", user.id)
    .eq("id", body.fixtureId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fixture });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixtureId");
  if (!fixtureId) {
    return NextResponse.json({ error: "fixtureId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("eval_fixtures")
    .delete()
    .eq("user_id", user.id)
    .eq("id", fixtureId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
