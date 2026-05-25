# Sharebook Consumer Redesign Wireframes

These are low-fidelity product wireframes for shared understanding. They describe structure and flow, not final visual style.

## 1. Zero-Capture Today

Purpose: turn an empty product into the first successful Capture.

```text
Today
--------------------------------------------------

Save something you want to remember

[ Share from another app ]        primary

[ Paste link ]  [ Add note ]  [ Upload image ]

How it works
Saved things come back by meaning, place, or time.

Recent
No captures yet
```

Notes:

- The primary action teaches native share.
- Fallback actions are available without burying the user.
- No fake feed, fake examples, or dashboard metrics.

## 2. Capture Sheet

Purpose: in-app fallback capture, not the main native share path.

```text
Capture
--------------------------------------------------

Copied link found
https://example.com/restaurant-reel

[ Save copied link ]

or

[ Paste link or text............................ ]

[ Add note ]
[ Upload screenshot or photo ]

First time?
Share from Instagram, TikTok, Maps, Safari, or Photos.
```

Notes:

- Smart paste detection should reduce effort.
- First-run share help can disappear after activation.

## 3. Capture Receipt

Purpose: prove the save happened immediately.

```text
Saved to Sharebook
--------------------------------------------------

Restaurant reel
instagram.com/...

Analyzing in background
[ progress line ]

[ Done ]
[ Quick edit ]        optional, not required
```

Notes:

- The receipt is not the final analysis result.
- User can leave immediately.

## 4. Background Progress And Completion

Purpose: Blip-like background handoff.

```text
Notification while processing
--------------------------------------------------
Sharebook
Analyzing saved reel...

Completion notification
--------------------------------------------------
Sharebook
Ready to review: ramen place in SoHo
Try place, SF restaurants, reminder suggested
```

Notes:

- Completion notification is not a Reminder.
- Notification permission can be requested after first successful Capture.

## 5. Quick Edit

Purpose: make correction feel like editing meaning, not filling a form.

```text
Saved
--------------------------------------------------

Ramen reel from Instagram

Saved as [ try this place ] in [ NYC restaurants ].

Reminder suggested: [ next Saturday afternoon ].

Because: restaurant and neighborhood found in the reel.

[ Accept ]        [ Change ]        [ Dismiss ]

View details
```

Expanded chip behavior:

```text
Saved as
[ try this place ] [ send/share ] [ plan trip ] [ review later ]

Collection
[ NYC restaurants ] [ Japan trip ] [ New collection... ]

Reminder
[ Accept Saturday ] [ Change time ] [ No reminder ]
```

Notes:

- Default surface is sentence-like.
- Chips can expand into small pickers.
- Entities support the decision but are not the editing task.

## 6. Today With One Capture

Purpose: show the app becoming useful after activation.

```text
Today
--------------------------------------------------

Needs a quick look
[ Ramen reel ]
try this place | reminder suggested | NYC restaurants

Recently saved
[ Ramen reel ]  Ready

Coming up
No confirmed reminders

Nearby or places
1 saved place
```

Notes:

- Today combines freshness, review needs, and relevant resurfacing.
- Inbox can appear as a badge or module, not necessarily a bottom tab.

## 7. Library

Purpose: organized memory, not a filing cabinet.

```text
Library
--------------------------------------------------

[ All ] [ Map ] [ Agenda ] [ Collections ] [ Archived ]

All
--------------------------------------------------
[ Ramen reel ]        try this place
[ Chair screenshot ]  buy later
[ Article ]           read later
```

Map lens:

```text
Library / Map
--------------------------------------------------

[ map ]

Saved places near view
[ Ramen place, SoHo ]   1 capture
[ Hotel idea ]          2 captures
```

Agenda lens:

```text
Library / Agenda
--------------------------------------------------

Confirmed
Saturday
[ Try ramen place ]     confirmed reminder

Suggestions
[ Concert poster has date ]   review
```

Notes:

- Map shows captured places, not location history.
- Agenda shows confirmed reminders separately from suggestions.

## 8. Search

Purpose: fuzzy-memory retrieval and power filtering.

```text
Search
--------------------------------------------------

[ that ramen place near soho.................... ]

Filters
[ Intent ] [ Collection ] [ Entity ] [ Place ] [ Time ]

Results
--------------------------------------------------
[ Ramen reel ]
Matched place: SoHo
Intent: try this place
Source: Instagram

[ NYC restaurants collection ]
3 captures
```

Command-like examples:

```text
intent:try place
collection:NYC restaurants
place:SoHo
time:next weekend
entity:ramen
```

Notes:

- Search starts as a search box with explainable results.
- Commands are filters, not a chatbot default.

