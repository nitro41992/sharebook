export function buildSearchDocument(input: {
  title?: string | null;
  sourceText?: string | null;
  summary?: string | null;
  intent?: string | null;
  contextNote?: string | null;
  entities?: Array<{ name: string; type: string }>;
  searchPhrases?: string[];
}) {
  return [
    input.title,
    input.sourceText,
    input.summary,
    input.intent,
    input.contextNote,
    ...(input.entities ?? []).map((entity) => `${entity.type}: ${entity.name}`),
    ...(input.searchPhrases ?? [])
  ]
    .filter(Boolean)
    .join("\n");
}
