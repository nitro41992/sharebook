# Use Bounded Analyzer Context

Sharebook will give Capture Analysis a bounded Analyzer Context instead of an ever-growing dump of prior Captures, Reminders, and Collections. The first implementation may use small recent slices to prove the path, but the durable product decision is that future context should be selected by relevance, accepted user actions, existing Collections, and compact preference summaries under a strict budget. This preserves the benefit of memory while avoiding noisy prompts, rising model cost, privacy surprises, and brittle behavior as user history grows.

## Considered Options

- Pass all user history into analysis. Rejected because it grows without bound and makes every analysis slower, costlier, noisier, and harder to reason about.
- Pass only the most recent history forever. Rejected because recency is useful for early dogfooding but misses older relevant patterns and includes irrelevant recent activity.
- Pass bounded, relevant Analyzer Context. Accepted because it lets Sharebook use prior Reminders, corrected intents, and existing Collections while keeping Capture Analysis predictable.

## Consequences

Analyzer Context should remain an internal input to Capture Analysis, not a new user-facing schema. Over time, Sharebook should move from fixed recent slices to ranked retrieval and compact preference summaries, prioritizing accepted Reminders, corrected Save Intents, manually created Collections, and repeated behavior over one-off model suggestions.
