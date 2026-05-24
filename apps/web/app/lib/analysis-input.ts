import { fetchUrlMetadata } from "./url-metadata";
import type { AnalyzerUserContext } from "@sharebook/shared";

type SupabaseAdminClient = ReturnType<
  typeof import("./supabase-server").createSupabaseAdminClient
>;

function captureTitle(capture: Record<string, unknown> | null | undefined) {
  if (!capture || typeof capture !== "object") return null;
  return (
    (typeof capture.display_title === "string" && capture.display_title) ||
    (typeof capture.title === "string" && capture.title) ||
    null
  );
}

function captureIntent(capture: Record<string, unknown> | null | undefined) {
  if (!capture || typeof capture !== "object") return null;
  return (
    (typeof capture.current_save_intent === "string" && capture.current_save_intent) ||
    (typeof capture.default_intent === "string" && capture.default_intent) ||
    null
  );
}

function joinedCapture(value: unknown) {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  return (value as Record<string, unknown> | null) ?? null;
}

function reminderStatus(row: Record<string, unknown>): "accepted" | "rejected" | "suggested" {
  if (row.accepted_at) return "accepted";
  if (row.rejected_at) return "rejected";
  return "suggested";
}

async function loadAnalyzerUserContext(
  supabase: SupabaseAdminClient,
  input: { userId: string; captureId: string }
): Promise<AnalyzerUserContext> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [recentCaptures, priorReminders, collections, collectionSuggestions] =
    await Promise.all([
      supabase
        .from("captures")
        .select(
          `
          id,
          display_title,
          title,
          current_save_intent,
          default_intent,
          context_note,
          created_at,
          captured_entities(display_name, entity_type)
        `
        )
        .eq("user_id", input.userId)
        .neq("id", input.captureId)
        .neq("capture_state", "deleted")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("reminder_suggestions")
        .select(
          `
          trigger_type,
          trigger_value,
          rationale,
          accepted_at,
          rejected_at,
          confidence,
          created_at,
          captures(display_title, title, current_save_intent, default_intent)
        `
        )
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("collections")
        .select("id, name, rationale, created_by, created_at")
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("collection_suggestions")
        .select(
          `
          name,
          rationale,
          confidence,
          created_at,
          captures(display_title, title, current_save_intent, default_intent)
        `
        )
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(20)
    ]);

  return {
    currentDateTime: new Date().toISOString(),
    timezone,
    recentCaptures: recentCaptures.error
      ? []
      : ((recentCaptures.data ?? []) as Array<Record<string, unknown>>).map((capture) => ({
          title: captureTitle(capture),
          intent: captureIntent(capture),
          context_note:
            typeof capture.context_note === "string" ? capture.context_note.slice(0, 240) : null,
          entities: Array.isArray(capture.captured_entities)
            ? capture.captured_entities
                .map((entity) => {
                  const value = entity as Record<string, unknown>;
                  const name =
                    typeof value.display_name === "string" ? value.display_name.trim() : "";
                  const type =
                    typeof value.entity_type === "string" ? value.entity_type.trim() : "";
                  return [type, name].filter(Boolean).join(": ");
                })
                .filter(Boolean)
                .slice(0, 8)
            : [],
          created_at: typeof capture.created_at === "string" ? capture.created_at : null
        })),
    priorReminders: priorReminders.error
      ? []
      : ((priorReminders.data ?? []) as Array<Record<string, unknown>>).map((reminder) => {
          const capture = joinedCapture(reminder.captures);
          return {
            capture_title: captureTitle(capture),
            capture_intent: captureIntent(capture),
            trigger_type:
              typeof reminder.trigger_type === "string" ? reminder.trigger_type : null,
            trigger_value:
              typeof reminder.trigger_value === "string" ? reminder.trigger_value : null,
            rationale: typeof reminder.rationale === "string" ? reminder.rationale : null,
            status: reminderStatus(reminder),
            confidence:
              typeof reminder.confidence === "number" ? reminder.confidence : null,
            created_at: typeof reminder.created_at === "string" ? reminder.created_at : null
          };
        }),
    existingCollections: collections.error
      ? []
      : ((collections.data ?? []) as Array<Record<string, unknown>>).map((collection) => ({
          id: String(collection.id),
          name: String(collection.name),
          rationale: typeof collection.rationale === "string" ? collection.rationale : null,
          created_by: typeof collection.created_by === "string" ? collection.created_by : null
        })),
    recentCollectionSuggestions: collectionSuggestions.error
      ? []
      : ((collectionSuggestions.data ?? []) as Array<Record<string, unknown>>).map((suggestion) => {
          const capture = joinedCapture(suggestion.captures);
          return {
            name: String(suggestion.name),
            rationale: typeof suggestion.rationale === "string" ? suggestion.rationale : null,
            capture_title: captureTitle(capture),
            capture_intent: captureIntent(capture),
            confidence:
              typeof suggestion.confidence === "number" ? suggestion.confidence : null
          };
        })
  };
}

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
  const userContext = await loadAnalyzerUserContext(supabase, {
    userId: input.userId,
    captureId: input.captureId
  });

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
      urlMetadata,
      userContext
    }
  };
}
