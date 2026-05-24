import { createSupabaseAdminClient } from "./supabase-server";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

const captureDetailSelect = `
  *,
  capture_assets(*),
  captured_entities(*),
  platform_evidence(*),
  reminder_suggestions(*),
  collection_suggestions(*),
  analysis_runs(*)
`;

async function hydrateCapture(supabase: SupabaseAdminClient, capture: Record<string, unknown>) {
  const assets = await Promise.all(
    ((capture.capture_assets ?? []) as Array<Record<string, unknown>>).map(async (asset) => {
      const storagePath = typeof asset.storage_path === "string" ? asset.storage_path : null;
      if (!storagePath) return { ...asset, signed_url: null };

      const { data: signed } = await supabase.storage
        .from("captures")
        .createSignedUrl(storagePath, 60 * 10);

      return {
        ...asset,
        signed_url: signed?.signedUrl ?? null
      };
    })
  );

  const runs = [...((capture.analysis_runs ?? []) as Array<Record<string, unknown>>)].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );

  return {
    ...capture,
    capture_assets: assets,
    analysis_runs: runs.slice(0, 8)
  };
}

export async function loadCaptureSummariesForUser(
  supabase: SupabaseAdminClient,
  input: { userId: string; limit?: number; cursor?: string | null }
) {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  let query = supabase
    .from("captures")
    .select(
      `
      id,
      capture_type,
      source_app,
      source_url,
      source_text,
      title,
      display_title,
      thumbnail_url,
      analysis_state,
      analysis_error,
      default_intent,
      default_intent_confidence,
      current_save_intent,
      intent_rationale,
      created_at
    `
    )
    .eq("user_id", input.userId)
    .neq("capture_state", "deleted")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (input.cursor) query = query.lt("created_at", input.cursor);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const captures = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? captures[captures.length - 1]?.created_at ?? null : null;

  return { captures, nextCursor };
}

export async function loadCaptureForUser(
  supabase: SupabaseAdminClient,
  input: { userId: string; captureId: string }
) {
  const { data, error } = await supabase
    .from("captures")
    .select(captureDetailSelect)
    .eq("user_id", input.userId)
    .eq("id", input.captureId)
    .neq("capture_state", "deleted")
    .single();

  if (error) throw error;
  return data ? hydrateCapture(supabase, data) : null;
}

export async function loadCapturesForUser(supabase: SupabaseAdminClient, userId: string) {
  const { data, error } = await supabase
    .from("captures")
    .select(captureDetailSelect)
    .eq("user_id", userId)
    .neq("capture_state", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const captures = await Promise.all((data ?? []).map((capture) => hydrateCapture(supabase, capture)));

  return captures;
}
