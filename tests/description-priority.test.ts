import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  DESCRIPTION_PRIORITY_CATEGORY_POINTS,
  DESCRIPTION_PRIORITY_SCORE_WEIGHTS,
  generateDescriptionPriorityCatalog,
  loadDescriptionPriorityInputs,
  scoreDescriptionPriorityRecord,
} from "../scripts/description-priority/generate.mjs";
import {
  auditDescriptionPriorityPrivateLeakage,
  auditDescriptionPriorityRepository,
} from "../scripts/description-priority/audit.mjs";
import {
  DESCRIPTION_PRIORITY_CANDIDATE_COUNT,
  DESCRIPTION_PRIORITY_CATEGORIES,
  DESCRIPTION_PRIORITY_PER_CATEGORY,
  validateDescriptionPriorityCatalog,
} from "../scripts/description-priority/validate.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const source = JSON.parse(readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"));
const inputs = loadDescriptionPriorityInputs(ROOT);
const stored = JSON.parse(readFileSync(join(ROOT, "data-curation/description-priority-candidates.json"), "utf8"));
const temporaryRoots: string[] = [];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function basicSignals(overrides: Record<string, unknown> = {}) {
  return {
    relationGroupMemberCount: 1,
    relationRole: "none",
    mapAggregateMemberCount: 1,
    supplemental: false,
    alreadyDescribed: false,
    alreadyCurated: false,
    geographicCell: "13975:3568",
    ...overrides,
  };
}

afterAll(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

describe("Description Priority Foundation", () => {
  it("identical inputs generate byte-equivalent deterministic catalogs", () => {
    expect(JSON.stringify(generateDescriptionPriorityCatalog(inputs))).toBe(JSON.stringify(generateDescriptionPriorityCatalog(inputs)));
    expect(generateDescriptionPriorityCatalog(inputs)).toEqual(stored);
  });

  it("binds every candidate to the exact source identity", () => {
    expect(() => validateDescriptionPriorityCatalog(stored, source)).not.toThrow();
    const wrongEntry = clone(stored);
    wrongEntry.candidates[0].sourceIdentity.entryId = "wrong-entry";
    expect(() => validateDescriptionPriorityCatalog(wrongEntry, source)).toThrow(/source identity/);
  });

  it("fails closed when sourceFeatureSha256 does not match", () => {
    const changed = clone(stored);
    changed.candidates[0].sourceIdentity.sourceFeatureSha256 = "0".repeat(64);
    expect(() => validateDescriptionPriorityCatalog(changed, source)).toThrow(/sourceFeatureSha256 mismatch/);
  });

  it("rejects duplicate source identities", () => {
    const changed = clone(stored);
    changed.candidates[1].sourceIdentity = clone(changed.candidates[0].sourceIdentity);
    changed.candidates[1].sourceName = changed.candidates[0].sourceName;
    changed.candidates[1].category = changed.candidates[0].category;
    expect(() => validateDescriptionPriorityCatalog(changed, source)).toThrow(/duplicates source identity/);
  });

  it("rejects invalid tier, reason code, and score signal enums", () => {
    const tier = clone(stored); tier.candidates[0].suggestedTier = "approved";
    expect(() => validateDescriptionPriorityCatalog(tier, source)).toThrow(/suggestedTier/);
    const reason = clone(stored); reason.candidates[0].reasonCodes[0] = "historically-important";
    expect(() => validateDescriptionPriorityCatalog(reason, source)).toThrow(/unknown reasonCode/);
    const signal = clone(stored); signal.candidates[0].contributions[0].signal = "worldKnowledge";
    expect(() => validateDescriptionPriorityCatalog(signal, source)).toThrow(/unknown or duplicate score signal/);
  });

  it("uses score descending and sourceIndex ascending as deterministic tie order", () => {
    for (const category of DESCRIPTION_PRIORITY_CATEGORIES) {
      const candidates = stored.candidates.filter((candidate: { category: string }) => candidate.category === category);
      expect(candidates).toEqual([...candidates].sort((a, b) => b.score - a.score || a.sourceIdentity.sourceIndex - b.sourceIdentity.sourceIndex));
    }
  });

  it("recognizes the three described records and excludes them from fresh candidates", () => {
    const describedIndexes = inputs.descriptions.descriptions.map((description: { sourceIdentity: { sourceIndex: number } }) => description.sourceIdentity.sourceIndex);
    expect(describedIndexes).toHaveLength(3);
    expect(stored.candidates.some((candidate: { sourceIdentity: { sourceIndex: number } }) => describedIndexes.includes(candidate.sourceIdentity.sourceIndex))).toBe(false);
    const scored = scoreDescriptionPriorityRecord({ category: "寺社", signals: basicSignals({ alreadyDescribed: true }) });
    expect(scored.suggestedTier).toBe("D");
    expect(scored.reasonCodes).toContain("already-described-record");
    expect(scored.score).toBe(-55);
  });

  it("preserves the protected source count and does not mutate inputs", () => {
    const before = JSON.stringify(inputs.source);
    const generated = generateDescriptionPriorityCatalog(inputs);
    expect(generated.sourceFeatureCount).toBe(8788);
    expect(inputs.source.features).toHaveLength(8788);
    expect(JSON.stringify(inputs.source)).toBe(before);
  });

  it("keeps the private catalog and markers out of public and dist", () => {
    expect(auditDescriptionPriorityPrivateLeakage(ROOT)).toEqual([]);
    const root = mkdtempSync(join(tmpdir(), "description-priority-leak-")); temporaryRoots.push(root);
    mkdirSync(join(root, "public"), { recursive: true });
    mkdirSync(join(root, "dist", "assets"), { recursive: true });
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "public", "description-priority-candidates.json"), "{}");
    writeFileSync(join(root, "dist", "assets", "app.js"), "const x={geographicCell:'private'};");
    const errors = auditDescriptionPriorityPrivateLeakage(root);
    expect(errors.some((error) => error.includes("private description priority catalog"))).toBe(true);
    expect(errors.some((error) => error.includes("geographicCell"))).toBe(true);
  });

  it("rejects a runtime import of the private priority catalog", () => {
    const root = mkdtempSync(join(tmpdir(), "description-priority-runtime-")); temporaryRoots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "main.ts"), "import priority from '../data-curation/description-priority-candidates.json';");
    expect(auditDescriptionPriorityPrivateLeakage(root)).toEqual([
      "runtime source imports or embeds private description priority data in src/main.ts",
    ]);
  });

  it("enforces the 72-candidate and nine-category diversity contract", () => {
    expect(stored.candidates).toHaveLength(DESCRIPTION_PRIORITY_CANDIDATE_COUNT);
    expect(DESCRIPTION_PRIORITY_CANDIDATE_COUNT).toBe(72);
    for (const category of DESCRIPTION_PRIORITY_CATEGORIES) {
      expect(stored.candidates.filter((candidate: { category: string }) => candidate.category === category)).toHaveLength(DESCRIPTION_PRIORITY_PER_CATEGORY);
    }
  });

  it("uses distinct geographic cells before reusing a cell when enough cells exist", () => {
    for (const category of DESCRIPTION_PRIORITY_CATEGORIES) {
      const selected = stored.candidates.filter((candidate: { category: string }) => candidate.category === category);
      const eligibleCells = new Set(inputs.source.features.filter((feature: { properties: { category: string } }) => feature.properties.category === category).map((feature: { geometry: { coordinates: number[] } }) => `${Math.floor(feature.geometry.coordinates[0]! / 0.01)}:${Math.floor(feature.geometry.coordinates[1]! / 0.01)}`));
      if (eligibleCells.size >= DESCRIPTION_PRIORITY_PER_CATEGORY) {
        expect(new Set(selected.map((candidate: { signals: { geographicCell: string } }) => candidate.signals.geographicCell)).size).toBe(DESCRIPTION_PRIORITY_PER_CATEGORY);
      }
    }
  });

  it("makes score equal the documented contribution sum", () => {
    for (const candidate of stored.candidates) {
      expect(candidate.score).toBe(candidate.contributions.reduce((sum: number, contribution: { points: number }) => sum + contribution.points, 0));
    }
    expect(DESCRIPTION_PRIORITY_SCORE_WEIGHTS.base).toBe(10);
    expect(DESCRIPTION_PRIORITY_CATEGORY_POINTS["名所"]).toBe(30);
  });

  it("down-ranks supporting, aggregate, supplemental, and curated records without deciding truth or rights", () => {
    const plain = scoreDescriptionPriorityRecord({ category: "施設", signals: basicSignals() });
    const supporting = scoreDescriptionPriorityRecord({ category: "施設", signals: basicSignals({ relationGroupMemberCount: 2, relationRole: "nonpreferred", mapAggregateMemberCount: 2 }) });
    const supplemental = scoreDescriptionPriorityRecord({ category: "その他", signals: basicSignals({ supplemental: true }) });
    const curated = scoreDescriptionPriorityRecord({ category: "寺社", signals: basicSignals({ alreadyCurated: true }) });
    expect(plain.score).toBe(40);
    expect(supporting.score).toBe(0);
    expect(supporting.suggestedTier).toBe("D");
    expect(supplemental.suggestedTier).toBe("D");
    expect(curated.score).toBe(35);
    expect([supporting, supplemental, curated].flatMap((item) => item.reasonCodes)).not.toContain("rights-approved");
  });

  it("passes the repository audit with a current deterministic private artifact", () => {
    expect(auditDescriptionPriorityRepository(ROOT).errors).toEqual([]);
  });

  it("is wired into prepublish without treating the private catalog as copied source material", () => {
    const prepublish = readFileSync(join(ROOT, "scripts/prepublish-audit.mjs"), "utf8");
    expect(prepublish).toContain("auditDescriptionPriorityRepository(ROOT)");
    expect(prepublish).toContain("DESCRIPTION_PRIORITY_CATALOG_PATH,");
  });
});
