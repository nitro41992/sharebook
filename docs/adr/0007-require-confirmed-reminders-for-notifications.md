# Require Confirmed Reminders For Notifications

Sharebook will send future resurfacing notifications only for Confirmed Reminders: reminders the user explicitly created, accepted from a suggestion, or enabled through a permissioned contextual trigger such as time, place, event, or trip context. AI may suggest reminder-worthy moments, but suggestions are not notification obligations until the user accepts them. Sharebook may separately send Capture Completion Notifications after background Capture Analysis finishes.

## Considered Options

- Notify for every AI-curated review opportunity. Rejected because unsolicited prompts can erode trust before reminder quality is proven.
- Notify only for manually typed time reminders. Rejected because it prevents the product from using high-confidence place, event, and trip triggers once the user asks for them.
- Require Confirmed Reminders for notification delivery. Accepted because it preserves trust while leaving room for contextual reminders that are explicitly permissioned.

## Consequences

Reminder suggestions remain separate from Reminders in the data model. Notification permission may be requested after the first successful Capture for Capture Analysis progress and completion, and Reminder notification copy should include the Capture and the Reminder Rationale so the user understands why the item resurfaced. Location/calendar permissions should be requested only from actions that clearly need them.
