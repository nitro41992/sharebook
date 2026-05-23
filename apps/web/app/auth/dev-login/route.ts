import { NextResponse } from "next/server";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient
} from "../../lib/supabase-server";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);

  if (process.env.NODE_ENV === "production" || !LOCAL_HOSTS.has(requestUrl.hostname)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = requestUrl.searchParams.get("email")?.trim();
  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email
  });

  if (linkError) {
    return NextResponse.json({ error: linkError.message }, { status: 400 });
  }

  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) {
    return NextResponse.json(
      { error: "Supabase did not return a dev auth token." },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash
  });

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 400 });
  }

  return NextResponse.redirect(new URL("/", requestUrl.origin));
}
