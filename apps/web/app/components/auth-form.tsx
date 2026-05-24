"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const showDevAuth = process.env.NODE_ENV !== "production";

  function getSupabase() {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }

  async function sendMagicLink() {
    setLoading(true);
    setMessage("");
    const supabase = getSupabase();

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });

    setLoading(false);
    setMessage(error ? error.message : "Check your email for the sign-in link.");
  }

  async function signInWithPassword() {
    setLoading(true);
    setMessage("");
    const supabase = getSupabase();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    window.location.reload();
  }

  function devSignIn() {
    if (!email) return;
    setLoading(true);
    setMessage("");
    window.location.href = `/auth/dev-login?email=${encodeURIComponent(email)}`;
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
        <label className="field">
          <span className="label">Password</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Use a password after you set one"
          />
        </label>
        <button className="button" disabled={loading || !email || !password} onClick={signInWithPassword}>
          {loading ? "Signing in..." : "Sign in with password"}
        </button>
        <button className="button secondary" disabled={loading || !email} onClick={sendMagicLink}>
          Send magic link
        </button>
        {showDevAuth ? (
          <button className="button secondary" disabled={loading || !email} onClick={devSignIn}>
            Dev sign in
          </button>
        ) : null}
        {message ? <p className="muted">{message}</p> : null}
      </div>
    </div>
  );
}
