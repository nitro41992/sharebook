import { intentCategories } from "./domain";

export const ANALYSIS_SCHEMA_VERSION = "capture-analysis-v1";
export const ANALYSIS_PROMPT_VERSION = "phase-0a-2026-05-23";

export function buildCaptureAnalysisPrompt(input: {
  sourceApp?: string | null;
  url?: string | null;
  text?: string | null;
  urlMetadata?: Record<string, string | null> | null;
}) {
  return [
    "You are Sharebook's Capture Analysis engine.",
    "Infer why the user saved this capture, not just what the content says.",
    "Return only strict JSON matching the provided schema.",
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
    "- Favor recall for entities and search phrases, but include confidence and evidence.",
    "- Suggest reminders only when there is a concrete time, place, event, or clear follow-up reason.",
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
