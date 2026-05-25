import { generateObject, NoObjectGeneratedError } from "ai";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SCHEMA_VERSION,
  AnalyzerUserContext,
  buildCaptureAnalysisPrompt,
  CaptureAnalysis,
  CaptureAnalysisSchema,
  normalizeAnalysisForTrust
} from "@sharebook/shared";
import { optionalEnv } from "./env";
import { createSupabaseAdminClient } from "./supabase-server";
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
  userContext?: AnalyzerUserContext | null;
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

type ModelRouteConfig = {
  route: string;
  provider: "google" | "openai";
  model: string;
  promptVersion: string;
  schemaVersion: string;
  fallbackRoute: string | null;
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
  return route || optionalEnv("DEFAULT_ANALYSIS_ROUTE") || "openai_mini";
}

function staticRouteConfig(route: string): ModelRouteConfig {
  switch (route) {
    case "gemini_flash":
      return {
        route,
        provider: "google",
        model: "gemini-2.5-flash",
        promptVersion: ANALYSIS_PROMPT_VERSION,
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        fallbackRoute: "openai_mini"
      };
    case "gemini_flash_lite":
      return {
        route,
        provider: "google",
        model: "gemini-2.5-flash-lite",
        promptVersion: ANALYSIS_PROMPT_VERSION,
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        fallbackRoute: "openai_mini"
      };
    case "openai_mini":
      return {
        route,
        provider: "openai",
        model: "gpt-4.1-mini",
        promptVersion: ANALYSIS_PROMPT_VERSION,
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        fallbackRoute: "high_precision_openai"
      };
    case "high_precision_openai":
    default:
      return {
        route: "high_precision_openai",
        provider: "openai",
        model: "gpt-4.1",
        promptVersion: ANALYSIS_PROMPT_VERSION,
        schemaVersion: ANALYSIS_SCHEMA_VERSION,
        fallbackRoute: null
      };
  }
}

async function getRouteConfig(route?: string | null): Promise<ModelRouteConfig> {
  const requestedRoute = getRoute(route);
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("model_route_configs")
      .select("route, provider, model, prompt_version, schema_version, fallback_route")
      .eq("route", requestedRoute)
      .eq("enabled", true)
      .maybeSingle();

    if (!error && data) {
      return {
        route: String(data.route),
        provider: data.provider === "google" ? "google" : "openai",
        model: String(data.model),
        promptVersion: String(data.prompt_version || ANALYSIS_PROMPT_VERSION),
        schemaVersion: String(data.schema_version || ANALYSIS_SCHEMA_VERSION),
        fallbackRoute: typeof data.fallback_route === "string" ? data.fallback_route : null
      };
    }
  } catch {
    // Local dogfood databases may not have route config yet.
  }

  return staticRouteConfig(requestedRoute);
}

function sdkForConfig(config: ModelRouteConfig) {
  if (config.provider === "google") {
    return {
      sdkModel: google(config.model),
      objectMode: "auto" as const
    };
  }

  return {
    sdkModel: openai(config.model, { structuredOutputs: true }),
    objectMode: "json" as const
  };
}

function stringifyDebugValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

export async function analyzeCapture(input: AnalyzeCaptureInput): Promise<AnalyzeCaptureResult> {
  const config = await getRouteConfig(input.route);
  const { sdkModel, objectMode } = sdkForConfig(config);
  const started = Date.now();
  const inputSnapshot = {
    capture_id: input.captureId,
    source_app: input.sourceApp ?? null,
    url: input.url ?? null,
    text_preview: input.text ? input.text.slice(0, 1200) : null,
    has_asset: Boolean(input.assetUrl),
    mime_type: input.mimeType ?? null,
    url_metadata: input.urlMetadata ?? null,
    user_context: input.userContext
      ? {
          current_date_time: input.userContext.currentDateTime,
          timezone: input.userContext.timezone,
          recent_captures: input.userContext.recentCaptures.length,
          prior_reminders: input.userContext.priorReminders.length,
          existing_collections: input.userContext.existingCollections.length,
          recent_collection_suggestions: input.userContext.recentCollectionSuggestions.length
        }
      : null
  };
  const prompt = buildCaptureAnalysisPrompt({
    sourceApp: input.sourceApp,
    url: input.url,
    text: input.text,
    urlMetadata: input.urlMetadata,
    userContext: input.userContext
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
      route: config.route,
      provider: config.provider,
      model: config.model,
      promptVersion: config.promptVersion,
      schemaVersion: config.schemaVersion,
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
      route: config.route,
      provider: config.provider,
      model: config.model,
      promptVersion: config.promptVersion,
      schemaVersion: config.schemaVersion,
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
