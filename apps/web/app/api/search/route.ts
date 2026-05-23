import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("search_documents")
    .select(
      `
      *,
      captures(*)
    `
    )
    .eq("user_id", user.id)
    .textSearch("document", q.replace(/\s+/g, " & "), {
      type: "websearch",
      config: "english"
    })
    .limit(20);

  if (error) {
    const fallback = await supabase
      .from("search_documents")
      .select("*, captures(*)")
      .eq("user_id", user.id)
      .ilike("document", `%${q}%`)
      .limit(20);

    if (fallback.error) {
      return NextResponse.json({ error: fallback.error.message }, { status: 500 });
    }

    return NextResponse.json({
      results: fallback.data ?? [],
      match_context: "Matched by text fallback."
    });
  }

  return NextResponse.json({
    results: data ?? [],
    match_context: "Matched by full-text search over title, text, entities, intent, and search phrases."
  });
}
