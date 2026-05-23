import { createSupabaseAdminClient } from "./supabase-server";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function loadCapturesForUser(supabase: SupabaseAdminClient, userId: string) {
  const { data, error } = await supabase
    .from("captures")
    .select(
      `
      *,
      capture_assets(*),
      captured_entities(*),
      platform_evidence(*),
      reminder_suggestions(*),
      collection_suggestions(*),
      analysis_runs(*)
    `
    )
    .eq("user_id", userId)
    .neq("capture_state", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw error;

  const captures = await Promise.all(
    (data ?? []).map(async (capture) => {
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

      const runs = [...(capture.analysis_runs ?? [])].sort((a, b) =>
        String(b.created_at).localeCompare(String(a.created_at))
      );

      return {
        ...capture,
        capture_assets: assets,
        analysis_runs: runs.slice(0, 8)
      };
    })
  );

  return captures;
}
