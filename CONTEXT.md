# Sharebook

Sharebook is an AI save layer for links, screenshots, posts, and notes. It preserves the user's reason for saving something so the capture can be found, understood, and acted on later.

## Language

**Capture**:
A saved screenshot, link, social post, note, or shared item that may contain people, places, things, and intent.
_Avoid_: Bookmark, link, item

**Capture Type**:
The form in which a Capture entered Sharebook, such as link, screenshot, social post, image, text note, voice note, email, location pin, or browser session.
_Avoid_: Source, category

**Save Intent**:
The user's likely reason for creating a Capture at that moment, such as watch later, try this place, buy this product, send to someone, compare options, or use as reference.
_Avoid_: Summary, tag, category

**Default Intent**:
The Save Intent Sharebook assigns when Capture Analysis finishes and the user does not apply One-Tap Correction or add a Context Note.
_Avoid_: Unconfirmed tag, uncategorized

**Intent Category**:
A small canonical Save Intent option used for Default Intent assignment and One-Tap Correction.
_Avoid_: Tag taxonomy, folder structure

**Captured Entity**:
A person, place, product, event, media object, concept, or other meaningful thing extracted from a Capture.
_Avoid_: Keyword, tag

**Platform Evidence**:
Optional source-specific details preserved from the capture surface, such as creator, caption, transcript, comment text, collection name, sender, post type, or URL metadata.
_Avoid_: Required platform metadata, full integration data

**Explicit Capture**:
A user-initiated act of adding something to Sharebook through share sheet, upload, paste, drag-and-drop, or manual entry.
_Avoid_: Automatic import, background scraping

**Capture Receipt**:
The immediate acknowledgement that Sharebook has accepted an Explicit Capture before analysis is complete.
_Avoid_: Processing result, final save state

**Capture Analysis**:
The background process that uses source data, Platform Evidence, Visual Understanding, and Capture Context to infer Captured Entities and Save Intent.
_Avoid_: Upload, OCR pass, summary generation

**Analysis State**:
The visible lifecycle of Capture Analysis for a Capture, such as queued, processing, ready, partial, failed, or needs review.
_Avoid_: Loading flag, spinner state

**Capture Surface**:
An interface where the user creates an Explicit Capture, such as a mobile share extension, Android share target, upload form, paste box, drag-and-drop area, or manual entry.
_Avoid_: Importer, scraper

**Review Inbox**:
The surface where users review Captures, inspect inferred Save Intent, apply One-Tap Correction, add Context Notes, search, and create Reminders.
_Avoid_: Bookmark list, folder

**Capture Context**:
The surrounding signals available when a Capture is created, such as source app, share text, screenshot content, timestamp, collection name, sender, calendar context, travel context, location, or a one-tap correction.
_Avoid_: Metadata, note

**Analyzer Context**:
A bounded set of relevant prior Captures, Reminders, Collections, and preference signals made available to Capture Analysis so Sharebook can interpret the current Capture without reading the user's full history.
_Avoid_: Raw history, memory dump, prompt history

**One-Tap Correction**:
An optional lightweight user action that confirms or changes the inferred Save Intent without requiring typing.
_Avoid_: Required tagging, manual categorization

**Suggested Action**:
An optional next step proposed after Save Intent is inferred or corrected, such as setting a Reminder, opening a map, sending to a person, adding to a trip, or marking done.
_Avoid_: Intent chip, category chip

**Context Note**:
Optional free text added by the user when One-Tap Correction is not expressive enough.
_Avoid_: Required rationale, mandatory note

**Visual Understanding**:
Interpretation of screenshot or image content as people, places, things, scenes, UI state, and implied meaning.
_Avoid_: OCR, image text extraction

**Intent Graph**:
The lightweight network of Captures, Captured Entities, Capture Context, and Save Intents that explains what the user saved and why it may matter later.
_Avoid_: Knowledge graph, database, collection

**Collection**:
A user- or system-created grouping of Captures that share an ongoing purpose, such as a trip, purchase decision, research topic, event, recipe queue, or project.
_Avoid_: Folder, plan

**Reminder**:
A first-class prompt to resurface one or more Captures at a specific time, relative time, location, event, or other future context.
_Avoid_: Notification setting, capture property

**Reminder Rationale**:
The short reason shown with a Reminder that explains why the Capture is being resurfaced, derived from Save Intent, Capture Context, or Context Note.
_Avoid_: Generic notification text, AI nudge

**Capture State**:
The user's lifecycle state for a Capture, such as active, archived, or deleted.
_Avoid_: Folder, category

**Reschedule**:
The action of moving an existing Reminder to a later time, place, event, or context after it has fired or before it is due.
_Avoid_: Re-remind

## Example Dialogue

Product: "The user saved this Instagram reel, but the transcript only says it is about ramen."

Domain Expert: "That is the content summary, not the Save Intent. The Save Intent might be 'try this restaurant next time I am in SoHo'."

Product: "So the Capture should keep the reel, the restaurant, the neighborhood, the creator, and the inferred reason?"

Domain Expert: "Yes. The user should later be able to search 'that ramen place near SoHo' or get reminded when the place becomes relevant."

Product: "Do we need to normalize every possible field from Instagram, TikTok, Reddit, YouTube, and Maps?"

Domain Expert: "No. Normalize the Capture, Captured Entities, Save Intent, and Reminder. Preserve source-specific details as Platform Evidence when available, but do not make complete platform metadata a product requirement."

Product: "Should Sharebook pull everything the user has saved inside other apps?"

Domain Expert: "Not at first. Sharebook should begin with Explicit Capture through share sheet, upload, paste, drag-and-drop, or manual entry."

Product: "Should saving wait until AI processing is complete?"

Domain Expert: "No. Sharebook should show a Capture Receipt immediately, then run Capture Analysis in the background and reveal inferred intent with One-Tap Correction when ready."

Product: "What happens if the user closes the app after capture?"

Domain Expert: "The Capture must survive app closure. Capture Analysis should continue in the backend or resume from a durable queue, and the Review Inbox should show the Analysis State when the user returns."

Product: "What happens if the user dismisses the receipt sheet or ignores the correction chips?"

Domain Expert: "Sharebook should save the Capture with its Default Intent. Correction is optional, not a prerequisite for saving."

Product: "Where should the MVP live?"

Domain Expert: "Start with a mobile-first Capture Surface through the phone share workflow and a Review Inbox for correction, search, and reminders."

Product: "How many intent choices should users see?"

Domain Expert: "Keep Intent Categories small and action-oriented: watch later, read later, try place, buy later, cook or make, send or share, plan trip or event, compare or research, use as reference, remember fact, and review later."

Product: "Should the user have to explain the reason while saving?"

Domain Expert: "No. Sharebook should infer Save Intent from Capture Context first, then allow One-Tap Correction or an optional Context Note when the guess is wrong or incomplete."

Product: "Can Capture Analysis look at everything the user has saved before?"

Domain Expert: "No. Use Analyzer Context: a bounded, relevant set of prior signals. The point is to improve interpretation, not to paste the user's whole history into every analysis."

Product: "Are the save-intent chips the same as action chips?"

Domain Expert: "No. One-Tap Correction changes why Sharebook thinks the user saved the Capture. Suggested Actions come after that and help the user act on the Capture."

Product: "Is this a knowledge graph?"

Domain Expert: "Call it an Intent Graph. The point is not to model all knowledge; the point is to preserve what the user cared about and the action it may support."

Product: "Should trips or projects become Plans?"

Domain Expert: "No. Use Collections to link related Captures. A trip, research topic, or purchase decision can be a Collection without becoming a first-class Plan."

Product: "What should a reminder feel like?"

Domain Expert: "A Reminder should say what is resurfacing and why the user wanted it, not just ping that something might be relevant."

Product: "What if a Capture is no longer active but should remain searchable?"

Domain Expert: "Archive the Capture. Archived Captures should remain searchable and visibly archived, while deleted Captures should remove the Capture and associated extracted data."
