import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUser } from "../../../lib/supabase-server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    captureId?: string;
    label?: string;
    expectedIntent?: string | null;
    requiredEntities?: string[];
    searchQueries?: string[];
    notes?: string | null;
  };

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
      required_entities: body.requiredEntities ?? [],
      search_queries: body.searchQueries ?? [],
      notes: body.notes ?? null
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fixture });
}
