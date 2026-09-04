import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DESCRIPTION_PRIORITY_CATALOG_PATH } from "../description-priority/validate.mjs";
import { EDO_SOURCE_DATA_PATH, EDO_SOURCE_SHA256 } from "../edo-place-curation-candidates.mjs";
import {
  DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH,
  validateDescriptionPriorityReviewCatalog,
} from "./validate.mjs";

export const DESCRIPTION_PRIORITY_CALIBRATION_REPORT_PATH = "data-curation/reports/description-priority-calibration-batch-1.md";
export const FROZEN_PRIORITY_RAW_SHA256 = "b06067f2e41b89834ad92b6fabd21260fb65761b891bc8d843c7cdef1a17729b";
export const BATCH_1_JUDGMENTS_SHA256 = "c7ae3221747bb388a30d85892ae94579a8195177edf3f44482affbaa577ee35d";
export const BATCH_1_IDENTITIES = Object.freeze([
  [2497, "16-408"], [4543, "21-192"], [4685, "21-335"], [5058, "22-188"],
  [5263, "23-149"], [305, "11-049"], [589, "12-007"], [10, "1-011"],
  [24, "1-025"], [1480, "14-177"], [1982, "15-093"], [130, "10-003"],
  [1889, "14-591"], [327, "11-071"], [144, "10-017"], [21, "1-022"],
  [116, "1-117"], [3055, "17-453"], [5339, "24-027"], [5814, "26-014"],
  [245, "10-118"], [249, "10-122"], [674, "12-092"], [1297, "13-427"],
]);

function fail(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function identityKey(entry) {
  return `${entry.sourceIdentity.datasetId}\0${entry.sourceIdentity.sourceIndex}\0${entry.sourceIdentity.entryId}`;
}

function countBy(entries, values, select) {
  return Object.fromEntries(values.map((value) => [value, entries.filter((entry) => select(entry) === value).length]));
}

function percent(numerator, denominator, integerHundred = false) {
  const value = denominator === 0 ? 0 : numerator / denominator * 100;
  return integerHundred && value === 100 ? "100%" : `${value.toFixed(1)}%`;
}

function assertCounts(actual, expected, label) {
  fail(JSON.stringify(actual) === JSON.stringify(expected), `${label} differs from the protected Batch 1 state`);
}

export function analyzeDescriptionPriorityCalibrationBatch1(priority, review) {
  const entriesByKey = new Map(review.reviewEntries.map((entry) => [identityKey(entry), entry]));
  const batch1 = BATCH_1_IDENTITIES.map(([sourceIndex, entryId]) => entriesByKey.get(`codh-edo-maps-places\0${sourceIndex}\0${entryId}`));
  fail(batch1.length === 24 && batch1.every(Boolean), "Batch 1 must contain exactly 24 fixed identities");
  fail(batch1.every((entry) => entry.reviewState === "reviewed"), "Every Batch 1 identity must remain reviewed");
  const protectedJudgments = batch1.map((entry) => ({
    sourceIdentity: entry.sourceIdentity,
    reviewState: entry.reviewState,
    classification: entry.classification,
    humanPriority: entry.humanPriority,
    humanReasonCodes: entry.humanReasonCodes,
    note: entry.note,
  }));
  fail(sha256(JSON.stringify(protectedJudgments)) === BATCH_1_JUDGMENTS_SHA256, "Batch 1 protected judgments differ");
  const reviewed = batch1;
  const catalogReviewedCount = review.reviewEntries.filter((entry) => entry.reviewState === "reviewed").length;
  const catalogUnreviewedCount = review.reviewEntries.filter((entry) => entry.reviewState === "unreviewed").length;

  const classifications = ["good-candidate", "structured-only", "supporting-or-duplicate", "low-value", "uncertain"];
  const priorities = ["high", "medium", "low"];
  const classification = countBy(reviewed, classifications, (entry) => entry.classification);
  const humanPriority = countBy(reviewed, priorities, (entry) => entry.humanPriority);
  assertCounts(classification, { "good-candidate": 14, "structured-only": 2, "supporting-or-duplicate": 0, "low-value": 7, uncertain: 1 }, "classification counts");
  assertCounts(humanPriority, { high: 9, medium: 6, low: 9 }, "human priority counts");

  const tiers = Object.fromEntries(["A", "B", "C", "D"].map((tier) => {
    const entries = reviewed.filter((entry) => entry.prioritySnapshot.suggestedTier === tier);
    return [tier, {
      reviewed: entries.length,
      classification: countBy(entries, classifications, (entry) => entry.classification),
      humanPriority: countBy(entries, priorities, (entry) => entry.humanPriority),
    }];
  }));
  assertCounts(Object.fromEntries(Object.entries(tiers).map(([tier, value]) => [tier, value.reviewed])), { A: 7, B: 7, C: 6, D: 4 }, "tier reviewed counts");
  assertCounts(tiers.A.classification, { "good-candidate": 5, "structured-only": 1, "supporting-or-duplicate": 0, "low-value": 1, uncertain: 0 }, "Tier A classifications");
  assertCounts(tiers.B.classification, { "good-candidate": 6, "structured-only": 1, "supporting-or-duplicate": 0, "low-value": 0, uncertain: 0 }, "Tier B classifications");
  assertCounts(tiers.C.classification, { "good-candidate": 3, "structured-only": 0, "supporting-or-duplicate": 0, "low-value": 2, uncertain: 1 }, "Tier C classifications");
  assertCounts(tiers.D.classification, { "good-candidate": 0, "structured-only": 0, "supporting-or-duplicate": 0, "low-value": 4, uncertain: 0 }, "Tier D classifications");
  assertCounts(tiers.A.humanPriority, { high: 3, medium: 2, low: 2 }, "Tier A human priorities");
  assertCounts(tiers.B.humanPriority, { high: 5, medium: 1, low: 1 }, "Tier B human priorities");
  assertCounts(tiers.C.humanPriority, { high: 1, medium: 3, low: 2 }, "Tier C human priorities");
  assertCounts(tiers.D.humanPriority, { high: 0, medium: 0, low: 4 }, "Tier D human priorities");

  const bracketed = reviewed.filter((entry) => entry.prioritySnapshot.sourceName.startsWith("（"));
  const nonBracketed = reviewed.filter((entry) => !entry.prioritySnapshot.sourceName.startsWith("（"));
  const reason = (code) => reviewed.filter((entry) => entry.humanReasonCodes.includes(code));
  const priorityByKey = new Map(priority.candidates.map((candidate) => [identityKey(candidate), candidate]));
  const reviewedNoRelation = reviewed.filter((entry) => priorityByKey.get(identityKey(entry))?.reasonCodes.includes("no-multi-member-source-relation")).length;
  const frozenNoRelation = priority.candidates.filter((candidate) => candidate.reasonCodes.includes("no-multi-member-source-relation")).length;
  const aMismatch = reviewed.filter((entry) => entry.prioritySnapshot.suggestedTier === "A" && entry.classification !== "good-candidate");
  const cGood = reviewed.filter((entry) => entry.prioritySnapshot.suggestedTier === "C" && entry.classification === "good-candidate");
  const dEntries = reviewed.filter((entry) => entry.prioritySnapshot.suggestedTier === "D");

  const analysis = {
    batch1Count: reviewed.length,
    outsideBatch1Count: review.reviewEntries.length - reviewed.length,
    catalogReviewedCount,
    catalogUnreviewedCount,
    classification,
    humanPriority,
    tiers,
    bracketed: { count: bracketed.length, classification: countBy(bracketed, classifications, (entry) => entry.classification), humanPriority: countBy(bracketed, priorities, (entry) => entry.humanPriority) },
    nonBracketed: { count: nonBracketed.length, classification: countBy(nonBracketed, classifications, (entry) => entry.classification), humanPriority: countBy(nonBracketed, priorities, (entry) => entry.humanPriority) },
    reasonCounts: Object.fromEntries(["low-information-name", "generic-name", "needs-evidence", "historically-recognizable"].map((code) => [code, reason(code).length])),
    reasonEntries: Object.fromEntries(["low-information-name", "generic-name", "needs-evidence", "historically-recognizable"].map((code) => [code, reason(code)])),
    noMultiMemberSourceRelation: { batch1: reviewedNoRelation, frozen: frozenNoRelation },
    aMismatch,
    cGood,
    dEntries,
  };
  assertCounts({ bracketed: bracketed.length, nonBracketed: nonBracketed.length }, { bracketed: 8, nonBracketed: 16 }, "bracketed counts");
  assertCounts(analysis.bracketed.classification, { "good-candidate": 0, "structured-only": 1, "supporting-or-duplicate": 0, "low-value": 7, uncertain: 0 }, "bracketed classifications");
  assertCounts(analysis.bracketed.humanPriority, { high: 0, medium: 0, low: 8 }, "bracketed priorities");
  assertCounts(analysis.nonBracketed.classification, { "good-candidate": 14, "structured-only": 1, "supporting-or-duplicate": 0, "low-value": 0, uncertain: 1 }, "non-bracketed classifications");
  assertCounts(analysis.nonBracketed.humanPriority, { high: 9, medium: 6, low: 1 }, "non-bracketed priorities");
  assertCounts(analysis.reasonCounts, { "low-information-name": 9, "generic-name": 4, "needs-evidence": 4, "historically-recognizable": 9 }, "reason-code counts");
  for (const code of ["low-information-name", "generic-name"]) fail(analysis.reasonEntries[code].every((entry) => entry.humanPriority === "low" && entry.classification !== "good-candidate"), `${code} diagnostic differs`);
  fail(analysis.reasonEntries["needs-evidence"].every((entry) => entry.humanPriority === "medium"), "needs-evidence priorities differ");
  assertCounts(countBy(analysis.reasonEntries["needs-evidence"], classifications, (entry) => entry.classification), { "good-candidate": 3, "structured-only": 0, "supporting-or-duplicate": 0, "low-value": 0, uncertain: 1 }, "needs-evidence classifications");
  fail(analysis.reasonEntries["historically-recognizable"].every((entry) => entry.humanPriority === "high" && entry.classification === "good-candidate"), "historically-recognizable diagnostic differs");
  fail(reviewedNoRelation === 24 && frozenNoRelation === 72, "noMultiMemberSourceRelation frequency differs");
  fail(aMismatch.length === 2 && cGood.length === 3 && dEntries.length === 4, "tier diagnostic counts differ");
  return analysis;
}

function recordList(entries) {
  return entries.map((entry) => `- sourceIndex ${entry.sourceIdentity.sourceIndex}: ${entry.prioritySnapshot.sourceName} (${entry.classification}, ${entry.humanPriority})`).join("\n");
}

export function renderDescriptionPriorityCalibrationBatch1Report(priority, review) {
  const a = analyzeDescriptionPriorityCalibrationBatch1(priority, review);
  const tierLines = Object.entries(a.tiers).map(([tier, value]) => {
    const good = value.classification["good-candidate"];
    const low = value.humanPriority.low;
    return `### Tier ${tier}\n\nReviewed: ${value.reviewed}\n\nClassification: good ${good}, structured ${value.classification["structured-only"]}, supporting ${value.classification["supporting-or-duplicate"]}, low ${value.classification["low-value"]}, uncertain ${value.classification.uncertain}.\n\nHuman priority: high ${value.humanPriority.high}, medium ${value.humanPriority.medium}, low ${low}.\n\nGood-candidate rate: ${good} / ${value.reviewed} = ${percent(good, value.reviewed)}. Low-human-priority rate: ${low} / ${value.reviewed} = ${percent(low, value.reviewed, true)}.`;
  }).join("\n\n");
  return `# Description Priority Calibration Report: Batch 1

> Private workflow material. Batch 1 contains 24 deliberately selected calibration records. It is NOT a random or statistically representative sample. Percentages describe this calibration batch only. Human reason codes were assigned during the same human review and are descriptive rationale, not independent validation features. No result in this report constitutes historical evidence. No scoring change is authorized by this report.

## 1. Overall calibration summary

Batch 1 records: ${a.batch1Count}.

Current Human Review catalog: reviewed ${a.catalogReviewedCount}, unreviewed ${a.catalogUnreviewedCount}.

Classification: good-candidate ${a.classification["good-candidate"]}, structured-only ${a.classification["structured-only"]}, supporting-or-duplicate ${a.classification["supporting-or-duplicate"]}, low-value ${a.classification["low-value"]}, uncertain ${a.classification.uncertain}.

Batch 1 humanPriority: high ${a.humanPriority.high}, medium ${a.humanPriority.medium}, low ${a.humanPriority.low}.

Records outside the fixed Batch 1 set are excluded from Batch 1 percentage denominators.

## 2. Tier calibration

${tierLines}

These deliberately selected records are not an unbiased precision sample. The observed Batch 1 facts do not establish that Tier B is globally better than Tier A. Batch 1 did not show a simple monotonic relationship where all A judgments were stronger than all B judgments.

## 3. Bracketed-name diagnostic

For this diagnostic only, bracketed means \`sourceName.startsWith("（")\`.

Bracketed: ${a.bracketed.count}; classification good ${a.bracketed.classification["good-candidate"]}, structured ${a.bracketed.classification["structured-only"]}, supporting ${a.bracketed.classification["supporting-or-duplicate"]}, low ${a.bracketed.classification["low-value"]}, uncertain ${a.bracketed.classification.uncertain}; humanPriority high ${a.bracketed.humanPriority.high}, medium ${a.bracketed.humanPriority.medium}, low ${a.bracketed.humanPriority.low}. Bracketed good-candidate: 0 / 8 = 0%. Bracketed low-priority: 8 / 8 = 100%.

Non-bracketed: ${a.nonBracketed.count}; classification good ${a.nonBracketed.classification["good-candidate"]}, structured ${a.nonBracketed.classification["structured-only"]}, supporting ${a.nonBracketed.classification["supporting-or-duplicate"]}, low ${a.nonBracketed.classification["low-value"]}, uncertain ${a.nonBracketed.classification.uncertain}; humanPriority high ${a.nonBracketed.humanPriority.high}, medium ${a.nonBracketed.humanPriority.medium}, low ${a.nonBracketed.humanPriority.low}. Non-bracketed good-candidate: 14 / 16 = 87.5%.

This is a strong Batch-1 calibration signal that bracketed labels may need a downward WORKFLOW PRIORITY adjustment. It does not show that bracketed labels are historically worthless, should be deleted or hidden from source data, are duplicates, or that every future bracketed record must be low-value. This concerns Description Priority triage only and is separate from the runtime progressive-reveal rule introduced in PR #80.

## 4. Low-information and generic-name diagnostic

\`low-information-name\`: ${a.reasonCounts["low-information-name"]} reviewed records; all 9 have humanPriority low and none is good-candidate.

\`generic-name\`: ${a.reasonCounts["generic-name"]} reviewed records; all 4 have humanPriority low and none is good-candidate.

These are same-review rationale correlations, not independent validation. They are strong rationale patterns worth testing against the remaining 48 records.

## 5. needs-evidence diagnostic

\`needs-evidence\`: ${a.reasonCounts["needs-evidence"]} records: 3 good-candidate and 1 uncertain; all have humanPriority medium. It must not become a negative-value penalty by itself. It indicates that research or evidence work remains necessary while a candidate may still be valuable.

## 6. historically-recognizable diagnostic

\`historically-recognizable\`: ${a.reasonCounts["historically-recognizable"]} records; all 9 are good-candidate with humanPriority high. This is human-review rationale, not an independently validated automatic feature, and is not converted into a scoring rule here.

## 7. noMultiMemberSourceRelation analysis

The frozen Priority reason \`no-multi-member-source-relation\` appears on ${a.noMultiMemberSourceRelation.batch1} / 24 Batch 1 records and ${a.noMultiMemberSourceRelation.frozen} / 72 frozen candidates. Within the frozen 72-candidate sample this feature has no variance. Therefore Batch 1 CANNOT determine whether the +10 weight is useful, harmful, or neutral, and does not support removing it. The feature may still have affected WHICH records entered the frozen 72 from the larger source population. Evaluation requires a later counterfactual analysis against the pre-selection or full candidate universe and is out of scope.

## 8. Tier A higher-tier mismatch

A higher-tier mismatch means a Tier A calibration record not classified good-candidate; it is not a statement of historical truth. Batch 1 has ${a.aMismatch.length} / 7 = 28.6%: one structured-only and one low-value, both humanPriority low.

${recordList(a.aMismatch)}

Their frozen Tier A values remain unchanged.

## 9. Tier C lower-tier good-candidate

C lower-tier good-candidate: ${a.cGood.length} / 6 = 50%.

${recordList(a.cGood)}

These are candidates for later Priority-model analysis, not automatic promotions of these or other Tier C records.

## 10. Tier D diagnostic

Batch 1 Tier D has ${a.dEntries.length} / 4 low-value and 4 / 4 humanPriority low; all four source names are （坂道）. This is consistent with current D treatment for this specific supplemental pattern and is not generalized to every future Tier D record.

## 11. Sampling limitation

Frozen 72 was constructed as 9 categories x 8 candidates before global interpretation. Batch 1 was then deliberately selected for calibration contrast. This is not random sampling; tier percentages are not population precision or recall estimates; category prevalence is artificial; confidence intervals and statistical-significance claims would be misleading and are not calculated.

## 12. Conclusions: evidence strength

### STRONG BATCH-1 SIGNALS

- Bracketed names correlate strongly with low review priority in Batch 1.
- Low-information-name cases in this batch are consistently low.
- Current D handling fits the four reviewed supplemental （坂道） records.
- Some C records are clearly useful explanation candidates.

### PROVISIONAL / NEEDS MORE REVIEW

- A versus B relative calibration.
- Generic-name handling beyond the reviewed examples.
- Category-specific weighting.
- Whether named houses or person-linked records deserve promotion.

### NOT IDENTIFIABLE FROM BATCH 1

- Usefulness of the \`noMultiMemberSourceRelation\` +10 weight.
- Global accuracy, precision, or recall of Priority v1.
- Correct final numerical Priority v2 weights.

## 13. Next 48 review recommendation

Complete all remaining 48 under the SAME frozen Priority v1 before changing scoring weights; changing v1 now would contaminate comparison between algorithm prediction and human judgment. Useful contrast families include repeated generic names such as 植木屋, repeated generic facilities such as 腰掛, unreviewed Tier A 寺社, unreviewed B water or geographic names, unreviewed C 町村字, and unreviewed C 屋敷地. This is review planning only; no classification or humanPriority is assigned automatically.
`;
}

export function buildDescriptionPriorityCalibrationBatch1Report(root) {
  const priorityPath = resolve(root, DESCRIPTION_PRIORITY_CATALOG_PATH);
  const reviewPath = resolve(root, DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH);
  const sourcePath = resolve(root, EDO_SOURCE_DATA_PATH);
  const priorityBytes = readFileSync(priorityPath);
  const reviewBytes = readFileSync(reviewPath);
  const sourceBytes = readFileSync(sourcePath);
  fail(sha256(priorityBytes) === FROZEN_PRIORITY_RAW_SHA256, "frozen Priority raw SHA-256 mismatch");
  fail(sha256(sourceBytes) === EDO_SOURCE_SHA256, "Edo source raw SHA-256 mismatch");
  const priority = JSON.parse(priorityBytes.toString("utf8"));
  const review = JSON.parse(reviewBytes.toString("utf8"));
  const source = JSON.parse(sourceBytes.toString("utf8"));
  validateDescriptionPriorityReviewCatalog(review, priority, source);
  const report = renderDescriptionPriorityCalibrationBatch1Report(priority, review);
  const output = resolve(root, DESCRIPTION_PRIORITY_CALIBRATION_REPORT_PATH);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, report, "utf8");
  return { report, analysis: analyzeDescriptionPriorityCalibrationBatch1(priority, review) };
}
