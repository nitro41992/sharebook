import { generateObject, NoObjectGeneratedError } from "ai";
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
  route: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  latencyMs: number;
  usage: Record<string, unknown>;
  costEstimate: number | null;
  debug: AnalysisDebugArtifacts;
};

export type AnalysisDebugArtifacts = {
  rawModelOutput: string | null;
  extractedJson: unknown | null;
  repairedOutput: unknown | null;
  schemaErrors: Array<{ path: string; message: string }>;
  inputSnapshot: Record<string, unknown>;
};

export class CaptureAnalysisModelError extends Error {
  route: string;
  provider: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
  latencyMs: number;
  usage: Record<string, unknown>;
  costEstimate: number | null;
  debug: AnalysisDebugArtifacts;

  constructor(input: {
    message: string;
    route: string;
    provider: string;
    model: string;
    promptVersion: string;
    schemaVersion: string;
    latencyMs: number;
    usage?: Record<string, unknown>;
    costEstimate?: number | null;
    debug: AnalysisDebugArtifacts;
  }) {
    super(input.message);
    this.name = "CaptureAnalysisModelError";
    this.route = input.route;
    this.provider = input.provider;
    this.model = input.model;
    this.promptVersion = input.promptVersion;
    this.schemaVersion = input.schemaVersion;
    this.latencyMs = input.latencyMs;
    this.usage = input.usage ?? {};
    this.costEstimate = input.costEstimate ?? null;
    this.debug = input.debug;
  }
}

function getRoute(route?: string | null) {
  return route || optionalEnv("DEFAULT_ANALYSIS_ROUTE") || "high_precision_openai";
}

function getModel(route: string) {
  switch (route) {
    case "gemini_flash":
      return {
        provider: "google",
        model: "gemini-2.5-flash",
        sdkModel: google("gemini-2.5-flash"),
        objectMode: "auto" as const
      };
    case "gemini_flash_lite":
      return {
        provider: "google",
        model: "gemini-2.5-flash-lite",
        sdkModel: google("gemini-2.5-flash-lite"),
        objectMode: "auto" as const
      };
    case "openai_mini":
      return {
        provider: "openai",
        model: "gpt-4.1-mini",
        sdkModel: openai("gpt-4.1-mini", { structuredOutputs: true }),
        objectMode: "json" as const
      };
    case "high_precision_openai":
    default:
      return {
        provider: "openai",
        model: "gpt-4.1",
        sdkModel: openai("gpt-4.1", { structuredOutputs: true }),
        objectMode: "json" as const
      };
  }
}

function stringifyDebugValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export async function analyzeCapture(input: AnalyzeCaptureInput): Promise<AnalyzeCaptureResult> {
  const route = getRoute(input.route);
  const { provider, model, sdkModel, objectMode } = getModel(route);
  const started = Date.now();
  const inputSnapshot = {
    capture_id: input.captureId,
    source_app: input.sourceApp ?? null,
    url: input.url ?? null,
    text_preview: input.text ? input.text.slice(0, 1200) : null,
    has_asset: Boolean(input.assetUrl),
    mime_type: input.mimeType ?? null,
    url_metadata: input.urlMetadata ?? null
  };
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

  try {
    const result = await generateObject({
      model: sdkModel,
      schema: CaptureAnalysisSchema,
      schemaName: "CaptureAnalysis",
      schemaDescription: "Sharebook capture analysis with inferred save intent and retrieval data.",
      mode: objectMode,
      messages: [
        {
          role: "user",
          content
        }
      ]
    });

    const analysis = result.object;
    return {
      analysis: normalizeAnalysisForTrust(analysis),
      route,
      provider,
      model,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      latencyMs: Date.now() - started,
      usage: result.usage ? { ...result.usage } : {},
      costEstimate: null,
      debug: {
        rawModelOutput: stringifyDebugValue(result.response.body),
        extractedJson: result.object,
        repairedOutput: null,
        schemaErrors: [],
        inputSnapshot
      }
    };
  } catch (error) {
    const isNoObject = NoObjectGeneratedError.isInstance(error);
    const message =
      error instanceof Error ? error.message : "Structured capture analysis failed";
    throw new CaptureAnalysisModelError({
      message,
      route,
      provider,
      model,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      schemaVersion: ANALYSIS_SCHEMA_VERSION,
      latencyMs: Date.now() - started,
      usage: isNoObject && error.usage ? { ...error.usage } : {},
      debug: {
        rawModelOutput: isNoObject ? (error.text ?? null) : null,
        extractedJson: null,
        repairedOutput: null,
        schemaErrors: [{ path: "root", message }],
        inputSnapshot
      }
    });
  }
}
