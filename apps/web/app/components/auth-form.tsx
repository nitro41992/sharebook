"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setLoading(true);
    setMessage("");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    setLoading(false);
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <div className="section">
      <div className="eyebrow">Phase 0A</div>
      <h1 className="h1">Validate save intent before building mobile capture.</h1>
      <p className="body">
        Sign in to upload screenshots, paste links, run high-quality extraction,
        correct intent, and test fuzzy retrieval.
      </p>
      <div className="capture-form" style={{ maxWidth: 420, marginTop: 30 }}>
        <label className="field">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <button className="button" disabled={loading || !email} onClick={signIn}>
          {loading ? "Sending..." : "Send magic link"}
        </button>
        {message ? <p className="muted">{message}</p> : null}
      </div>
    </div>
  );
}
