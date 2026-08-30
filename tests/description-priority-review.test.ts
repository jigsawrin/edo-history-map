import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  auditDescriptionPriorityReviewPrivateLeakage,
} from "../scripts/description-priority-review/audit.mjs";
import {
  buildDescriptionPriorityReviewReport,
  generateInitialDescriptionPriorityReviewCatalog,
  initializeDescriptionPriorityReviewCatalog,
  renderDescriptionPriorityReviewReport,
  summarizeDescriptionPriorityReview,
} from "../scripts/description-priority-review/generate.mjs";
import {
  FROZEN_DESCRIPTION_PRIORITY_SHA256,
  validateDescriptionPriorityReviewCatalog,
} from "../scripts/description-priority-review/validate.mjs";
import { canonicalDescriptionPriorityCatalogSha256 } from "../scripts/description-priority/validate.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const sourceBytes = readFileSync(join(ROOT, "public/data/edo-places.geojson"));
const source = JSON.parse(sourceBytes.toString("utf8"));
const priorityBytes = readFileSync(join(ROOT, "data-curation/description-priority-candidates.json"));
const priority = JSON.parse(priorityBytes.toString("utf8"));
const review = JSON.parse(readFileSync(join(ROOT, "data-curation/description-priority-review.json"), "utf8"));
const temporaryRoots: string[] = [];
const CALIBRATION_BATCH_1 = [
  [2497, "16-408"], [4543, "21-192"], [4685, "21-335"], [5058, "22-188"],
  [5263, "23-149"], [305, "11-049"], [589, "12-007"], [10, "1-011"],
  [24, "1-025"], [1480, "14-177"], [1982, "15-093"], [130, "10-003"],
  [1889, "14-591"], [327, "11-071"], [144, "10-017"], [21, "1-022"],
  [116, "1-117"], [3055, "17-453"], [5339, "24-027"], [5814, "26-014"],
  [245, "10-118"], [249, "10-122"], [674, "12-092"], [1297, "13-427"],
] as const;
const batchIdentityKeys = new Set(CALIBRATION_BATCH_1.map(([sourceIndex, entryId]) =>
  `codh-edo-maps-places\0${sourceIndex}\0${entryId}`
));
const batchJudgments = new Map<string, readonly [string, string, readonly string[]]>([
  ["2497/16-408", ["good-candidate", "high", ["historically-recognizable", "landmark-linked"]]],
  ["4543/21-192", ["good-candidate", "high", ["historically-recognizable", "institution-linked"]]],
  ["4685/21-335", ["structured-only", "low", ["landmark-linked", "low-information-name"]]],
  ["5058/22-188", ["good-candidate", "medium", ["landmark-linked", "needs-evidence"]]],
  ["5263/23-149", ["low-value", "low", ["generic-name", "low-information-name"]]],
  ["305/11-049", ["good-candidate", "medium", ["institution-linked", "strong-local-context"]]],
  ["589/12-007", ["good-candidate", "high", ["historically-recognizable", "institution-linked"]]],
  ["10/1-011", ["good-candidate", "high", ["historically-recognizable", "landmark-linked"]]],
  ["24/1-025", ["good-candidate", "high", ["historically-recognizable", "landmark-linked"]]],
  ["1480/14-177", ["good-candidate", "high", ["historically-recognizable", "transport-linked"]]],
  ["1982/15-093", ["good-candidate", "high", ["historically-recognizable", "strong-local-context"]]],
  ["130/10-003", ["good-candidate", "high", ["historically-recognizable", "landmark-linked"]]],
  ["1889/14-591", ["good-candidate", "medium", ["strong-local-context", "needs-evidence"]]],
  ["327/11-071", ["structured-only", "low", ["generic-name", "low-information-name"]]],
  ["144/10-017", ["good-candidate", "medium", ["strong-local-context"]]],
  ["21/1-022", ["uncertain", "medium", ["person-linked", "needs-identity-review", "needs-evidence"]]],
  ["116/1-117", ["good-candidate", "high", ["historically-recognizable", "institution-linked"]]],
  ["3055/17-453", ["low-value", "low", ["generic-name", "low-information-name"]]],
  ["5339/24-027", ["low-value", "low", ["generic-name", "low-information-name"]]],
  ["5814/26-014", ["good-candidate", "medium", ["institution-linked", "needs-evidence"]]],
  ["245/10-118", ["low-value", "low", ["supporting-record", "low-information-name"]]],
  ["249/10-122", ["low-value", "low", ["supporting-record", "low-information-name"]]],
  ["674/12-092", ["low-value", "low", ["supporting-record", "low-information-name"]]],
  ["1297/13-427", ["low-value", "low", ["supporting-record", "low-information-name"]]],
]);

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function clone<T>(value: T): T { return structuredClone(value); }
function sha256(value: Buffer): string { return createHash("sha256").update(value).digest("hex"); }

function reviewedCatalog() {
  const changed = generateInitialDescriptionPriorityReviewCatalog(priority);
  changed.reviewEntries[0].reviewState = "reviewed";
  changed.reviewEntries[0].classification = "good-candidate";
  changed.reviewEntries[0].humanPriority = "high";
  changed.reviewEntries[0].humanReasonCodes = ["historically-recognizable"];
  changed.reviewEntries[0].note = "Reviewed by a human for calibration.";
  return changed;
}

function repositoryFixture(reviewValue?: unknown, report = "existing report\n") {
  const root = mkdtempSync(join(tmpdir(), "description-priority-review-repository-")); temporaryRoots.push(root);
  mkdirSync(join(root, "public/data"), { recursive: true });
  mkdirSync(join(root, "data-curation/reports"), { recursive: true });
  writeFileSync(join(root, "public/data/edo-places.geojson"), sourceBytes);
  writeFileSync(join(root, "data-curation/description-priority-candidates.json"), priorityBytes);
  if (reviewValue !== undefined) writeFileSync(join(root, "data-curation/description-priority-review.json"), `${JSON.stringify(reviewValue, null, 2)}\n`);
  writeFileSync(join(root, "data-curation/reports/description-priority-review.md"), report);
  return root;
}

describe("Description Priority Human Review Catalog", () => {
  it("binds all 72 entries exactly once to frozen Priority identities", () => {
    expect(() => validateDescriptionPriorityReviewCatalog(review, priority, source)).not.toThrow();
    expect(review.reviewEntries).toHaveLength(72);
    expect(new Set(review.reviewEntries.map((entry: { sourceIdentity: unknown }) => JSON.stringify(entry.sourceIdentity))).size).toBe(72);
    expect(review.reviewEntries.map((entry: { sourceIdentity: unknown }) => entry.sourceIdentity)).toEqual(priority.candidates.map((candidate: { sourceIdentity: unknown }) => candidate.sourceIdentity));
  });

  it("binds to the exact frozen Priority v1 canonical artifact", () => {
    expect(canonicalDescriptionPriorityCatalogSha256(priority)).toBe(FROZEN_DESCRIPTION_PRIORITY_SHA256);
    const changed = clone(review); changed.priorityArtifact.canonicalSha256 = "0".repeat(64);
    expect(() => validateDescriptionPriorityReviewCatalog(changed, priority, source)).toThrow(/artifact binding/);
    const changedPriority = clone(priority); changedPriority.candidates[0].score += 1;
    expect(() => validateDescriptionPriorityReviewCatalog(review, changedPriority, source)).toThrow();
  });

  it("rejects Priority snapshot mismatch and source identity corruption", () => {
    const snapshot = clone(review); snapshot.reviewEntries[0].prioritySnapshot.score += 1;
    expect(() => validateDescriptionPriorityReviewCatalog(snapshot, priority, source)).toThrow(/snapshot mismatch/);
    const identity = clone(review); identity.reviewEntries[0].sourceIdentity.entryId = "wrong-entry";
    expect(() => validateDescriptionPriorityReviewCatalog(identity, priority, source)).toThrow(/wrong source identity/);
  });

  it("rejects duplicate, missing, unknown fields, and invalid enums", () => {
    const duplicate = clone(review); duplicate.reviewEntries[1].sourceIdentity = clone(duplicate.reviewEntries[0].sourceIdentity);
    expect(() => validateDescriptionPriorityReviewCatalog(duplicate, priority, source)).toThrow(/duplicates review identity/);
    const missing = clone(review); missing.reviewEntries.pop();
    expect(() => validateDescriptionPriorityReviewCatalog(missing, priority, source)).toThrow(/missing Priority candidate/);
    const unknown = clone(review); unknown.reviewEntries[0].automatedJudgment = true;
    expect(() => validateDescriptionPriorityReviewCatalog(unknown, priority, source)).toThrow(/unknown or missing fields/);
    const invalid = clone(review); invalid.reviewEntries[0].humanPriority = "urgent";
    expect(() => validateDescriptionPriorityReviewCatalog(invalid, priority, source)).toThrow(/humanPriority/);
  });

  it("keeps only the approved first 24 identities reviewed and the other 48 substantively unreviewed", () => {
    const reviewed = review.reviewEntries.filter((entry: { reviewState: string }) => entry.reviewState === "reviewed");
    const unreviewed = review.reviewEntries.filter((entry: { reviewState: string }) => entry.reviewState === "unreviewed");
    expect(reviewed).toHaveLength(24);
    expect(unreviewed).toHaveLength(48);
    expect(new Set(reviewed.map((entry: { sourceIdentity: { datasetId: string; sourceIndex: number; entryId: string } }) =>
      `${entry.sourceIdentity.datasetId}\0${entry.sourceIdentity.sourceIndex}\0${entry.sourceIdentity.entryId}`
    ))).toEqual(batchIdentityKeys);
    for (const entry of reviewed) {
      const expected = batchJudgments.get(`${entry.sourceIdentity.sourceIndex}/${entry.sourceIdentity.entryId}`);
      expect([entry.classification, entry.humanPriority, entry.humanReasonCodes]).toEqual(expected);
      expect(entry.note).toBeNull();
    }
    expect(unreviewed.every((entry: { classification: null; humanPriority: string; humanReasonCodes: string[]; note: null }) =>
      entry.classification === null && entry.humanPriority === "undecided" && entry.humanReasonCodes.length === 0 && entry.note === null
    )).toBe(true);
    const generated = generateInitialDescriptionPriorityReviewCatalog(priority);
    expect(generated.reviewEntries.every((entry: { reviewState: string; classification: null; humanPriority: string; humanReasonCodes: string[]; note: null }) =>
      entry.reviewState === "unreviewed" && entry.classification === null && entry.humanPriority === "undecided" && entry.humanReasonCodes.length === 0 && entry.note === null
    )).toBe(true);
    const root = repositoryFixture();
    const initialized = initializeDescriptionPriorityReviewCatalog(root);
    expect(initialized.reviewEntries.filter((entry: { reviewState: string }) => entry.reviewState === "reviewed")).toHaveLength(0);
    expect(initialized.reviewEntries.filter((entry: { reviewState: string }) => entry.reviewState === "unreviewed")).toHaveLength(72);
  });

  it("refuses to overwrite an existing human review catalog byte-for-byte", () => {
    const root = repositoryFixture(reviewedCatalog());
    const path = join(root, "data-curation/description-priority-review.json");
    const before = readFileSync(path);
    expect(() => initializeDescriptionPriorityReviewCatalog(root)).toThrow(/exist/i);
    expect(readFileSync(path).equals(before)).toBe(true);
  });

  it("rebuilds only the report while preserving reviewed catalog bytes", () => {
    const root = repositoryFixture(reviewedCatalog());
    const catalogPath = join(root, "data-curation/description-priority-review.json");
    const before = readFileSync(catalogPath);
    const result = buildDescriptionPriorityReviewReport(root);
    expect(readFileSync(catalogPath).equals(before)).toBe(true);
    expect(result.report).toContain("good-candidate");
    expect(result.report).toContain("historically-recognizable");
    expect(result.report).toContain("Reviewed by a human for calibration.");
    expect(result.summary.reviewState).toEqual({ reviewed: 1, unreviewed: 71 });
  });

  it("rejects an invalid catalog before replacing the existing report", () => {
    const invalid = reviewedCatalog(); invalid.reviewEntries[0].prioritySnapshot.score += 1;
    const root = repositoryFixture(invalid);
    const reportPath = join(root, "data-curation/reports/description-priority-review.md");
    const before = readFileSync(reportPath);
    expect(() => buildDescriptionPriorityReviewReport(root)).toThrow(/snapshot mismatch/);
    expect(readFileSync(reportPath).equals(before)).toBe(true);
  });

  it("rejects substantive judgment on unreviewed and requires reviewed classification", () => {
    const unreviewedIndex = review.reviewEntries.findIndex((entry: { reviewState: string }) => entry.reviewState === "unreviewed");
    const unreviewed = clone(review); unreviewed.reviewEntries[unreviewedIndex].humanReasonCodes = ["needs-evidence"];
    expect(() => validateDescriptionPriorityReviewCatalog(unreviewed, priority, source)).toThrow(/substantive human judgment/);
    const reviewed = clone(review); reviewed.reviewEntries[unreviewedIndex].reviewState = "reviewed";
    expect(() => validateDescriptionPriorityReviewCatalog(reviewed, priority, source)).toThrow(/requires a valid human classification/);
  });

  it("renders deterministic tier-grouped review data and deterministic count-only calibration", () => {
    const first = renderDescriptionPriorityReviewReport(review, priority);
    expect(first).toBe(renderDescriptionPriorityReviewReport(review, priority));
    expect(first.indexOf("Suggested tier A")).toBeLessThan(first.indexOf("Suggested tier D"));
    expect(summarizeDescriptionPriorityReview(review)).toEqual({
      reviewState: { reviewed: 24, unreviewed: 48 },
      classification: { "good-candidate": 14, "structured-only": 2, "supporting-or-duplicate": 0, "low-value": 7, uncertain: 1 },
      humanPriority: { high: 9, medium: 6, low: 9, undecided: 48 },
      tierByClassification: {
        A: { "good-candidate": 5, "structured-only": 1, "supporting-or-duplicate": 0, "low-value": 1, uncertain: 0 },
        B: { "good-candidate": 6, "structured-only": 1, "supporting-or-duplicate": 0, "low-value": 0, uncertain: 0 },
        C: { "good-candidate": 3, "structured-only": 0, "supporting-or-duplicate": 0, "low-value": 2, uncertain: 1 },
        D: { "good-candidate": 0, "structured-only": 0, "supporting-or-duplicate": 0, "low-value": 4, uncertain: 0 },
      },
    });
  });

  it("keeps review data out of runtime/public/dist with narrow markers", () => {
    const fixture = mkdtempSync(join(tmpdir(), "description-priority-review-leak-")); temporaryRoots.push(fixture);
    mkdirSync(join(fixture, "src"), { recursive: true }); mkdirSync(join(fixture, "dist"), { recursive: true });
    writeFileSync(join(fixture, "src", "main.ts"), "import review from '../data-curation/description-priority-review.json';");
    writeFileSync(join(fixture, "dist", "generic.js"), "const x={reviewState:'open',humanPriority:'high'};");
    expect(auditDescriptionPriorityReviewPrivateLeakage(fixture)).toEqual(["runtime source imports or embeds private Description Priority review data in src/main.ts"]);
    writeFileSync(join(fixture, "dist", "description-priority-review.json"), "{}");
    expect(auditDescriptionPriorityReviewPrivateLeakage(fixture)).toContain("private Description Priority review file leaked to dist/description-priority-review.json");
  });

  it("preserves the protected Priority artifact and Edo source byte-for-byte", () => {
    expect(sha256(readFileSync(join(ROOT, "data-curation/description-priority-candidates.json")))).toBe("b06067f2e41b89834ad92b6fabd21260fb65761b891bc8d843c7cdef1a17729b");
    expect(sha256(readFileSync(join(ROOT, "public/data/edo-places.geojson")))).toBe("7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4");
    expect(canonicalDescriptionPriorityCatalogSha256(priority)).toBe(FROZEN_DESCRIPTION_PRIORITY_SHA256);
  });

  it("exposes only explicit one-time initialization and safe report-build commands", () => {
    const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).scripts;
    expect(scripts["data:init:description-priority-review"]).toBe("node scripts/description-priority-review/init.mjs");
    expect(scripts["data:build:description-priority-review-report"]).toBe("node scripts/description-priority-review/build-report.mjs");
    expect(scripts["data:build:description-priority-review"]).toBeUndefined();
  });
});
