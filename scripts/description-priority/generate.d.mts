/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DescriptionPriorityReasonCode, DescriptionPriorityScoreSignal } from "./validate.mjs";

export const DESCRIPTION_PRIORITY_INPUT_PATHS: Readonly<Record<string, string>>;
export const DESCRIPTION_PRIORITY_CATEGORY_POINTS: Readonly<Record<string, number>>;
export const DESCRIPTION_PRIORITY_SCORE_WEIGHTS: Readonly<Record<
  "base" | "noMultiMemberSourceRelation" | "relationPreferred" | "relationSupporting" | "mapAggregate" | "supplemental" | "alreadyCurated" | "alreadyDescribed",
  number
>>;
export const DESCRIPTION_PRIORITY_SUPPLEMENTAL_NAMES: readonly string[];
export function scoreDescriptionPriorityRecord(input: { category: string; signals: any }): {
  suggestedTier: string;
  score: number;
  reasonCodes: readonly DescriptionPriorityReasonCode[];
  contributions: readonly { signal: DescriptionPriorityScoreSignal; points: number }[];
};
export function generateDescriptionPriorityCatalog(inputs: any): any;
export function loadDescriptionPriorityInputs(root?: string): any;
