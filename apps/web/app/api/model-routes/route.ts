import { NextResponse } from "next/server";
import { createSupabaseAdminClient, getCurrentUser } from "../../lib/supabase-server";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("model_route_configs")
    .select("*")
    .order("is_default", { ascending: false })
    .order("route", { ascending: true });

  if (error) return NextResponse.json({ routes: [], warning: error.message });
  return NextResponse.json({ routes: data ?? [] });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    route?: string;
    provider?: string;
    model?: string;
    promptVersion?: string;
    enabled?: boolean;
    isDefault?: boolean;
    fallbackRoute?: string | null;
  };

  if (!body.route) return NextResponse.json({ error: "route is required" }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  if (body.isDefault) {
    await supabase.from("model_route_configs").update({ is_default: false }).neq("route", body.route);
  }

  const patch = {
    ...(body.provider ? { provider: body.provider } : {}),
    ...(body.model ? { model: body.model } : {}),
    ...(body.promptVersion ? { prompt_version: body.promptVersion } : {}),
    ...(typeof body.enabled === "boolean" ? { enabled: body.enabled } : {}),
    ...(typeof body.isDefault === "boolean" ? { is_default: body.isDefault } : {}),
    ...(body.fallbackRoute !== undefined ? { fallback_route: body.fallbackRoute } : {})
  };

  const { data, error } = await supabase
    .from("model_route_configs")
    .update(patch)
    .eq("route", body.route)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ route: data });
}
