import { AuthForm } from "./components/auth-form";
import { CaptureWorkspace } from "./components/capture-workspace";
import { SetupScreen } from "./components/setup-screen";
import { hasSupabaseServerEnv } from "./lib/env";
import { createSupabaseAdminClient, getCurrentUser } from "./lib/supabase-server";

export default async function Home() {
  if (!hasSupabaseServerEnv()) {
    return <SetupScreen />;
  }

  const user = await getCurrentUser();

  if (!user) {
    return <AuthForm />;
  }

  const supabase = createSupabaseAdminClient();
  const { data } = await supabase
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

  return <CaptureWorkspace initialCaptures={(data ?? []) as Parameters<typeof CaptureWorkspace>[0]["initialCaptures"]} />;
}
