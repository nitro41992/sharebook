export function SetupScreen() {
  return (
    <div className="section">
      <div className="eyebrow">Setup required</div>
      <h1 className="h1">Connect Supabase to run Phase 0A.</h1>
      <p className="body">
        Copy <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code>,
        fill the Supabase keys, run the migration, then restart the dev server.
      </p>
      <div className="panel" style={{ maxWidth: 720 }}>
        <div className="label">Required</div>
        <pre className="muted small">
{`NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY`}
        </pre>
      </div>
    </div>
  );
}
