import { NextResponse } from "next/server";
import { CaptureTypeSchema, IntentCategorySchema } from "@sharebook/shared";
import {
  loadCaptureForUser,
  loadCaptureSummariesForUser,
  loadCapturesForUser
} from "../../lib/capture-loader";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

const directVideoUrlPattern = /\.(mp4|m4v|mov|webm|ogv|ogg)(?:[?#].*)?$/i;

function isHttpUrl(value?: string | null) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function inferCaptureType(input: {
  sourceUrl?: string | null;
  sourceText?: string | null;
  mimeType?: string | null;
}) {
  if (input.mimeType?.startsWith("image/")) return "image";
  if (input.mimeType?.startsWith("video/")) return "video";
  if (input.sourceUrl) {
    if (isHttpUrl(input.sourceUrl) && directVideoUrlPattern.test(input.sourceUrl)) {
      return "video";
    }
    if (
      /instagram\.com|tiktok\.com|reddit\.com|youtube\.com|youtu\.be|x\.com|twitter\.com/i.test(
        input.sourceUrl
      )
    ) {
      return "social_post";
    }
    return "link";
  }
  if (input.sourceText) return "text_note";
  return "unknown";
}

function inferSourceApp(sourceUrl?: string | null) {
  if (!sourceUrl) return null;
  if (/instagram\.com/i.test(sourceUrl)) return "Instagram";
  if (/tiktok\.com/i.test(sourceUrl)) return "TikTok";
  if (/reddit\.com/i.test(sourceUrl)) return "Reddit";
  if (/youtube\.com|youtu\.be/i.test(sourceUrl)) return "YouTube";
  if (/maps\.app\.goo\.gl|google\.[^/]+\/maps|maps\.google\./i.test(sourceUrl)) return "Maps";
  if (/x\.com|twitter\.com/i.test(sourceUrl)) return "X";
  return "Browser";
}

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  const captureId = url.searchParams.get("captureId");
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;
  const cursor = url.searchParams.get("cursor");
  const supabase = createSupabaseAdminClient();
  try {
    if (view === "summary") {
      const result = await loadCaptureSummariesForUser(supabase, {
        userId: user.id,
        limit: typeof limit === "number" && Number.isFinite(limit) ? limit : undefined,
        cursor
      });
      return NextResponse.json(result);
    }

    if (view === "detail") {
      if (!captureId) {
        return NextResponse.json({ error: "captureId is required" }, { status: 400 });
      }
      const capture = await loadCaptureForUser(supabase, { userId: user.id, captureId });
      if (!capture) return NextResponse.json({ error: "Capture not found" }, { status: 404 });
      return NextResponse.json({ capture });
    }

    const captures = await loadCapturesForUser(supabase, user.id);
    return NextResponse.json({ captures });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load captures";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") ?? "";
  let sourceUrl: string | null = null;
  let sourceText: string | null = null;
  let sourceApp: string | null = null;
  let title: string | null = null;
  let asset: File | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    sourceUrl = formData.get("sourceUrl")?.toString().trim() || null;
    sourceText = formData.get("sourceText")?.toString().trim() || null;
    sourceApp = formData.get("sourceApp")?.toString().trim() || null;
    title = formData.get("title")?.toString().trim() || null;
    const file = formData.get("asset");
    asset = file instanceof File && file.size > 0 ? file : null;
  } else {
    const body = (await request.json().catch(() => ({}))) as {
      sourceUrl?: unknown;
      sourceText?: unknown;
      sourceApp?: unknown;
      title?: unknown;
    };
    sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() || null : null;
    sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() || null : null;
    sourceApp = typeof body.sourceApp === "string" ? body.sourceApp.trim() || null : null;
    title = typeof body.title === "string" ? body.title.trim() || null : null;
  }

  sourceApp ||= inferSourceApp(sourceUrl);
  const captureType = CaptureTypeSchema.parse(
    inferCaptureType({
      sourceUrl,
      sourceText,
      mimeType: asset?.type
    })
  );

  if (!sourceUrl && !sourceText && !asset) {
    return NextResponse.json(
      { error: "Add a URL, text, image, or video asset." },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();
  const displayTitle = title || sourceUrl || sourceText?.slice(0, 90) || "Untitled capture";
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .insert({
      user_id: user.id,
      capture_type: captureType,
      source_app: sourceApp,
      source_url: sourceUrl,
      source_text: sourceText,
      title,
      display_title: displayTitle,
      analysis_state: "queued"
    })
    .select("*")
    .single();

  if (captureError) {
    return NextResponse.json({ error: captureError.message }, { status: 500 });
  }

  if (asset) {
    const extension = asset.name.split(".").pop() || "bin";
    const path = `${user.id}/${capture.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("captures")
      .upload(path, asset, {
        contentType: asset.type || "application/octet-stream",
        upsert: false
      });

    if (uploadError) {
      await supabase.from("captures").update({ analysis_state: "partial" }).eq("id", capture.id);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    await supabase.from("capture_assets").insert({
      user_id: user.id,
      capture_id: capture.id,
      storage_path: path,
      mime_type: asset.type,
      byte_size: asset.size
    });
  }

  return NextResponse.json({ capture });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    captureId?: string;
    currentSaveIntent?: string;
  };
  if (!body.captureId) {
    return NextResponse.json({ error: "captureId is required" }, { status: 400 });
  }

  const currentSaveIntent = IntentCategorySchema.parse(body.currentSaveIntent);
  const supabase = createSupabaseAdminClient();
  const { data: capture, error: loadError } = await supabase
    .from("captures")
    .select("current_save_intent")
    .eq("user_id", user.id)
    .eq("id", body.captureId)
    .single();

  if (loadError || !capture) {
    return NextResponse.json({ error: loadError?.message ?? "Capture not found" }, { status: 404 });
  }

  const { data: updated, error } = await supabase
    .from("captures")
    .update({
      current_save_intent: currentSaveIntent,
      intent_corrected_from: capture.current_save_intent,
      intent_corrected_at: new Date().toISOString()
    })
    .eq("user_id", user.id)
    .eq("id", body.captureId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ capture: updated });
}
