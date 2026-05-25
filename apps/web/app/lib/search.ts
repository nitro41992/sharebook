import { intentLabels, parseQuickEdit } from "@sharebook/shared";

type SupabaseAdminClient = ReturnType<
  typeof import("./supabase-server").createSupabaseAdminClient
>;

type RelatedEntity = {
  display_name?: string | null;
  entity_type?: string | null;
  evidence?: string | null;
};

type RelatedEvidence = {
  evidence_type?: string | null;
  value?: string | null;
};

type RelatedSearchDocument = {
  id?: string;
  document?: string | null;
};

export type SearchableCapture = {
  id: string;
  capture_type?: string | null;
  source_app?: string | null;
  source_url?: string | null;
  source_text?: string | null;
  title?: string | null;
  display_title?: string | null;
  thumbnail_url?: string | null;
  capture_state?: string | null;
  analysis_state?: string | null;
  default_intent?: string | null;
  current_save_intent?: string | null;
  intent_rationale?: string | null;
  context_note?: string | null;
  created_at?: string | null;
  captured_entities?: RelatedEntity[] | null;
  platform_evidence?: RelatedEvidence[] | null;
  search_documents?: RelatedSearchDocument[] | null;
};

export type CaptureSearchResult = {
  id: string;
  capture_id: string;
  document: string;
  capture: SearchableCapture;
  captures: SearchableCapture;
  match_context: string;
  match_signal: string;
  score: number;
};

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

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((term) => term.length >= 2);
}

function fieldMatchScore(query: string, terms: string[], value: string) {
  const haystack = value.toLowerCase();
  if (!haystack) return 0;
  if (haystack.includes(query.toLowerCase())) return 4;
  if (terms.length && terms.every((term) => haystack.includes(term))) return 3;
  if (terms.some((term) => haystack.includes(term))) return 1;
  return 0;
}

function expandedQueryTerms(query: string) {
  const parsed = parseQuickEdit(query);
  return {
    parsedIntent: parsed.intent ?? null,
    terms: queryTerms(query)
  };
}

function matchCapture(
  capture: SearchableCapture,
  query: string,
  documents: RelatedSearchDocument[] = []
) {
  const { parsedIntent, terms } = expandedQueryTerms(query);
  const fields: Array<{ label: string; value: string; weight: number }> = [
    { label: "title", value: asText(capture.display_title || capture.title), weight: 8 },
    { label: "source URL", value: asText(capture.source_url), weight: 7 },
    { label: "source text", value: asText(capture.source_text), weight: 6 },
    { label: "source app", value: asText(capture.source_app), weight: 4 },
    { label: "Save Intent", value: asText(capture.current_save_intent || capture.default_intent), weight: 5 },
    {
      label: "Save Intent label",
      value: parsedIntent
        ? intentLabels[parsedIntent]
        : asText(capture.current_save_intent || capture.default_intent).replace(/_/g, " "),
      weight: 5
    },
    { label: "intent rationale", value: asText(capture.intent_rationale), weight: 4 },
    { label: "Context Note", value: asText(capture.context_note), weight: 5 },
    ...((capture.captured_entities ?? []).flatMap((entity) => [
      {
        label: `entity${entity.entity_type ? ` (${entity.entity_type})` : ""}`,
        value: asText(entity.display_name),
        weight: 7
      },
      { label: "entity evidence", value: asText(entity.evidence), weight: 4 }
    ])),
    ...((capture.platform_evidence ?? []).map((evidence) => ({
      label: evidence.evidence_type ? `Platform Evidence (${evidence.evidence_type})` : "Platform Evidence",
      value: asText(evidence.value),
      weight: 5
    }))),
    ...documents.map((document) => ({
      label: "analysis search document",
      value: asText(document.document),
      weight: 3
    }))
  ];

  let best: { label: string; value: string; score: number } | null = null;
  if (
    parsedIntent &&
    (capture.current_save_intent === parsedIntent || capture.default_intent === parsedIntent)
  ) {
    best = {
      label: "Save Intent",
      value: intentLabels[parsedIntent],
      score: 36
    };
  }
  for (const field of fields) {
    const score = fieldMatchScore(query, terms, field.value);
    if (score > 0 && (!best || score * field.weight > best.score)) {
      best = {
        label: field.label,
        value: field.value,
        score: score * field.weight
      };
    }
  }

  if (!best) return null;
  return {
    score: best.score,
    match_signal: best.label,
    match_context: `Matched ${best.label}: ${best.value.slice(0, 180)}`
  };
}

function resultFromCapture(input: {
  capture: SearchableCapture;
  query: string;
  document?: RelatedSearchDocument | null;
  baseScore?: number;
}) {
  const documents = [
    ...(input.document ? [input.document] : []),
    ...(input.capture.search_documents ?? [])
  ];
  const match = matchCapture(input.capture, input.query, documents);
  if (!match) return null;
  const documentText = input.document?.document || input.capture.search_documents?.[0]?.document || "";
  return {
    id: input.document?.id || input.capture.id,
    capture_id: input.capture.id,
    document: documentText,
    capture: input.capture,
    captures: input.capture,
    match_context: match.match_context,
    match_signal: match.match_signal,
    score: match.score + (input.baseScore ?? 0)
  };
}

export async function searchCapturesForUser(
  supabase: SupabaseAdminClient,
  input: { userId: string; query: string; limit?: number }
): Promise<CaptureSearchResult[]> {
  const query = input.query.trim();
  if (!query) return [];

  const results = new Map<string, CaptureSearchResult>();

  const fullText = await supabase
    .from("search_documents")
    .select("id, capture_id, document, captures(*)")
    .eq("user_id", input.userId)
    .textSearch("document", query, {
      type: "websearch",
      config: "english"
    })
    .limit(input.limit ?? 20);

  if (!fullText.error) {
    for (const row of fullText.data ?? []) {
      const joined = row.captures as unknown;
      const capture = (Array.isArray(joined) ? joined[0] : joined) as SearchableCapture | null;
      if (!capture || capture.capture_state === "deleted") continue;
      const result = resultFromCapture({
        capture,
        query,
        document: { id: row.id, document: row.document },
        baseScore: 30
      });
      if (result) results.set(result.capture_id, result);
    }
  }

  const fallback = await supabase
    .from("captures")
    .select(
      `
      *,
      captured_entities(*),
      platform_evidence(*),
      search_documents(*)
    `
    )
    .eq("user_id", input.userId)
    .neq("capture_state", "deleted")
    .order("created_at", { ascending: false })
    .limit(100);

  if (fallback.error) throw fallback.error;

  for (const capture of (fallback.data ?? []) as SearchableCapture[]) {
    const result = resultFromCapture({ capture, query });
    if (!result) continue;
    const existing = results.get(result.capture_id);
    if (!existing || result.score > existing.score) results.set(result.capture_id, result);
  }

  return [...results.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit ?? 20);
}
