import { NextResponse } from "next/server";
import { parseQuickEdit } from "@sharebook/shared";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

type ReminderPayload = {
  captureId?: string;
  quickText?: string;
  triggerType?: string;
  triggerValue?: string;
  dueAt?: string | null;
  rationale?: string;
  suggestionId?: string;
};

function parseDueAt(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function statusTimestamp(status: string) {
  const now = new Date().toISOString();
  if (status === "completed") return { completed_at: now };
  if (status === "dismissed") return { dismissed_at: now };
  if (status === "cancelled") return { cancelled_at: now };
  return {};
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const captureId = url.searchParams.get("captureId");
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("reminders")
    .select("*, reminder_captures(capture_id, captures(id, display_title, title, capture_type, source_app, source_url))")
    .eq("user_id", user.id)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (captureId) {
    const linked = await supabase
      .from("reminder_captures")
      .select("reminder_id")
      .eq("user_id", user.id)
      .eq("capture_id", captureId);
    if (linked.error) return NextResponse.json({ error: linked.error.message }, { status: 500 });
    const ids = (linked.data ?? []).map((row) => row.reminder_id);
    if (!ids.length) return NextResponse.json({ reminders: [] });
    query = query.in("id", ids);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ reminders: [], warning: error.message });
  return NextResponse.json({ reminders: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as ReminderPayload;
  if (!body.captureId) {
    return NextResponse.json({ error: "captureId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .select("id, display_title, title, current_save_intent, default_intent")
    .eq("id", body.captureId)
    .eq("user_id", user.id)
    .single();

  if (captureError || !capture) {
    return NextResponse.json({ error: captureError?.message ?? "Capture not found" }, { status: 404 });
  }

  let triggerType = body.triggerType;
  let triggerValue = body.triggerValue;
  let dueAt = parseDueAt(body.dueAt);
  let rationale = body.rationale?.trim();
  let createdFrom = "manual";

  if (body.suggestionId) {
    const { data: suggestion, error: suggestionError } = await supabase
      .from("reminder_suggestions")
      .select("id, trigger_type, trigger_value, rationale")
      .eq("id", body.suggestionId)
      .eq("user_id", user.id)
      .eq("capture_id", body.captureId)
      .single();

    if (suggestionError || !suggestion) {
      return NextResponse.json(
        { error: suggestionError?.message ?? "Reminder suggestion not found" },
        { status: 404 }
      );
    }
    triggerType = suggestion.trigger_type;
    triggerValue = suggestion.trigger_value;
    rationale = suggestion.rationale;
    createdFrom = "suggestion";
  } else if (body.quickText) {
    const parsed = parseQuickEdit(body.quickText);
    if (parsed.reminder) {
      triggerType = parsed.reminder.triggerType;
      triggerValue = parsed.reminder.triggerValue;
      dueAt = parsed.reminder.dueAt;
      rationale ||= parsed.reminder.rationale;
    }
  }

  if (!triggerType || !triggerValue) {
    return NextResponse.json(
      { error: "Add reminder shorthand such as 2d, 4h, tomorrow @9am, or accept a suggestion." },
      { status: 400 }
    );
  }

  const title = capture.display_title || capture.title || "this capture";
  const { data: reminder, error } = await supabase
    .from("reminders")
    .insert({
      user_id: user.id,
      trigger_type: triggerType,
      trigger_value: triggerValue,
      due_at: dueAt,
      status: "scheduled",
      rationale: rationale || `Resurface ${title} because you asked Sharebook to remind you.`,
      created_from: createdFrom,
      source_suggestion_id: body.suggestionId ?? null
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const link = await supabase.from("reminder_captures").insert({
    user_id: user.id,
    reminder_id: reminder.id,
    capture_id: body.captureId
  });

  if (link.error) return NextResponse.json({ error: link.error.message }, { status: 500 });

  if (body.suggestionId) {
    await supabase
      .from("reminder_suggestions")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", body.suggestionId)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ reminder });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    reminderId?: string;
    status?: string;
    snoozedUntil?: string | null;
  };

  if (!body.reminderId || !body.status) {
    return NextResponse.json({ error: "reminderId and status are required" }, { status: 400 });
  }

  const allowed = new Set(["scheduled", "completed", "dismissed", "cancelled", "snoozed"]);
  if (!allowed.has(body.status)) {
    return NextResponse.json({ error: "Unsupported reminder status" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("reminders")
    .update({
      status: body.status,
      snoozed_until: parseDueAt(body.snoozedUntil),
      ...statusTimestamp(body.status)
    })
    .eq("id", body.reminderId)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reminder: data });
}
