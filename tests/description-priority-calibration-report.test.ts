import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";
import {
  analyzeDescriptionPriorityCalibrationBatch1,
  BATCH_1_IDENTITIES,
  buildDescriptionPriorityCalibrationBatch1Report,
  DESCRIPTION_PRIORITY_CALIBRATION_REPORT_PATH,
  renderDescriptionPriorityCalibrationBatch1Report,
} from "../scripts/description-priority-review/calibration-report.mjs";
import { auditDescriptionPriorityReviewPrivateLeakage } from "../scripts/description-priority-review/audit.mjs";

const ROOT = join(import.meta.dirname, "..");
const priority = JSON.parse(readFileSync(join(ROOT, "data-curation/description-priority-candidates.json"), "utf8"));
const review = JSON.parse(readFileSync(join(ROOT, "data-curation/description-priority-review.json"), "utf8"));
const prepublishAudit = readFileSync(join(ROOT, "scripts/prepublish-audit.mjs"), "utf8");
const temporaryRoots: string[] = [];
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

afterAll(() => temporaryRoots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "description-priority-calibration-"));
  temporaryRoots.push(root);
  mkdirSync(join(root, "data-curation", "reports"), { recursive: true });
  mkdirSync(join(root, "public", "data"), { recursive: true });
  cpSync(join(ROOT, "data-curation/description-priority-candidates.json"), join(root, "data-curation/description-priority-candidates.json"));
  cpSync(join(ROOT, "data-curation/description-priority-review.json"), join(root, "data-curation/description-priority-review.json"));
  cpSync(join(ROOT, "public/data/edo-places.geojson"), join(root, "public/data/edo-places.geojson"));
  return root;
}

describe("Description Priority calibration Batch 1 report", () => {
  it("derives the protected overall, tier, bracketed, reason, and mismatch metrics", () => {
    const a = analyzeDescriptionPriorityCalibrationBatch1(priority, review);
    expect([a.batch1Count, a.outsideBatch1Count, a.catalogReviewedCount, a.catalogUnreviewedCount]).toEqual([24, 48, 24, 48]);
    expect(Object.fromEntries(Object.entries(a.tiers).map(([tier, value]) => [tier, value.reviewed]))).toEqual({ A: 7, B: 7, C: 6, D: 4 });
    expect([a.bracketed.count, a.bracketed.classification["good-candidate"], a.bracketed.humanPriority.low]).toEqual([8, 0, 8]);
    expect([a.nonBracketed.count, a.nonBracketed.classification["good-candidate"]]).toEqual([16, 14]);
    expect(a.reasonCounts).toEqual({ "low-information-name": 9, "generic-name": 4, "needs-evidence": 4, "historically-recognizable": 9 });
    expect(a.noMultiMemberSourceRelation).toEqual({ batch1: 24, frozen: 72 });
    expect(a.aMismatch.map((entry) => [entry.sourceIdentity.sourceIndex, entry.prioritySnapshot.sourceName])).toEqual([[4685, "（御行松）"], [5263, "（石碑）"]]);
    expect(a.cGood.map((entry) => [entry.sourceIdentity.sourceIndex, entry.prioritySnapshot.sourceName, entry.humanPriority])).toEqual([[144, "五番町", "medium"], [116, "一橋殿", "high"], [5814, "筆学所　文淵堂", "medium"]]);
    expect(a.dEntries.every((entry) => entry.classification === "low-value" && entry.humanPriority === "low" && entry.prioritySnapshot.sourceName === "（坂道）")).toBe(true);
  });

  it("renders deterministic cautious conclusions and the no-variance non-identifiability statement", () => {
    const first = renderDescriptionPriorityCalibrationBatch1Report(priority, review);
    expect(renderDescriptionPriorityCalibrationBatch1Report(priority, review)).toBe(first);
    expect(first).toContain("NOT a random or statistically representative sample");
    expect(first).toContain("Within the frozen 72-candidate sample this feature has no variance");
    expect(first).toContain("CANNOT determine whether the +10 weight is useful, harmful, or neutral");
    expect(first).toContain("STRONG BATCH-1 SIGNALS");
    expect(first).toContain("PROVISIONAL / NEEDS MORE REVIEW");
    expect(first).toContain("NOT IDENTIFIABLE FROM BATCH 1");
    expect(first).toContain("Good-candidate rate: 3 / 6 = 50.0%");
    expect(first).toContain("Low-human-priority rate: 4 / 4 = 100%");
    expect(first).toContain("Batch 1 records: 24.");
    expect(first).toContain("Current Human Review catalog: reviewed 24, unreviewed 48.");
  });

  it("keeps Batch 1 metrics stable as later catalog records are reviewed", () => {
    const changed = structuredClone(review);
    const batch1Keys = new Set(BATCH_1_IDENTITIES.map(([sourceIndex, entryId]) => `${sourceIndex}\0${entryId}`));
    const later = changed.reviewEntries.find((entry: { sourceIdentity: { sourceIndex: number; entryId: string }; reviewState: string }) =>
      entry.reviewState === "unreviewed" && !batch1Keys.has(`${entry.sourceIdentity.sourceIndex}\0${entry.sourceIdentity.entryId}`));
    Object.assign(later, {
      reviewState: "reviewed",
      classification: "uncertain",
      humanPriority: "medium",
      humanReasonCodes: ["needs-evidence"],
      note: null,
    });
    const baseline = analyzeDescriptionPriorityCalibrationBatch1(priority, review);
    const advanced = analyzeDescriptionPriorityCalibrationBatch1(priority, changed);
    const batchMetrics = (analysis: ReturnType<typeof analyzeDescriptionPriorityCalibrationBatch1>) => {
      const metrics = structuredClone(analysis) as unknown as Record<string, unknown>;
      delete metrics.catalogReviewedCount;
      delete metrics.catalogUnreviewedCount;
      return metrics;
    };
    expect(batchMetrics(advanced)).toEqual(batchMetrics(baseline));
    expect([advanced.catalogReviewedCount, advanced.catalogUnreviewedCount]).toEqual([25, 47]);
    const report = renderDescriptionPriorityCalibrationBatch1Report(priority, changed);
    expect(report).toContain("Current Human Review catalog: reviewed 25, unreviewed 47.");
    expect(report.replace("reviewed 25, unreviewed 47", "reviewed 24, unreviewed 48")).toBe(renderDescriptionPriorityCalibrationBatch1Report(priority, review));
  });

  it("writes only the report and preserves review, Priority, and source bytes", () => {
    const root = fixture();
    const protectedPaths = ["data-curation/description-priority-review.json", "data-curation/description-priority-candidates.json", "public/data/edo-places.geojson"].map((path) => join(root, path));
    const before = protectedPaths.map(sha);
    const first = buildDescriptionPriorityCalibrationBatch1Report(root).report;
    expect(readFileSync(join(root, DESCRIPTION_PRIORITY_CALIBRATION_REPORT_PATH), "utf8")).toBe(first);
    expect(buildDescriptionPriorityCalibrationBatch1Report(root).report).toBe(first);
    expect(protectedPaths.map(sha)).toEqual(before);
  });

  it("fails closed for changed protected bytes, missing Batch 1 identities, or changed Batch 1 judgments", () => {
    const sourceRoot = fixture();
    writeFileSync(join(sourceRoot, "public/data/edo-places.geojson"), "{}\n");
    expect(() => buildDescriptionPriorityCalibrationBatch1Report(sourceRoot)).toThrow(/source raw SHA-256 mismatch/);
    const priorityRoot = fixture();
    writeFileSync(join(priorityRoot, "data-curation/description-priority-candidates.json"), "{}\n");
    expect(() => buildDescriptionPriorityCalibrationBatch1Report(priorityRoot)).toThrow(/Priority raw SHA-256 mismatch/);
    const reviewRoot = fixture();
    const changed = JSON.parse(readFileSync(join(reviewRoot, "data-curation/description-priority-review.json"), "utf8"));
    const reviewed = changed.reviewEntries.find((entry: { reviewState: string }) => entry.reviewState === "reviewed");
    Object.assign(reviewed, { reviewState: "unreviewed", classification: null, humanPriority: "undecided", humanReasonCodes: [], note: null });
    writeFileSync(join(reviewRoot, "data-curation/description-priority-review.json"), `${JSON.stringify(changed, null, 2)}\n`);
    expect(() => buildDescriptionPriorityCalibrationBatch1Report(reviewRoot)).toThrow(/must remain reviewed/);

    const missingRoot = fixture();
    const missing = JSON.parse(readFileSync(join(missingRoot, "data-curation/description-priority-review.json"), "utf8"));
    missing.reviewEntries = missing.reviewEntries.filter((entry: { reviewState: string }, index: number) => entry.reviewState !== "reviewed" || index !== missing.reviewEntries.findIndex((candidate: { reviewState: string }) => candidate.reviewState === "reviewed"));
    expect(() => analyzeDescriptionPriorityCalibrationBatch1(priority, missing)).toThrow(/exactly 24 fixed identities/);

    const judgmentRoot = fixture();
    const judgmentChanged = JSON.parse(readFileSync(join(judgmentRoot, "data-curation/description-priority-review.json"), "utf8"));
    judgmentChanged.reviewEntries.find((entry: { reviewState: string }) => entry.reviewState === "reviewed").note = "changed";
    writeFileSync(join(judgmentRoot, "data-curation/description-priority-review.json"), `${JSON.stringify(judgmentChanged, null, 2)}\n`);
    expect(() => buildDescriptionPriorityCalibrationBatch1Report(judgmentRoot)).toThrow(/protected judgments differ/);
  });

  it("rejects the private calibration report across src, public, and dist without a repository false positive", () => {
    const srcRoot = mkdtempSync(join(tmpdir(), "description-priority-calibration-src-leak-"));
    temporaryRoots.push(srcRoot);
    mkdirSync(join(srcRoot, "src"), { recursive: true });
    writeFileSync(join(srcRoot, "src", "main.ts"), 'import calibrationReport from "../data-curation/reports/description-priority-calibration-batch-1.md?raw";');
    expect(auditDescriptionPriorityReviewPrivateLeakage(srcRoot)).toEqual([
      "runtime source imports or embeds private Description Priority review data in src/main.ts",
    ]);

    for (const area of ["public", "dist"]) {
      const root = mkdtempSync(join(tmpdir(), `description-priority-calibration-${area}-leak-`));
      temporaryRoots.push(root);
      mkdirSync(join(root, area), { recursive: true });
      writeFileSync(join(root, area, "description-priority-calibration-batch-1.md"), "private");
      expect(auditDescriptionPriorityReviewPrivateLeakage(root)).toEqual([
        `private Description Priority review file leaked to ${area}/description-priority-calibration-batch-1.md`,
      ]);
    }

    expect(auditDescriptionPriorityReviewPrivateLeakage(ROOT)).toEqual([]);
    expect(prepublishAudit).toContain("DESCRIPTION_PRIORITY_CALIBRATION_REPORT_PATH");
  });
});
