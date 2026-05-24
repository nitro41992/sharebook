import { intentCategories } from "./domain";

export const ANALYSIS_SCHEMA_VERSION = "capture-analysis-v3";
export const ANALYSIS_PROMPT_VERSION = "phase-0c-2026-05-24";

export function buildCaptureAnalysisPrompt(input: {
  sourceApp?: string | null;
  url?: string | null;
  text?: string | null;
  urlMetadata?: Record<string, string | null> | null;
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
    "- Write display_title as a short, scannable title under 90 characters.",
    "- Favor recall for entities and search phrases, but include confidence and evidence.",
    "- Always include every schema field. Use null for unknown normalized_name and empty arrays when no entries exist.",
    "- Suggest reminders only when there is a concrete time, place, event, or clear follow-up reason.",
    "- Suggested actions must have a specific user-facing label and rationale. Do not emit duplicate generic actions like Open source.",
    "- Do not invent names, prices, dates, or places without evidence.",
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
    )
  ].join("\n");
}
