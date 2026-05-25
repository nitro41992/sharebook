import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

export async function POST(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    captureId?: string;
    name?: string;
    rationale?: string;
  };

  const name = body.name?.trim();
  if (!body.captureId || !name) {
    return NextResponse.json({ error: "captureId and name are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: capture, error: captureError } = await supabase
    .from("captures")
    .select("id")
    .eq("id", body.captureId)
    .eq("user_id", user.id)
    .single();

  if (captureError || !capture) {
    return NextResponse.json({ error: captureError?.message ?? "Capture not found" }, { status: 404 });
  }

  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .upsert(
      {
        user_id: user.id,
        name,
        rationale: body.rationale?.trim() || null,
        created_by: "user"
      },
      { onConflict: "user_id,name" }
    )
    .select("*")
    .single();

  if (collectionError) {
    return NextResponse.json({ error: collectionError.message }, { status: 500 });
  }

  const link = await supabase.from("capture_collections").upsert(
    {
      user_id: user.id,
      capture_id: body.captureId,
      collection_id: collection.id
    },
    { onConflict: "capture_id,collection_id" }
  );

  if (link.error) return NextResponse.json({ error: link.error.message }, { status: 500 });
  return NextResponse.json({ collection });
}
