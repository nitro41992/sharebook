import { NextResponse } from "next/server";
import { CaptureTypeSchema } from "@sharebook/shared";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

function inferCaptureType(input: {
  sourceUrl?: string | null;
  sourceText?: string | null;
  mimeType?: string | null;
}) {
  if (input.mimeType?.startsWith("image/")) return "image";
  if (input.sourceUrl) {
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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("captures")
    .select(
      `
      *,
      capture_assets(*),
      captured_entities(*),
      platform_evidence(*),
      reminder_suggestions(*),
      collection_suggestions(*)
    `
    )
    .eq("user_id", user.id)
    .neq("capture_state", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ captures: data ?? [] });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const sourceUrl = formData.get("sourceUrl")?.toString().trim() || null;
  const sourceText = formData.get("sourceText")?.toString().trim() || null;
  const sourceApp = formData.get("sourceApp")?.toString().trim() || null;
  const title = formData.get("title")?.toString().trim() || null;
  const file = formData.get("asset");
  const asset = file instanceof File && file.size > 0 ? file : null;
  const captureType = CaptureTypeSchema.parse(
    inferCaptureType({
      sourceUrl,
      sourceText,
      mimeType: asset?.type
    })
  );

  if (!sourceUrl && !sourceText && !asset) {
    return NextResponse.json(
      { error: "Add a URL, text, or image/screenshot asset." },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .insert({
      user_id: user.id,
      capture_type: captureType,
      source_app: sourceApp,
      source_url: sourceUrl,
      source_text: sourceText,
      title,
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
