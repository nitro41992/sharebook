import { z } from "zod";

export const intentCategories = [
  "watch_later",
  "read_later",
  "try_place",
  "buy_later",
  "cook_or_make",
  "send_or_share",
  "plan_trip_or_event",
  "compare_or_research",
  "use_as_reference",
  "remember_fact",
  "review_later"
] as const;

export const captureTypes = [
  "link",
  "social_post",
  "screenshot",
  "image",
  "video",
  "text_note",
  "mixed",
  "unknown"
] as const;

export const analysisStates = [
  "queued",
  "processing",
  "ready",
  "partial",
  "failed",
  "needs_review"
] as const;

export const captureStates = ["active", "archived", "deleted"] as const;

export const evidenceSources = [
  "source_payload",
  "url_metadata",
  "visual_understanding",
  "text_extraction",
  "user_context",
  "model_inference"
] as const;

export const entityTypes = [
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
] as const;

export const suggestedActionTypes = [
  "create_reminder",
  "open_source",
  "open_maps",
  "add_to_collection",
  "send_or_share",
  "archive",
  "mark_done"
] as const;

export const reminderTriggerTypes = [
  "specific_time",
  "relative_time",
  "place",
  "event_or_trip"
] as const;

export const IntentCategorySchema = z.enum(intentCategories);
export const CaptureTypeSchema = z.enum(captureTypes);
export const AnalysisStateSchema = z.enum(analysisStates);
export const CaptureStateSchema = z.enum(captureStates);
export const EntityTypeSchema = z.enum(entityTypes);
export const EvidenceSourceSchema = z.enum(evidenceSources);

export type IntentCategory = z.infer<typeof IntentCategorySchema>;
export type CaptureType = z.infer<typeof CaptureTypeSchema>;
export type AnalysisState = z.infer<typeof AnalysisStateSchema>;
export type CaptureState = z.infer<typeof CaptureStateSchema>;
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const intentLabels: Record<IntentCategory, string> = {
  watch_later: "Watch later",
  read_later: "Read later",
  try_place: "Try place",
  buy_later: "Buy later",
  cook_or_make: "Cook or make",
  send_or_share: "Send or share",
  plan_trip_or_event: "Plan trip or event",
  compare_or_research: "Compare or research",
  use_as_reference: "Use as reference",
  remember_fact: "Remember fact",
  review_later: "Review later"
};

export const defaultIntentCategory: IntentCategory = "review_later";
