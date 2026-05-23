import { z } from "zod";
import {
  CaptureTypeSchema,
  EntityTypeSchema,
  EvidenceSourceSchema,
  IntentCategorySchema,
  reminderTriggerTypes,
  suggestedActionTypes
} from "./domain";

export const ConfidenceSchema = z.number().min(0).max(1);

export const AnalysisEntitySchema = z.object({
  type: EntityTypeSchema,
  name: z.string().min(1),
  normalized_name: z.string().optional(),
  confidence: ConfidenceSchema,
  evidence: z.string().min(1),
  source: EvidenceSourceSchema.default("model_inference")
});

export const PlatformEvidenceSchema = z.object({
  evidence_type: z.string().min(1),
  value: z.string().min(1),
  source: EvidenceSourceSchema,
  confidence: ConfidenceSchema
});

export const SuggestedReminderSchema = z.object({
  trigger_type: z.enum(reminderTriggerTypes),
  trigger_value: z.string().min(1),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema
});

export const SuggestedActionSchema = z.object({
  type: z.enum(suggestedActionTypes),
  label: z.string().min(1),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema
});

export const SuggestedCollectionSchema = z.object({
  name: z.string().min(1),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema
});

export const CaptureAnalysisSchema = z.object({
  capture_type: CaptureTypeSchema,
  summary: z.string().min(1),
  default_intent: z.object({
    category: IntentCategorySchema,
    confidence: ConfidenceSchema,
    rationale: z.string().min(1)
  }),
  entities: z.array(AnalysisEntitySchema).default([]),
  platform_evidence: z.array(PlatformEvidenceSchema).default([]),
  suggested_reminders: z.array(SuggestedReminderSchema).default([]),
  suggested_actions: z.array(SuggestedActionSchema).default([]),
  suggested_collections: z.array(SuggestedCollectionSchema).default([]),
  search_phrases: z.array(z.string().min(1)).default([]),
  needs_review: z.boolean()
});

export type CaptureAnalysis = z.infer<typeof CaptureAnalysisSchema>;

export function normalizeAnalysisForTrust(analysis: CaptureAnalysis): CaptureAnalysis {
  if (analysis.default_intent.confidence < 0.55) {
    return {
      ...analysis,
      default_intent: {
        category: "review_later",
        confidence: analysis.default_intent.confidence,
        rationale:
          analysis.default_intent.rationale ||
          "The capture did not provide enough evidence for a precise save intent."
      },
      needs_review: true
    };
  }

  return analysis;
}
