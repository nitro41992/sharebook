# Use Supabase As The Core Backend

Sharebook will use Supabase for Auth, Postgres, Storage, Edge Functions, and pgvector-backed search rather than Firebase as the core backend. Sharebook's data model is relational and graph-like, with Captures connected to Save Intents, Captured Entities, Reminders, Collections, Platform Evidence, and embeddings, so Postgres is a better default than a document-first backend for the first beta.
