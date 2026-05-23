import { AuthForm } from "./components/auth-form";
import { CaptureWorkspace } from "./components/capture-workspace";
import { SetupScreen } from "./components/setup-screen";
import { loadCapturesForUser } from "./lib/capture-loader";
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
  const data = await loadCapturesForUser(supabase, user.id);

  return <CaptureWorkspace initialCaptures={(data ?? []) as Parameters<typeof CaptureWorkspace>[0]["initialCaptures"]} />;
}
