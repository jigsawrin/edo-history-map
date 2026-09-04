export const DESCRIPTION_PRIORITY_CALIBRATION_REPORT_PATH: string;
export const FROZEN_PRIORITY_RAW_SHA256: string;
export const BATCH_1_JUDGMENTS_SHA256: string;
export const BATCH_1_IDENTITIES: readonly (readonly [number, string])[];

export interface CalibrationEntry {
  sourceIdentity: { datasetId: string; sourceIndex: number; entryId: string; sourceFeatureSha256: string };
  prioritySnapshot: { sourceName: string; category: string; suggestedTier: string; score: number };
  reviewState: string;
  classification: string | null;
  humanPriority: string;
  humanReasonCodes: string[];
  note: string | null;
}

export interface CalibrationTierMetrics {
  reviewed: number;
  classification: Record<string, number>;
  humanPriority: Record<string, number>;
}

export interface CalibrationAnalysis {
  batch1Count: number;
  outsideBatch1Count: number;
  catalogReviewedCount: number;
  catalogUnreviewedCount: number;
  classification: Record<string, number>;
  humanPriority: Record<string, number>;
  tiers: Record<string, CalibrationTierMetrics>;
  bracketed: { count: number; classification: Record<string, number>; humanPriority: Record<string, number> };
  nonBracketed: { count: number; classification: Record<string, number>; humanPriority: Record<string, number> };
  reasonCounts: Record<string, number>;
  reasonEntries: Record<string, CalibrationEntry[]>;
  noMultiMemberSourceRelation: { batch1: number; frozen: number };
  aMismatch: CalibrationEntry[];
  cGood: CalibrationEntry[];
  dEntries: CalibrationEntry[];
}

export function analyzeDescriptionPriorityCalibrationBatch1(priority: unknown, review: unknown): CalibrationAnalysis;
export function renderDescriptionPriorityCalibrationBatch1Report(priority: unknown, review: unknown): string;
export function buildDescriptionPriorityCalibrationBatch1Report(root: string): { report: string; analysis: CalibrationAnalysis };
