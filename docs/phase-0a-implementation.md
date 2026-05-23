# Phase 0A Implementation Notes

Phase 0A is a web-only concept bench. It validates Sharebook's AI extraction and retrieval loop before native mobile capture work begins.

## What Works In This Scaffold

- Supabase-backed auth, storage, and database schema.
- Capture intake for URL, text, and image/screenshot upload.
- High-quality model-router skeleton using the Vercel AI SDK.
- Structured JSON validation through shared Zod schemas.
- Analysis persistence with provider/model/prompt/schema/latency/usage metadata.
- Review inbox UI with analysis state, intent chips, entities, reminder suggestions, and collection suggestions.
- Full-text search over generated search documents.
- Eval fixture and eval run tables plus a scoring route.

## Required Environment

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY` if using Gemini routes

## Supabase Setup

Run the migration in `supabase/migrations/0001_phase_0a.sql` against a Supabase project.

The migration creates:

- capture tables
- analysis tables
- entity/evidence/suggestion tables
- collection tables
- search/eval tables
- private `captures` storage bucket
- row-level security policies

## Model Routes

- `high_precision_openai`: default concept-validation route.
- `openai_mini`: cheaper OpenAI route for quick comparison.
- `gemini_flash`: Gemini route for hosted multimodal comparison.
- `gemini_flash_lite`: cheaper Gemini route.

The model router is intentionally thin. Phase 0A should first validate extraction quality, then expand routing only when the eval harness makes comparison useful.
