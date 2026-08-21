import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DESCRIPTION_PRIORITY_CATALOG_PATH } from "../description-priority/validate.mjs";
import { EDO_SOURCE_DATA_PATH } from "../edo-place-curation-candidates.mjs";
import {
  DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH,
  DESCRIPTION_PRIORITY_REVIEW_REPORT_PATH,
  DESCRIPTION_PRIORITY_REVIEW_SCHEMA_VERSION,
  FROZEN_DESCRIPTION_PRIORITY_SHA256,
  validateDescriptionPriorityReviewCatalog,
  validateFrozenDescriptionPriorityCatalog,
} from "./validate.mjs";

export function generateInitialDescriptionPriorityReviewCatalog(priorityCatalog) {
  return {
    schemaVersion: DESCRIPTION_PRIORITY_REVIEW_SCHEMA_VERSION,
    catalogStatus: "private-description-priority-human-review",
    purpose: "human-calibration-only",
    priorityArtifact: {
      path: DESCRIPTION_PRIORITY_CATALOG_PATH,
      canonicalSha256: FROZEN_DESCRIPTION_PRIORITY_SHA256,
      candidateCount: priorityCatalog.candidates.length,
    },
    reviewEntries: priorityCatalog.candidates.map((candidate) => ({
      sourceIdentity: { ...candidate.sourceIdentity },
      prioritySnapshot: {
        sourceName: candidate.sourceName,
        category: candidate.category,
        suggestedTier: candidate.suggestedTier,
        score: candidate.score,
      },
      reviewState: "unreviewed",
      classification: null,
      humanPriority: "undecided",
      humanReasonCodes: [],
      note: null,
    })),
  };
}

export function summarizeDescriptionPriorityReview(reviewCatalog) {
  const classifications = ["good-candidate", "structured-only", "supporting-or-duplicate", "low-value", "uncertain"];
  const priorities = ["high", "medium", "low", "undecided"];
  const tiers = ["A", "B", "C", "D"];
  return {
    reviewState: Object.fromEntries(["reviewed", "unreviewed"].map((state) => [state, reviewCatalog.reviewEntries.filter((entry) => entry.reviewState === state).length])),
    classification: Object.fromEntries(classifications.map((classification) => [classification, reviewCatalog.reviewEntries.filter((entry) => entry.classification === classification).length])),
    humanPriority: Object.fromEntries(priorities.map((priority) => [priority, reviewCatalog.reviewEntries.filter((entry) => entry.humanPriority === priority).length])),
    tierByClassification: Object.fromEntries(tiers.map((tier) => [tier, Object.fromEntries(classifications.map((classification) => [classification, reviewCatalog.reviewEntries.filter((entry) => entry.prioritySnapshot.suggestedTier === tier && entry.classification === classification).length]))])),
  };
}

function cell(value) {
  if (value === null || (Array.isArray(value) && value.length === 0)) return "—";
  return String(Array.isArray(value) ? value.join(", ") : value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function renderDescriptionPriorityReviewReport(reviewCatalog, priorityCatalog) {
  const reasonCodes = new Map(priorityCatalog.candidates.map((candidate) => [candidate.sourceIdentity.sourceIndex, candidate.reasonCodes]));
  const numbered = reviewCatalog.reviewEntries.map((entry, index) => ({ entry, sequence: index + 1 }));
  const lines = [
    "# Description Priority Human Review",
    "",
    "> Private, non-runtime calibration view. Priority values are read-only workflow triage output. Human reason codes are review rationale, not historical assertions or automated evidence.",
    "",
    `Frozen Priority v1 canonical SHA-256: \`${reviewCatalog.priorityArtifact.canonicalSha256}\``,
    "",
  ];
  for (const tier of ["A", "B", "C", "D"]) {
    lines.push(`## Suggested tier ${tier}`, "", "| # | sourceIndex | sourceName | category | tier | score | Priority reasonCodes | classification | human priority | human reasonCodes | note |", "|---:|---:|---|---|:---:|---:|---|---|---|---|---|");
    for (const { entry, sequence } of numbered.filter((item) => item.entry.prioritySnapshot.suggestedTier === tier)) {
      lines.push(`| ${sequence} | ${entry.sourceIdentity.sourceIndex} | ${cell(entry.prioritySnapshot.sourceName)} | ${cell(entry.prioritySnapshot.category)} | ${tier} | ${entry.prioritySnapshot.score} | ${cell(reasonCodes.get(entry.sourceIdentity.sourceIndex))} | ${cell(entry.classification)} | ${entry.humanPriority} | ${cell(entry.humanReasonCodes)} | ${cell(entry.note)} |`);
    }
    lines.push("");
  }
  const summary = summarizeDescriptionPriorityReview(reviewCatalog);
  lines.push("## Calibration counts", "", "```json", JSON.stringify(summary, null, 2), "```", "");
  return lines.join("\n");
}

export function loadDescriptionPriorityReviewInputs(root) {
  const priority = JSON.parse(readFileSync(resolve(root, DESCRIPTION_PRIORITY_CATALOG_PATH), "utf8"));
  const source = JSON.parse(readFileSync(resolve(root, EDO_SOURCE_DATA_PATH), "utf8"));
  return { priority, source };
}

export function initializeDescriptionPriorityReviewCatalog(root) {
  const { priority, source } = loadDescriptionPriorityReviewInputs(root);
  validateFrozenDescriptionPriorityCatalog(priority, source);
  const review = generateInitialDescriptionPriorityReviewCatalog(priority);
  validateDescriptionPriorityReviewCatalog(review, priority, source);
  const output = resolve(root, DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(review, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return review;
}

export function buildDescriptionPriorityReviewReport(root) {
  const { priority, source } = loadDescriptionPriorityReviewInputs(root);
  const catalogPath = resolve(root, DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH);
  const review = JSON.parse(readFileSync(catalogPath, "utf8"));
  validateDescriptionPriorityReviewCatalog(review, priority, source);
  const report = renderDescriptionPriorityReviewReport(review, priority);
  const output = resolve(root, DESCRIPTION_PRIORITY_REVIEW_REPORT_PATH);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, report, "utf8");
  return { review, report, summary: summarizeDescriptionPriorityReview(review) };
}
