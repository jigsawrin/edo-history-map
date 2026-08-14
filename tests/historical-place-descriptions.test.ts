import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditHistoricalPlaceDescriptionPrivateLeakage,
  canonicalDescriptionContentSha256,
  createHistoricalPlaceDescriptionPublicProjection,
  isHistoricalPlaceDescriptionTranslationStale,
  validateDescriptionRightsRegistry,
  validateHistoricalPlaceDescriptionCatalog,
  validateHistoricalPlaceDescriptionPublicProjection,
} from "../scripts/historical-place-descriptions.mjs";

const ROOT = join(__dirname, "..");
const source = JSON.parse(readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"));
const rights = JSON.parse(readFileSync(join(ROOT, "data-curation/historical-description-source-rights.json"), "utf8"));
const catalog = JSON.parse(readFileSync(join(ROOT, "data-curation/historical-place-descriptions.json"), "utf8"));
const storedProjection = JSON.parse(readFileSync(join(ROOT, "scripts/historical-place-description-public-projection.json"), "utf8"));
const temporaryRoots: string[] = [];

interface MutableRightsRegistry {
  sources: Array<{
    commercialUse: string;
    modification: string;
    summarization: string;
    thirdPartyRights: { status: string };
  }>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function approvedCatalog() {
  const value = clone(catalog);
  const description = value.descriptions[0];
  description.status = "approved";
  description.review = {
    reviewedBy: "fixture-reviewer",
    reviewedAt: "2026-08-14",
    reviewNote: "史実、表現、権利を確認したfixtureです。",
  };
  for (const segment of description.content.ja.segments) {
    segment.humanVerified = true;
  }
  return value;
}

describe("historical place description foundation", () => {
  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("実catalogは増上寺proposed 1件でpublic projectionは空", () => {
    const parsed = validateHistoricalPlaceDescriptionCatalog(catalog, source, rights) as typeof catalog;
    expect(parsed.descriptions).toHaveLength(1);
    expect(parsed.descriptions[0].target).toEqual({
      datasetId: "codh-edo-maps-places",
      sourceIndex: 7346,
      entryId: "4-349",
      sourceFeatureSha256: "e4158b329af9e3b357e89c66896ddaa03c2b1ada2a9961d6b0c266ed9f3118b1",
    });
    expect(parsed.descriptions[0].status).toBe("proposed");
    const generated = createHistoricalPlaceDescriptionPublicProjection(catalog, rights, source);
    expect(generated.approvedDescriptionCount).toBe(0);
    expect(generated.descriptions).toEqual([]);
    expect(() => validateHistoricalPlaceDescriptionPublicProjection(storedProjection, generated)).not.toThrow();
  });

  it("rights registryの必須項目と状態値を検証する", () => {
    expect(() => validateDescriptionRightsRegistry(rights)).not.toThrow();
    const missingTerms = clone(rights); delete missingTerms.sources[0].termsUrl;
    expect(() => validateDescriptionRightsRegistry(missingTerms)).toThrow(/unknown or missing/);
    const missingDate = clone(rights); missingDate.sources[0].rightsCheckedAt = "";
    expect(() => validateDescriptionRightsRegistry(missingDate)).toThrow(/rightsCheckedAt/);
    const incompleteAttribution = clone(rights); incompleteAttribution.sources[0].attribution.requiredText = null;
    expect(() => validateDescriptionRightsRegistry(incompleteAttribution)).toThrow(/attribution/);
  });

  it("approved editorial-summaryのpositive rights gate", () => {
    const projection = createHistoricalPlaceDescriptionPublicProjection(approvedCatalog(), rights, source);
    expect(projection.approvedDescriptionCount).toBe(1);
    expect(projection.descriptions[0]).toMatchObject({
      descriptionId: "historical-place-description-edo-7346",
      locale: "ja",
      compositionMode: "editorial-summary",
    });
    expect(JSON.stringify(projection.descriptions[0])).not.toMatch(/verifiedFacts|reviewNote|rightsBasisNote|humanVerified|aiUse/);
  });

  it.each([
    ["unknown commercial use", (value: MutableRightsRegistry) => { value.sources.at(1)!.commercialUse = "unknown"; }, /unknown/],
    ["commercial use prohibited", (value: MutableRightsRegistry) => { value.sources.at(1)!.commercialUse = "prohibited"; }, /commercial use/],
    ["unknown modification", (value: MutableRightsRegistry) => { value.sources.at(1)!.modification = "unknown"; }, /unknown/],
    ["summarization prohibited", (value: MutableRightsRegistry) => { value.sources.at(1)!.summarization = "prohibited"; }, /modification\/summarization/],
    ["third-party unresolved", (value: MutableRightsRegistry) => { value.sources.at(1)!.thirdPartyRights.status = "unknown"; }, /third-party/],
  ])("%sをpublic gateが拒否する", (_name, mutate, expected) => {
    const changed = clone(rights); mutate(changed);
    expect(() => createHistoricalPlaceDescriptionPublicProjection(approvedCatalog(), changed, source)).toThrow(expected as RegExp);
  });

  it("fact-verificationだけではtext reuseにならない", () => {
    const value = approvedCatalog();
    value.descriptions[0].evidence[1].role = "fact-verification";
    expect(() => createHistoricalPlaceDescriptionPublicProjection(value, rights, source)).toThrow(/text-reuse/);
  });

  it("claim evidence欠落とAI未確認を拒否する", () => {
    const noEvidence = approvedCatalog();
    noEvidence.descriptions[0].content.ja.segments[0].evidenceIds = [];
    expect(() => validateHistoricalPlaceDescriptionCatalog(noEvidence, source, rights)).toThrow(/evidenceIds/);
    const aiOnly = approvedCatalog();
    aiOnly.descriptions[0].content.ja.segments[0].humanVerified = false;
    expect(() => createHistoricalPlaceDescriptionPublicProjection(aiOnly, rights, source)).toThrow(/AI-only/);
  });

  it("reviewer/dateなしをapproved catalogで拒否する", () => {
    const value = approvedCatalog();
    value.descriptions[0].review.reviewedBy = null;
    expect(() => validateHistoricalPlaceDescriptionCatalog(value, source, rights)).toThrow(/incomplete/);
  });

  it("source identityとfeature SHAの不一致を拒否する", () => {
    const wrongId = clone(catalog); wrongId.descriptions[0].target.entryId = "wrong";
    expect(() => validateHistoricalPlaceDescriptionCatalog(wrongId, source, rights)).toThrow(/identity\/SHA/);
    const wrongSha = clone(catalog); wrongSha.descriptions[0].target.sourceFeatureSha256 = "0".repeat(64);
    expect(() => validateHistoricalPlaceDescriptionCatalog(wrongSha, source, rights)).toThrow(/identity\/SHA/);
  });

  it("canonical日本語変更で英語translationをstaleにする", () => {
    const description = approvedCatalog().descriptions[0];
    const translation = {
      translationOfContentSha256: canonicalDescriptionContentSha256(description.content.ja.text),
    };
    expect(isHistoricalPlaceDescriptionTranslationStale(description, translation)).toBe(false);
    description.content.ja.text += "追記";
    expect(isHistoricalPlaceDescriptionTranslationStale(description, translation)).toBe(true);
  });

  it("public projection生成は決定的", () => {
    const one = createHistoricalPlaceDescriptionPublicProjection(approvedCatalog(), rights, source);
    const two = createHistoricalPlaceDescriptionPublicProjection(approvedCatalog(), rights, source);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
  });

  it("private catalogのpublic/dist leakageを検出する", () => {
    const root = mkdtempSync(join(tmpdir(), "historical-description-")); temporaryRoots.push(root);
    mkdirSync(join(root, "public"), { recursive: true });
    writeFileSync(join(root, "public", "historical-place-descriptions.json"), "{}");
    expect(auditHistoricalPlaceDescriptionPrivateLeakage(root)).toEqual([
      "private description catalog leaked to public/historical-place-descriptions.json",
    ]);
  });

  it("public projectionのprivate field混入を拒否する", () => {
    const expected = createHistoricalPlaceDescriptionPublicProjection(approvedCatalog(), rights, source);
    const leaked = clone(expected) as unknown as { descriptions: Array<Record<string, unknown>> };
    leaked.descriptions.at(0)!.reviewNote = "private";
    expect(() => validateHistoricalPlaceDescriptionPublicProjection(leaked, expected)).toThrow(/unknown or missing fields/);
  });
});
