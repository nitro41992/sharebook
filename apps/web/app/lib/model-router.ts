import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SCHEMA_VERSION,
  buildCaptureAnalysisPrompt,
  CaptureAnalysis,
  CaptureAnalysisSchema,
  normalizeAnalysisForTrust
} from "@sharebook/shared";
import { optionalEnv } from "./env";
import type { UrlMetadata } from "./url-metadata";

export type AnalyzeCaptureInput = {
  captureId: string;
  sourceApp?: string | null;
  url?: string | null;
  text?: string | null;
  assetUrl?: string | null;
  mimeType?: string | null;
  route?: string | null;
  urlMetadata?: UrlMetadata | null;
};

export type AnalyzeCaptureResult = {
  analysis: CaptureAnalysis;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  latencyMs: number;
  usage: Record<string, unknown>;
  costEstimate: number | null;
};

function getRoute(route?: string | null) {
  return route || optionalEnv("DEFAULT_ANALYSIS_ROUTE") || "high_precision_openai";
}

function getModel(route: string) {
  switch (route) {
    case "gemini_flash":
      return {
        provider: "google",
        model: "gemini-2.5-flash",
        sdkModel: google("gemini-2.5-flash")
      };
    case "gemini_flash_lite":
      return {
        provider: "google",
        model: "gemini-2.5-flash-lite",
        sdkModel: google("gemini-2.5-flash-lite")
      };
    case "openai_mini":
      return {
        provider: "openai",
        model: "gpt-4.1-mini",
        sdkModel: openai("gpt-4.1-mini")
      };
    case "high_precision_openai":
    default:
      return {
        provider: "openai",
        model: "gpt-4.1",
        sdkModel: openai("gpt-4.1")
      };
  }
}

function buildJsonContractPrompt() {
  return [
    "Return one JSON object only.",
    "Do not wrap it in markdown.",
    "Required top-level keys:",
    "- capture_type: one of link, social_post, screenshot, image, text_note, mixed, unknown",
    "- summary: string",
    "- default_intent: { category, confidence, rationale }",
    "- entities: array",
    "- platform_evidence: array",
    "- suggested_reminders: array",
    "- suggested_actions: array",
    "- suggested_collections: array",
    "- search_phrases: array",
    "- needs_review: boolean",
    "Use empty arrays when nothing is found.",
    "All confidence values must be numbers between 0 and 1."
  ].join("\n");
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Model did not return a JSON object.");
}

function parseAnalysisJson(text: string) {
  const json = JSON.parse(extractJsonObject(text));
  const repaired = repairAnalysisJson(json);
  const parsed = CaptureAnalysisSchema.safeParse(repaired);
  if (!parsed.success) {
    throw new Error(
      `JSON response did not match CaptureAnalysis schema: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
        .join("; ")}`
    );
  }
  return parsed.data;
}

function asString(value: unknown) {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function asConfidence(value: unknown, fallback = 0.5) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return fallback;
}

function coerceEntityType(type: unknown) {
  const value = asString(type).toLowerCase();
  const allowed = new Set([
    "person",
    "place",
    "product",
    "event",
    "media",
    "concept",
    "date",
    "price",
    "action",
    "organization",
    "other"
  ]);
  if (allowed.has(value)) return value;
  if (["feature", "spec", "attribute", "ingredient", "topic", "claim"].includes(value)) {
    return "concept";
  }
  if (["brand", "company", "manufacturer"].includes(value)) return "organization";
  if (["task", "todo", "next_step"].includes(value)) return "action";
  return "other";
}

function coerceEvidenceSource(source: unknown) {
  const value = asString(source).toLowerCase();
  const allowed = new Set([
    "source_payload",
    "url_metadata",
    "visual_understanding",
    "text_extraction",
    "user_context",
    "model_inference"
  ]);
  return allowed.has(value) ? value : "model_inference";
}

function coerceActionType(type: unknown, label: string) {
  const value = asString(type).toLowerCase();
  const allowed = new Set([
    "create_reminder",
    "open_source",
    "open_maps",
    "add_to_collection",
    "send_or_share",
    "archive",
    "mark_done"
  ]);
  if (allowed.has(value)) return value;
  if (value.includes("remind")) return "create_reminder";
  if (value.includes("map")) return "open_maps";
  if (value.includes("share") || value.includes("send")) return "send_or_share";
  if (value.includes("collection")) return "add_to_collection";
  if (value.includes("done")) return "mark_done";
  if (label.toLowerCase().includes("compare") || label.toLowerCase().includes("review")) {
    return "open_source";
  }
  return "open_source";
}

function repairAnalysisJson(json: unknown) {
  const raw = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const defaultIntent =
    raw.default_intent && typeof raw.default_intent === "object"
      ? (raw.default_intent as Record<string, unknown>)
      : {};

  return {
    capture_type: raw.capture_type ?? "unknown",
    summary: asString(raw.summary) || "No summary generated.",
    default_intent: {
      category: defaultIntent.category ?? "review_later",
      confidence: asConfidence(defaultIntent.confidence),
      rationale: asString(defaultIntent.rationale) || "No rationale generated."
    },
    entities: Array.isArray(raw.entities)
      ? raw.entities.map((entity) => {
          const item = entity && typeof entity === "object" ? (entity as Record<string, unknown>) : {};
          return {
            type: coerceEntityType(item.type),
            name: asString(item.name || item.display_name || item.label) || "Unknown",
            normalized_name: item.normalized_name ? asString(item.normalized_name) : undefined,
            confidence: asConfidence(item.confidence),
            evidence: asString(item.evidence) || "Model-inferred from capture.",
            source: coerceEvidenceSource(item.source)
          };
        })
      : [],
    platform_evidence: Array.isArray(raw.platform_evidence)
      ? raw.platform_evidence.map((evidence, index) => {
          const item =
            evidence && typeof evidence === "object" ? (evidence as Record<string, unknown>) : {};
          return {
            evidence_type: asString(item.evidence_type || item.type || `evidence_${index + 1}`),
            value: asString(item.value || item.text || item.evidence || evidence),
            source: coerceEvidenceSource(item.source),
            confidence: asConfidence(item.confidence)
          };
        })
      : [],
    suggested_reminders: Array.isArray(raw.suggested_reminders)
      ? raw.suggested_reminders
      : [],
    suggested_actions: Array.isArray(raw.suggested_actions)
      ? raw.suggested_actions.map((action) => {
          const item = action && typeof action === "object" ? (action as Record<string, unknown>) : {};
          const label = asString(item.label || item.type || "Open source");
          return {
            type: coerceActionType(item.type, label),
            label,
            rationale: asString(item.rationale || item.reason) || "Suggested by analysis.",
            confidence: asConfidence(item.confidence)
          };
        })
      : [],
    suggested_collections: Array.isArray(raw.suggested_collections)
      ? raw.suggested_collections
      : [],
    search_phrases: Array.isArray(raw.search_phrases)
      ? raw.search_phrases.map((phrase) => {
          if (typeof phrase === "string") return phrase;
          if (phrase && typeof phrase === "object") {
            const item = phrase as Record<string, unknown>;
            return asString(item.phrase || item.query || item.text || item.value || phrase);
          }
          return asString(phrase);
        })
      : [],
    needs_review: Boolean(raw.needs_review)
  };
}

export async function analyzeCapture(input: AnalyzeCaptureInput): Promise<AnalyzeCaptureResult> {
  const route = getRoute(input.route);
  const { provider, model, sdkModel } = getModel(route);
  const started = Date.now();
  const prompt = buildCaptureAnalysisPrompt({
    sourceApp: input.sourceApp,
    url: input.url,
    text: input.text,
    urlMetadata: input.urlMetadata
  });

  const content: Array<{ type: "text"; text: string } | { type: "image"; image: URL }> = [
    { type: "text", text: prompt }
  ];

  if (input.assetUrl && input.mimeType?.startsWith("image/")) {
    content.push({ type: "image", image: new URL(input.assetUrl) });
  }

  const textResult = await generateText({
    model: sdkModel,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildJsonContractPrompt() },
          ...content
        ]
      }
    ]
  });

  try {
    const analysis = parseAnalysisJson(textResult.text);
    return {
      analysis: normalizeAnalysisForTrust(analysis),
      provider,
      model,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      latencyMs: Date.now() - started,
      usage: textResult.usage ? { ...textResult.usage } : {},
      costEstimate: null
    };
  } catch (error) {
    throw new Error(
      `Model response did not match analysis schema: ${
        error instanceof Error ? error.message : "unknown schema error"
      }. Raw response preview: ${textResult.text.slice(0, 700)}`
    );
  }
}
