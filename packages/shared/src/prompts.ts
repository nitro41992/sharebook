import { intentCategories } from "./domain";

export const ANALYSIS_SCHEMA_VERSION = "capture-analysis-v3";
export const ANALYSIS_PROMPT_VERSION = "phase-0d-context-2026-05-24";

export type AnalyzerUserContext = {
  currentDateTime: string;
  timezone: string;
  recentCaptures: Array<{
    title: string | null;
    intent: string | null;
    context_note: string | null;
    entities: string[];
    created_at: string | null;
  }>;
  priorReminders: Array<{
    capture_title: string | null;
    capture_intent: string | null;
    trigger_type: string | null;
    trigger_value: string | null;
    rationale: string | null;
    status: "accepted" | "rejected" | "suggested";
    confidence: number | null;
    created_at: string | null;
  }>;
  existingCollections: Array<{
    id: string;
    name: string;
    rationale: string | null;
    created_by: string | null;
  }>;
  recentCollectionSuggestions: Array<{
    name: string;
    rationale: string | null;
    capture_title: string | null;
    capture_intent: string | null;
    confidence: number | null;
  }>;
};

export function buildCaptureAnalysisPrompt(input: {
  sourceApp?: string | null;
  url?: string | null;
  text?: string | null;
  urlMetadata?: Record<string, string | null> | null;
  userContext?: AnalyzerUserContext | null;
}) {
  return [
    "You are Sharebook's Capture Analysis engine.",
    "Infer why the user saved this capture, not just what the content says.",
    "Follow the provided structured output schema exactly.",
    "",
    "Definitions:",
    "- Save Intent: the user's likely reason for saving this capture.",
    "- Captured Entity: a person, place, product, event, media object, concept, date, price, action, organization, or other meaningful thing.",
    "- Reminder Rationale: a short reason explaining why a future reminder would be useful.",
    "",
    "Intent categories:",
    intentCategories.map((category) => `- ${category}`).join("\n"),
    "",
    "Trust rules:",
    "- Favor precision for default intent. Use review_later when uncertain.",
    "- Choose default_intent from the user's likely next action, not the content format. A product or outfit is usually buy_later or compare_or_research; a place is try_place; a time-bound ticket, invite, or trip is plan_trip_or_event only when it is still actionable.",
    "- If an event, ticket, trip, deal, or deadline is in the past relative to the current date, do not suggest future reminders for it. Prefer remember_fact or use_as_reference when the user likely saved it as a record.",
    "- Write display_title as a short, scannable title under 90 characters.",
    "- Favor recall for entities and search phrases, but include confidence and evidence.",
    "- Always include every schema field. Use null for unknown normalized_name and empty arrays when no entries exist.",
    "- Suggest reminders only when there is a concrete future time, place, event, trip, sale window, deadline, or clear follow-up reason.",
    "- Time reminder suggestions for the useful decision window. For a sale or event, prefer during or before the window rather than after it unless the capture explicitly calls for follow-up afterward.",
    "- Suggested actions must have a specific user-facing label and rationale. Do not emit duplicate generic actions like Open source.",
    "- Do not suggest making, building, cooking, or DIY actions unless the capture or user context gives evidence that the user wants to do that work.",
    "- Suggested collection names should be more specific than the intent category. Avoid names like Watch later, Buy later, Read later, or Try place.",
    "- Do not invent names, prices, dates, or places without evidence.",
    "",
    "User context rules:",
    "- Treat user context as weak preference evidence, not as fact about this capture.",
    "- Use prior reminders to notice recurring timing preferences only when there is repeated evidence.",
    "- Prefer an existing collection when it fits. Avoid inventing near-duplicate collections with slightly different names.",
    "- Use existing and recent collection names as naming guidance, but never force a capture into an unrelated collection.",
    "",
    "Capture context:",
    JSON.stringify(
      {
        source_app: input.sourceApp ?? null,
        url: input.url ?? null,
        text: input.text ?? null,
        url_metadata: input.urlMetadata ?? null
      },
      null,
      2
    ),
    "",
    "User context:",
    JSON.stringify(input.userContext ?? null, null, 2)
  ].join("\n");
}
