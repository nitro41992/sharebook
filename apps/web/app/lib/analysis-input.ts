import { fetchUrlMetadata } from "./url-metadata";

type SupabaseAdminClient = ReturnType<
  typeof import("./supabase-server").createSupabaseAdminClient
>;

export async function loadCaptureAnalysisInput(
  supabase: SupabaseAdminClient,
  input: { userId: string; captureId: string; route?: string | null }
) {
  const { data: capture, error } = await supabase
    .from("captures")
    .select("*")
    .eq("user_id", input.userId)
    .eq("id", input.captureId)
    .single();

  if (error || !capture) {
    throw new Error(error?.message ?? "Capture not found");
  }

  const { data: asset } = await supabase
    .from("capture_assets")
    .select("*")
    .eq("user_id", input.userId)
    .eq("capture_id", input.captureId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const signedAsset = asset
    ? await supabase.storage.from("captures").createSignedUrl(asset.storage_path, 60 * 10)
    : null;

  const urlMetadata = capture.source_url
    ? await fetchUrlMetadata(capture.source_url as string)
    : null;

  return {
    capture,
    asset: asset
      ? {
          url: signedAsset?.data?.signedUrl ?? null,
          mimeType: asset.mime_type as string | null
        }
      : null,
    urlMetadata,
    analyzeInput: {
      captureId: capture.id,
      sourceApp: capture.source_app,
      url: capture.source_url,
      text: capture.source_text,
      assetUrl: signedAsset?.data?.signedUrl ?? null,
      mimeType: (asset?.mime_type as string | null) ?? null,
      route: input.route,
      urlMetadata
    }
  };
}
