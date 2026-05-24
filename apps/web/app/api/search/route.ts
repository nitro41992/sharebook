import { NextResponse } from "next/server";
import { searchCapturesForUser } from "../../lib/search";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const supabase = createSupabaseAdminClient();
  try {
    const results = await searchCapturesForUser(supabase, {
      userId: user.id,
      query: q,
      limit: 20
    });

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
