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
- All-feedback quality report that groups checkbox issues and written product-signal comments.
- Lightweight Analyzer Context passed into Capture Analysis from recent Captures, prior Reminder suggestions, existing Collections, recent Collection suggestions, current date/time, and timezone.
- Android-first React Native dogfood app scaffold for phone-native capture intake and reminder review.

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

## Mobile Dogfood App

`apps/mobile` is an Android-first React Native companion app for Phase 0A. It is not the full mobile beta yet. Its job is to remove the Mac handoff from dogfooding by receiving Android share-sheet payloads, creating Captures through the existing web API, auto-starting Mini analysis, and showing enough reminder/detail review to judge whether the market wedge is real.

The mobile app uses Supabase magic-link auth for dogfooding so the phone signs into the same Supabase user account as the web dashboard. This preserves access to existing web-created captures, evals, and feedback because API routes authorize by Supabase user id rather than by auth method. To avoid the built-in Supabase email sender's low limit, dogfood deployments should configure custom SMTP, preferably Resend for the first pass. It calls the existing Next API with Supabase bearer tokens, while the web app remains the richer eval and feedback dashboard.

The intended 0A dogfood path is an installed native Android app, not Expo Go. Expo QR mode is acceptable for quick UI iteration, but it does not validate the Android share-sheet wedge because Expo Go cannot become Sharebook's app-specific share target. Native builds should be the source of truth for capture testing.

Untethered dogfooding has two requirements beyond the app scaffold:

- the phone must run an installed native build that does not require a USB-tethered Metro session
- `EXPO_PUBLIC_SHAREBOOK_API_URL` must point to an API URL reachable while walking around, such as a deployed web app/API, a stable tunnel, or a private network/VPN path

The fastest non-local path is Vercel for the current Next.js app/API plus a locally built Android release APK. The APK embeds the JavaScript bundle and should be built with the deployed API URL and the same Supabase public URL/anon key used by web.

Supabase Auth redirect URLs for this path:

- `https://<vercel-url>/auth/callback`
- `sharebook://**`

ADB over Wi-Fi is only a nearby debugging convenience. It lets Codex inspect screenshots, logs, installs, app launches, and simulated share intents while the Mac and phone are on the same Wi-Fi, but it is not the long-term data-collection mechanism. For real outside dogfooding, the app should persist captures to the reachable backend and later add lightweight in-app diagnostics or server-side event logs so debugging does not depend on live device access.

## Analyzer Context

Phase 0A includes a deliberately small Analyzer Context pack so the analyzer can use prior signals without reading the user's full history. The current scaffold uses bounded recent slices as a proof point, but ADR 0006 records the durable decision: Analyzer Context should evolve toward relevance-ranked retrieval, accepted/rejected user actions, existing Collections, and compact preference summaries under a strict budget.

Analyzer Context is weak evidence. It should improve reminder timing, collection reuse, and recurring-preference detection, but it should not cause the model to invent facts that are not present in the current Capture or repeated user behavior.

## Feedback Report

The all-feedback report is the operating surface for turning reviewed submissions into analyzer work. It should show not only issue counts, but also product-signal themes from written comments, such as missing user-history context, duplicate or too-broad Collections, reminder timing, and unsupported speculation.
