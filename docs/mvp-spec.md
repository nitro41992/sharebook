# Sharebook MVP Spec

## Product Thesis

Sharebook is a low-friction AI save layer for social posts, links, screenshots, images, and notes. It captures the moment around a save, infers why the user saved it, stores people, places, and things in an Intent Graph, and resurfaces Captures through search, Reminders, and Suggested Actions.

The core promise is not better bookmarking or screenshot search. The core promise is: Sharebook remembers why something mattered when the user saved it.

## Target User

The first user saves images, screenshots, links, and social posts and later loses the reason, context, or action behind the save. They save Instagram reels, TikToks, Reddit threads, YouTube videos, Maps places, product pages, article links, screenshots, images, and notes without wanting to manually organize them.

## Competitive Positioning

Sharebook should not compete as a generic AI bookmark manager or a Pixel Screenshots clone. Existing products already summarize bookmarks, search screenshots, store notes, and attach reminders.

Sharebook should compete on:

- Broad Explicit Capture from images, screenshots, links, social posts, uploads, and pasted content.
- Save Intent inference from Capture Context rather than only content summary.
- One-Tap Correction that improves intent without forcing manual notes.
- First-class Reminders that can resurface one or more Captures by time, place, event, or future context.
- Intent Graph relationships between Captures, Captured Entities, Save Intents, Reminders, and Platform Evidence.

## MVP Goals

- Make saving from mobile apps feel instant.
- Accept any image or link as an MVP Capture input.
- Infer a useful Default Intent for each Capture.
- Let users correct intent with one tap or optional free text.
- Preserve enough Platform Evidence to make future search and reminders useful.
- Support search by fuzzy memory.
- Support Reminders as first-class objects.
- Keep Capture Analysis durable when the app closes.

## Non-Goals

- Importing all existing saves from Instagram, TikTok, Google Maps, Pinterest, or other platforms.
- Full platform-specific metadata normalization across every app.
- Background scraping.
- A complete personal knowledge graph.
- On-device-only AI analysis.
- Desktop browser extension as the first capture surface.
- Rich collaboration or shared notebooks.

## Core Concepts

Use the canonical terms in [CONTEXT.md](../CONTEXT.md).

Primary concepts:

- Capture
- Capture Type
- Save Intent
- Default Intent
- Intent Category
- Capture Context
- Captured Entity
- Platform Evidence
- Capture Receipt
- Capture Analysis
- Analysis State
- One-Tap Correction
- Context Note
- Suggested Action
- Intent Graph
- Reminder
- Capture Surface
- Review Inbox
- Collection

## Capture Types

MVP should support:

- Link
- Social Post
- Screenshot
- Image
- Text Note

Later capture types:

- Voice Note
- Email
- Calendar Event
- Location Pin
- Document or PDF
- Browser Session
- Clipboard Capture
- Scan

## Capture Surfaces

MVP capture surfaces:

- Android share target
- iOS share extension
- Mobile upload
- Paste URL or text
- Manual text note

Near-term follow-up:

- Web app upload and paste
- Drag-and-drop for desktop web

The first beta should include both Android and iOS because the user can dogfood across both phones and wants friends to beta test. The main app should be React Native, with thin native capture and notification/reminder surfaces where needed.

## Technical Stack

Mobile:

- React Native for the main app and Review Inbox.
- Expo libraries/modules where they reduce mobile boilerplate.
- EAS is not a core build or deployment dependency.
- Native `ios/` and `android/` projects should be owned once share extension/share target work begins.
- fastlane should automate TestFlight and Google Play beta deployment.

Backend:

- Supabase Auth for users.
- Supabase Postgres for Captures, Save Intents, Captured Entities, Reminders, Collections, Platform Evidence, and analysis metadata.
- Supabase Storage for raw screenshots, images, uploads, and generated thumbnails.
- Supabase Edge Functions for fast intake APIs and orchestration.
- Supabase pgvector plus Postgres full-text search for hybrid search.

Capture Analysis:

- Long-running AI enrichment should run in a managed background job runner, not inside the mobile app or a short-lived Edge Function.
- Trigger.dev Cloud is the default background-job candidate because it is built for long-running TypeScript jobs, retries, concurrency, and observability.
- Inngest is the lower-cost/free-tier alternative to evaluate before implementation if Trigger.dev pricing or ergonomics are a concern.

Deployment and accounts:

- fastlane handles beta deployment automation.
- Apple Developer Program and Google Play Console accounts are required for friend beta distribution.
- EAS Free may be used opportunistically, but product delivery must not depend on EAS paid tiers or EAS Update.

Cost posture:

- Start on Supabase Free if it is sufficient; expect Supabase Pro when storage, reliability, or beta usage needs headroom.
- Avoid paid Expo/EAS dependency unless it is later justified by build velocity.
- Treat AI vision analysis as the main variable cost and meter it from the first implementation.

## Capture Flow

1. User creates an Explicit Capture through share, upload, paste, or manual entry.
2. Sharebook immediately creates a durable Capture record or local optimistic record.
3. Sharebook shows a Capture Receipt.
4. Capture Analysis starts asynchronously.
5. UI shows Analysis State while processing.
6. Capture Analysis produces Captured Entities, Platform Evidence, and a Default Intent.
7. User may apply One-Tap Correction or add a Context Note.
8. Sharebook suggests actions after Save Intent is inferred or corrected.
9. User may create a Reminder, search later, or let the Capture remain in the Review Inbox.

Capture must not wait for AI analysis. Correction must improve the Capture but must not be required to save it.

Capture latency is a core product constraint. The user should receive a Capture Receipt immediately and should be able to leave the source app without waiting for enrichment, intent inference, Collection suggestions, or Reminder suggestions.

## Cross-Platform Capture Constraints

The capture contract should follow the stricter iOS share-extension model so Android and iOS share the same reliable baseline.

The share surface should:

- accept URL, text, image, screenshot, or file payloads when provided by the source app
- store the payload or handoff reference durably
- create a Capture or local optimistic Capture
- show a Capture Receipt
- show lightweight Analysis State if available
- exit without requiring Capture Analysis, One-Tap Correction, Reminder setup, or Collection assignment

The share surface should not:

- run long Vision LLM or enrichment work locally
- depend on a long-lived extension process
- require the user to open the main app
- require a correction before saving
- require permissions during generic capture
- contain the full Review Inbox experience

Android may support smoother background work and app handoff, but MVP behavior should not depend on Android-only capture capabilities.

## Analysis States

MVP states:

- `queued`: Capture is durable but analysis has not started.
- `processing`: Capture Analysis is running.
- `ready`: analysis completed with a Default Intent and useful extracted data.
- `partial`: some useful data exists but one or more enrichment steps failed or timed out.
- `failed`: analysis could not produce useful data.
- `needs_review`: analysis completed but confidence is low or a user decision is needed.

## Capture Analysis

Capture Analysis should run in the backend first. It should be durable, retryable, and independent of whether the mobile app remains open.

Capture Analysis should follow the industry-standard layered enrichment pattern: accept the share/upload/paste payload immediately, then enrich server-side as best-effort using URL unfurling, content extraction, Visual Understanding, and AI classification. Sharebook must not require enrichment to succeed in order to keep the Capture.

Stages:

- Ingest: store raw payload, create Capture, and set Analysis State to queued.
- Normalize input: detect whether the Capture is a link, image, screenshot, social post, text note, or mixed payload.
- Fast enrichment: extract URL metadata, source, title, thumbnail, MIME type, shared text, and initial Platform Evidence.
- Vision and content extraction: use Visual Understanding, readable content extraction, transcript or caption extraction when available.
- Entity extraction: identify Captured Entities such as people, places, products, events, media, concepts, dates, prices, and actions.
- Analyzer Context selection: provide a bounded, relevant set of prior Captures, Reminders, Collections, and preference signals when those signals can improve interpretation.
- Intent inference: assign Default Intent from entities, Platform Evidence, Capture Context, source app, timestamp, and Analyzer Context.
- Reminder suggestion: propose Reminders when confidence is sufficient.
- Indexing: store searchable text, embeddings, entities, intent, and evidence.
- Finalize state: mark the Capture ready, partial, failed, or needs review.

Every stage should be independently retryable and allowed to produce partial results.

Analyzer Context should never be an unbounded dump of user history. Early prototypes may use small recent slices, but the durable design should use strict budgets, relevance-ranked retrieval, corrected intents, accepted or rejected Reminders, existing Collections, and compact preference summaries. Analyzer Context is weak evidence, not permission for the model to invent facts about the user.

Capture Analysis should produce structured output with confidence scores for Captured Entities, Save Intent, Reminder suggestions, and Suggested Actions. Structured confidence is required so Sharebook can debug bad guesses, decide when to show One-Tap Correction, and avoid false precision.

Confidence should shape the UI but should not be shown as numeric percentages to users. High confidence can quietly assign Default Intent, medium confidence can make One-Tap Correction more prominent, and low confidence can use `review later` or `needs_review`. Search should show match context rather than a confidence score.

## AI Model And Tooling Strategy

Sharebook should use a model router rather than hardcoded provider calls. Each AI task should record provider, model, prompt version, schema version, latency, token or image usage when available, and estimated cost.

Default model routing:

- `fast_text_intent`: cheap text-capable model for URL metadata, shared text, and low-risk intent classification.
- `vision_extraction`: Gemini 3.1 Flash-Lite as the first candidate for image and screenshot extraction because it is low cost, multimodal, current, and supports structured output.
- `local_vision_candidate`: MiniCPM-V 4.6 as an evaluation candidate for local or self-hosted screenshot/image extraction, especially privacy-sensitive or offline workflows.
- `vision_fallback`: OpenAI mini-class multimodal model when evaluation shows Gemini misses important entities or intents.
- `high_precision_review`: GPT-5.5, Gemini 3.5 Flash, Claude Sonnet, or another frontier model only for low-confidence, high-value, or eval-failing Captures where the extra cost is justified.
- `embeddings`: OpenAI `text-embedding-3-small` for MVP semantic search in pgvector.
- `url_metadata`: internal Open Graph, Twitter Card, canonical URL, favicon, and JSON-LD extraction before paying for a metadata API.
- `model_gateway_candidate`: OpenRouter as an evaluation and fallback gateway for comparing many hosted models quickly, not as a hard product dependency.

Open and smaller VLMs to evaluate:

- MiniCPM-V 4.6 for mobile/edge and privacy-sensitive screenshot extraction.
- Qwen3-VL 8B/32B for stronger open-weight OCR, GUI screenshot, document, and multilingual extraction when self-hosting is acceptable.
- InternVL small variants for open-source multimodal extraction benchmarks and possible UI/screenshot understanding.
- SmolVLM or Moondream for very lightweight local pre-classification, thumbnail understanding, or low-stakes entity recall.

These models should compete in the evaluation harness rather than be selected by reputation. The comparison should measure structured JSON validity, entity recall, entity precision, Default Intent accuracy, Reminder suggestion precision, latency, operational cost, and deployment complexity.

Model gateway policy:

- OpenRouter may be used to prototype model comparisons, access long-tail hosted models, and provide temporary fallback routing.
- Production code should call Sharebook's own model-router abstraction, not OpenRouter directly from product logic.
- Direct provider APIs should remain available for stable high-volume routes when they are cheaper, faster, or more predictable.
- OpenRouter's platform fee and provider variability should be treated as convenience cost, not hidden infrastructure.

AI outputs must be structured JSON, not prose-only responses. The structured result should include:

- detected Capture Type
- short summary
- Default Intent with confidence and rationale
- Captured Entities with type, confidence, and evidence
- Platform Evidence
- suggested Reminders with confidence and Reminder Rationale
- Suggested Actions
- search phrases
- needs-review flag

Extraction rules:

- Every Captured Entity should include evidence when possible.
- AI may suggest Reminders, but user confirmation is required before scheduling.
- Low-confidence intent should become `review later` or `needs_review`, not a forced precise category.
- Do not rerun expensive vision analysis unless the model, prompt, schema, or source payload changed.
- Store analysis results and embeddings with model and prompt versions so changes are measurable in the evaluation harness.

Precision and recall policy:

- Favor recall for search indexing: it is acceptable to extract extra candidate entities and search phrases when they are marked with confidence and evidence, because missed entities make Captures hard to find later.
- Favor precision for Default Intent: a wrong strong intent is worse than a weak fallback, so low-confidence intent should use `review later` or surface One-Tap Correction.
- Favor very high precision for Reminder suggestions: reminders are interruption-prone, so AI should suggest fewer reminders with clear Reminder Rationale rather than many speculative reminders.
- Escalate to `high_precision_review` only when the expected product value exceeds the cost, such as low-confidence screenshots with dates/places, captures linked to active Reminders, or evaluation fixtures that repeatedly fail cheaper models.

Deferred tools:

- OpenGraph.io or similar metadata APIs may be added if internal URL unfurling is unreliable.
- Firecrawl, Jina Reader, or similar web extraction tools may be added if public-page extraction becomes central.
- Mistral OCR or document-specialized extraction may be added if PDFs/documents become a major Capture Type.
- On-device AI remains deferred for privacy-sensitive or offline analysis after the backend-first workflow proves value. MiniCPM-V 4.6 is the first local vision model to evaluate because it is small, open-weight, multimodal, and designed for mobile/edge deployment.

Expected UX:

- Capture Receipt feels immediate.
- Fast pass should usually complete within a few seconds.
- Deep pass may take longer but must not block saving.

## Source Availability

Sharebook should preserve the Capture, Save Intent, Context Note, user-provided assets, and Platform Evidence even when the original source link later becomes unavailable.

MVP should keep:

- original shared URL when present
- user-provided screenshot, image, text, or uploaded asset
- extracted metadata and Platform Evidence
- inferred and corrected Save Intent
- Reminder history and Reminder Rationale

MVP should not promise durable snapshots of every linked page or social post. Page snapshots for public web links may be added later, but broad social-post archiving should not be an MVP requirement.

If a source can no longer be opened, Sharebook should show that the source is unavailable rather than silently failing.

## Intent Categories

Initial Intent Categories:

- watch later
- read later
- try place
- buy later
- cook or make
- send or share
- plan trip or event
- compare or research
- use as reference
- remember fact
- review later

These are action-oriented intent choices, not a tag taxonomy.

`review later` is the safe fallback when Capture Analysis cannot infer a stronger Save Intent. It should prevent false precision, not become the default bucket for all Captures.

## One-Tap Correction

One-Tap Correction should happen in the Capture Receipt sheet when analysis is ready, but the sheet must be dismissible.

If the user dismisses before analysis completes, the Capture should be saved with its Default Intent and remain available in the Review Inbox.

The correction UI should separate:

- Intent Category chips, which modify Save Intent.
- Suggested Actions, which act on the Capture after intent is known.
- Context Note, which is optional free text for nuance the chips cannot express.

## Suggested Actions

Suggested Actions should be derived from Save Intent and Captured Entities.

Examples:

- For `try place`: open in maps, add Reminder, add to trip, mark tried.
- For `watch later`: set time Reminder, open source, mark watched.
- For `buy later`: compare, price check later, set Reminder.
- For `send or share`: choose person, send link, set follow-up Reminder.
- For `plan trip or event`: add to trip, set trip Reminder, create checklist.
- For `compare or research`: add related Capture, create decision note.

## Reminders

Reminder is first-class, not a property on Capture.

A Capture may have zero, one, or many Reminders. A Reminder may refer to one or more Captures.

AI may suggest Reminders, but the user must confirm before a Reminder is scheduled. Sharebook should not create notification obligations without explicit user action.

A Reminder should include a Reminder Rationale: a short explanation of why the Capture is resurfacing, derived from Save Intent, Capture Context, or Context Note. The notification motif is: "Here is the thing you saved, and here is why you wanted it."

MVP trigger types:

- specific time
- relative time
- place
- event or trip

Later trigger types:

- person context
- recurring seasonality
- price or availability change
- weak contextual relevance

Reminder status:

- scheduled
- due
- completed
- dismissed
- snoozed
- cancelled

When a Reminder fires, the user should be able to complete it, dismiss it, archive the linked Capture when appropriate, or reschedule the Reminder for a later trigger.

## Review Inbox

The Review Inbox is the home for Captures that have been saved, analyzed, corrected, searched, or acted on.

It should support:

- all Captures
- Analysis State visibility
- inferred Save Intent
- One-Tap Correction
- optional Context Note
- search
- Reminder creation
- Suggested Actions
- basic filters by Intent Category, Capture Type, and Reminder state

Avoid making the Review Inbox feel like folders or manual bookmark management.

## Collections

Collection is a first-class grouping object for related Captures. Plan is not first-class for MVP.

A Collection may represent a trip, research topic, purchase decision, event, recipe queue, project, or loose area of interest. Collections should link Captures by shared purpose without requiring dates, completion state, itinerary structure, or task-management behavior.

Examples:

- SF trip
- AI memory app research
- desk setup
- wedding outfit
- restaurants to try
- recipes to make

A Capture may belong to zero, one, or many Collections. A Collection may be created explicitly by the user or suggested by Sharebook from repeated Captured Entities, Save Intents, or Capture Context.

Collections should not replace Save Intent. A Capture in `SF trip` can still have a Save Intent like `try place`, `watch later`, or `compare or research`.

Collection creation and attachment should be hybrid: Sharebook may suggest Collections, but the user should confirm before creating a new Collection or attaching a Capture to one. Existing Collections may appear as lightweight chips during capture review.

## Search

Search should support fuzzy memory queries using hybrid retrieval: keyword search, structured filters, vector retrieval, and Intent Graph or entity boosting.

Search should retrieve against:

- title and source text
- extracted visual text
- URL metadata
- Captured Entities
- Save Intent
- Context Note
- Platform Evidence
- semantic embeddings

Example queries:

- "that ramen place near SoHo"
- "video Maya sent me"
- "jacket I wanted to compare"
- "place for SF trip"
- "recipe from Instagram with miso"
- "visa document checklist"

Search results should explain why a Capture matched when possible. Match context should include the strongest signals, such as matching entity, Save Intent, source app, Context Note, or Platform Evidence.

## Data Model Sketch

This is a product data model, not a database schema.

Capture:

- id
- capture type
- source app
- source URI or uploaded asset
- title
- thumbnail
- created at
- capture state
- analysis state
- default intent
- current save intent
- context note
- analysis provider
- analysis model version
- analysis prompt version
- analysis schema version
- analysis latency
- analysis token or image usage
- analysis cost estimate

Captured Entity:

- id
- entity type
- display name
- canonical reference when available
- confidence

Capture Context:

- capture id
- source app
- timestamp
- shared text
- local client hints
- optional location or calendar context when permissioned
- one-tap correction history

Analyzer Context:

- current date/time and timezone
- relevant prior capture summaries
- corrected Save Intents
- accepted and rejected Reminder signals
- existing Collections and likely Collection matches
- compact preference summaries when repeated behavior supports them

Platform Evidence:

- capture id
- evidence type
- raw or structured value
- source
- confidence

Reminder:

- id
- trigger type
- trigger value
- status
- linked capture ids
- linked entity ids
- reminder intent
- reminder rationale
- created at
- due at when applicable

Intent Graph:

- captures
- captured entities
- save intents
- reminders
- collections
- platform evidence
- relationships and confidence scores

## Privacy And Permissions

Sharebook should request only the permissions needed for the current workflow.

Sharebook should retain the raw original Capture by default because users expect to reopen what they saved. Extracted text, entities, Platform Evidence, and embeddings should remain tied to the Capture lifecycle.

Capture State:

- `active`: available in the normal Review Inbox and search.
- `archived`: hidden from active inbox views by default but still searchable and visibly marked as archived.
- `deleted`: removes the Capture and associated extracted data.

Archived Captures should remain searchable. Deleted Captures should not.

MVP should avoid requiring calendar, location, contacts, or background access on first use. These should be introduced only when the user asks for a feature that clearly needs them.

Suggested permission order:

1. Share/upload/paste with no broad device permissions.
2. Notifications when the user creates the first Reminder.
3. Location only for place-based Reminders.
4. Calendar only for event/trip-aware Reminders.
5. Contacts only for person-based actions.

Location may be a core feature, but the system location prompt should be requested just-in-time from a location-powered action such as `Remind when nearby`, not during generic onboarding. Sharebook should prefer foreground or while-in-use location first, avoid background location until the feature clearly requires it, and offer time-based Reminders as a fallback when location is denied or skipped.

## Success Metrics

Activation:

- user creates first Capture
- Capture Analysis reaches ready or partial state
- user sees inferred Save Intent

Habit:

- captures per week
- share-sheet repeat usage
- review inbox return rate

Quality:

- Default Intent acceptance rate
- One-Tap Correction rate
- failed or partial analysis rate
- search success rate

Action:

- Reminders created per active user
- Reminder completion rate
- Captures opened from Reminder
- Captures found through search

Retention:

- weekly active capturers
- captures acted on after 24 hours
- captures acted on after 7 days

## Evaluation Harness

Sharebook should include an internal evaluation harness for Capture Analysis before the product has enough real usage data.

The evaluation set should include:

- sample screenshots
- sample images
- sample links
- sample social-post share payloads
- ambiguous or low-context Captures

Each fixture should define expected or acceptable outputs:

- Capture Type
- main Captured Entities
- Default Intent
- acceptable alternate Intent Categories
- Reminder suggestion when appropriate
- Collection suggestion when appropriate
- search queries that should match

The goal is not perfect labeling. The goal is to make changes to prompts, models, and enrichment code measurable.

## Open Questions

- How should Sharebook evaluate broad image/link understanding without turning the MVP into a fully general second brain?
- What minimum Platform Evidence can be reliably captured from Android share targets and iOS share extensions across Instagram, TikTok, Reddit, YouTube, Maps, and browsers?
- How should Sharebook suggest Collections without recreating folder-management friction?
- How should Sharebook source and maintain a representative evaluation set without scraping private platform data?
- Should Sharebook support "keep memory, delete original" as a later privacy mode?
