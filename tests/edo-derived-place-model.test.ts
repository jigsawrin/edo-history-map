import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  auditEdoDerivedPlaceLeakage,
  auditEdoDerivedPlaceRepository,
  canonicalEdoDerivedPlacesSha256,
  createEdoSearchProjection,
  deriveEdoPlaces,
  EDO_DERIVED_PLACE_SNAPSHOT,
  validateEdoDerivedPlaces,
  validateEdoDerivedPlaceSnapshot,
  validateEdoSearchProjection,
} from "../scripts/edo-derived-place-model.mjs";
import {
  calculateEdoSourceFeatureSha256,
  EDO_SOURCE_DATASET_ID,
} from "../scripts/edo-place-curation-candidates.mjs";

const ROOT = join(__dirname, "..");
const source = JSON.parse(readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"));
const identity = JSON.parse(readFileSync(join(ROOT, "data-curation/edo-place-source-identity-relations.json"), "utf8"));
const curation = JSON.parse(readFileSync(join(ROOT, "data-curation/edo-place-curation-candidates.json"), "utf8"));
type IdentityMember = { target: { entryId: string } };
type IdentityGroup = { groupId: string; members: IdentityMember[] };
const identityGroups = identity.groups as IdentityGroup[];
const temporaryRoots: string[] = [];

function clone<T>(value: T): T {
  return structuredClone(value);
}

type CurationType = "hide" | "rename" | "annotation";

function approvedCandidate(type: CurationType, sourceIndex: number) {
  const feature = source.features[sourceIndex];
  const proposals = {
    hide: { visibility: "hidden" },
    rename: { displayNameJa: `${feature.properties.name}（表示名）`, preserveOriginalName: true },
    annotation: { noteType: "clarification", noteJa: "根拠資料に基づく補足です。" },
  };
  return {
    candidateId: `edo-derived-test-${type}-${sourceIndex}`,
    sourceDatasetId: EDO_SOURCE_DATASET_ID,
    target: {
      sourceIndex,
      entryId: feature.properties.id,
      sourceFeatureSha256: calculateEdoSourceFeatureSha256(feature),
      name: feature.properties.name,
      category: feature.properties.category,
      sheet: feature.properties.sheet,
      sourceUrl: feature.properties.source,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
    },
    proposalType: type,
    proposal: proposals[type],
    reasonCode: type === "rename" ? "orthography-normalization" : type === "annotation" ? "context-needed" : "duplicate",
    reasonJa: "派生モデルの承認済み判断を検証するfixtureです。",
    evidence: {
      basis: type === "rename" ? "official-source" : "source-record-comparison",
      urls: [feature.properties.source],
      noteJa: "source recordとの一致を確認しました。",
    },
    review: {
      status: "approved",
      reviewedBy: "fixture-reviewer",
      reviewedAt: "2026-08-04",
      reviewNoteJa: "テスト用に承認しました。",
    },
  };
}

function activeCuration(...candidates: ReturnType<typeof approvedCandidate>[]) {
  return { ...clone(curation), catalogStatus: "active", candidates };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Edo derived place non-runtime foundation", () => {
  const places = deriveEdoPlaces(source, identity, curation);

  it("keeps all 8,788 source records independently reverse-mappable", () => {
    expect(() => validateEdoDerivedPlaces(places, source, identity, curation)).not.toThrow();
    expect(places).toHaveLength(8788);
    expect(new Set(places.flatMap((place) => place.reverseMapping.map((item) => item.sourceRecordId))).size).toBe(8788);
  });

  it("does not turn a CODH identity group or preferred member into an automatic merge", () => {
    const firstGroup = identityGroups[0]!;
    const derived = firstGroup.members.map((member) =>
      places.find((place) => place.memberSourceRecordIds[0] === member.target.entryId),
    );
    expect(derived).toHaveLength(firstGroup.members.length);
    expect(derived.every((place) => place?.memberSourceRecordIds.length === 1)).toBe(true);
    expect(new Set(derived.map((place) => place?.derivedPlaceId)).size).toBe(firstGroup.members.length);
    expect(derived.every((place) => place?.sourceIdentityGroupId === firstGroup.groupId)).toBe(true);
  });

  it("enables only the search surface for every current source record", () => {
    expect(places.every((place) => place.applicability.search)).toBe(true);
    expect(places.every((place) => !place.applicability.map && !place.applicability.card && !place.applicability["static-page"])).toBe(true);
  });

  it("is deterministic for an empty curation catalog", () => {
    const again = deriveEdoPlaces(source, identity, curation);
    expect(canonicalEdoDerivedPlacesSha256(again)).toBe(canonicalEdoDerivedPlacesSha256(places));
    expect(canonicalEdoDerivedPlacesSha256(places)).toBe("703d2acf51fd4507b78d24a1b8d965c8dc70bf8285c9b3a17b4541ebea1339b2");
  });

  it("rejects unknown keys", () => {
    const invalid = clone(places) as Array<(typeof places)[number] & { unexpected?: boolean }>;
    invalid[0]!.unexpected = true;
    expect(() => validateEdoDerivedPlaces(invalid, source, identity, curation)).toThrow(/unknown or missing keys/);
  });

  it("rejects missing source reverse mappings", () => {
    const invalid = clone(places);
    invalid[0]!.reverseMapping = [];
    expect(() => validateEdoDerivedPlaces(invalid, source, identity, curation)).toThrow(/reverseMapping is incomplete/);
  });

  it("rejects a preferred record being silently substituted as display representative", () => {
    const invalid = clone(places);
    invalid[0]!.displayRepresentativeSourceRecordId = identityGroups[0]!.members[1]!.target.entryId;
    expect(() => validateEdoDerivedPlaces(invalid, source, identity, curation)).toThrow(/display representative must be a member/);
  });

  it("rejects snapshot drift", () => {
    const changed = { ...EDO_DERIVED_PLACE_SNAPSHOT, derivedPlaceCount: 8787 as const };
    expect(() => validateEdoDerivedPlaceSnapshot(changed as unknown as typeof EDO_DERIVED_PLACE_SNAPSHOT, EDO_DERIVED_PLACE_SNAPSHOT)).toThrow(/does not match deterministic output/);
  });

  it("passes the repository audit without leaking into public or dist", () => {
    const audit = auditEdoDerivedPlaceRepository(ROOT);
    expect(audit.errors).toEqual([]);
    expect(audit.summary?.searchApplicableDerivedPlaceCount).toBe(8788);
    expect(audit.summary?.mapApplicableDerivedPlaceCount).toBe(0);
    expect(audit.summary?.cardApplicableDerivedPlaceCount).toBe(0);
    expect(audit.summary?.staticPageApplicableDerivedPlaceCount).toBe(0);
    expect(auditEdoDerivedPlaceLeakage(ROOT)).toEqual([]);
  });

  it("derives and validates approved rename, hide, and annotation independently", () => {
    const catalog = activeCuration(
      approvedCandidate("rename", 1),
      approvedCandidate("hide", 2),
      approvedCandidate("annotation", 3),
    );
    const curated = deriveEdoPlaces(source, identity, catalog);
    expect(() => validateEdoDerivedPlaces(curated, source, identity, catalog)).not.toThrow();
    expect(curated[1]?.displayName.basis).toBe("approved-rename");
    expect(curated[1]?.curation.rename.decision).toBe("approved");
    expect(curated[2]?.curation.hide.decision).toBe("approved");
    expect(curated[1]?.applicability.search).toBe(true);
    expect(curated[2]?.applicability.search).toBe(false);
    expect(curated[3]?.curation.annotations).toEqual([
      { candidateId: "edo-derived-test-annotation-3", text: "根拠資料に基づく補足です。" },
    ]);
    expect(curated.slice(1, 4).every((place) => place.reviewState === "curation-approved")).toBe(true);
  });

  it("creates the checked-in empty search projection deterministically", () => {
    const projection = createEdoSearchProjection(places);
    expect(projection).toEqual(JSON.parse(readFileSync(join(ROOT, "src/place-search/edo-search-projection.json"), "utf8")));
    expect(projection.eligibleSourceCount).toBe(8788);
    expect(projection.overrides).toEqual([]);
    expect(() => validateEdoSearchProjection(projection, places, source)).not.toThrow();
  });

  const invalidProjectionCases: Array<[string, (projection: ReturnType<typeof createEdoSearchProjection>) => void, RegExp]> = [
    ["wrong source SHA", (projection) => { projection.sourceDataSha256 = "0".repeat(64); }, /source SHA is stale/],
    ["unknown field", (projection) => { (projection as typeof projection & { sourceIdentityGroupId?: string }).sourceIdentityGroupId = "private"; }, /unknown or missing keys/],
  ];
  for (const [name, mutate, message] of invalidProjectionCases) {
    it(`rejects search projection: ${name}`, () => {
      const projection = clone(createEdoSearchProjection(places));
      mutate(projection);
      expect(() => validateEdoSearchProjection(projection, places, source)).toThrow(message);
    });
  }

  it("rejects wrong index, feature SHA, duplicate target, and unauthorized rename/hide", () => {
    const base = createEdoSearchProjection(places);
    const validShape = {
      sourceRecordId: places[0]!.reverseMapping[0]!.sourceRecordId,
      sourceIndex: 0,
      featureSha256: places[0]!.reverseMapping[0]!.sourceFeatureSha256,
      displayName: null,
      hidden: false,
    };
    for (const mutate of [
      (item: typeof validShape) => { item.sourceIndex = 1; },
      (item: typeof validShape) => { item.featureSha256 = "0".repeat(64); },
      (item: typeof validShape) => { (item as unknown as { displayName: string | null }).displayName = "unapproved"; },
      (item: typeof validShape) => { item.hidden = true; },
    ]) {
      const projection = clone(base);
      const item = clone(validShape);
      mutate(item);
      projection.overrides = [item];
      expect(() => validateEdoSearchProjection(projection, places, source)).toThrow();
    }
    const duplicate = clone(base);
    duplicate.overrides = [clone(validShape), clone(validShape)];
    expect(() => validateEdoSearchProjection(duplicate, places, source)).toThrow(/ordered|duplicated/);
  });

  it("rejects a rename attached to a search-inapplicable hidden place", () => {
    const catalog = activeCuration(approvedCandidate("hide", 2));
    const curated = deriveEdoPlaces(source, identity, catalog);
    const projection = createEdoSearchProjection(curated);
    projection.overrides[0]!.displayName = "not allowed";
    expect(() => validateEdoSearchProjection(projection, curated, source)).toThrow(/rename is not approved|search-inapplicable/);
  });

  const authoritativeMutations: Array<[string, (items: ReturnType<typeof deriveEdoPlaces>) => void]> = [
    ["fake displayName", (items) => { items[0]!.displayName.value = "偽表示名"; }],
    ["shifted coordinate", (items) => { items[0]!.location.longitude += 0.001; }],
    ["wrong existing group ID", (items) => { items[0]!.sourceIdentityGroupId = identityGroups[1]!.groupId; }],
    ["applicability true", (items) => { items[0]!.applicability.map = true; }],
    ["inconsistent evidence", (items) => { items[0]!.evidence[0]!.sourceUrl = "https://example.com/"; }],
    ["inconsistent rights", (items) => { items[0]!.rights.attribution = "Other"; }],
    ["inconsistent reviewState", (items) => { items[0]!.reviewState = "needs-human-review"; }],
  ];
  for (const [name, mutate] of authoritativeMutations) {
    it(`rejects authoritative mismatch: ${name}`, () => {
      const invalid = clone(places);
      mutate(invalid);
      expect(() => validateEdoDerivedPlaces(invalid, source, identity, curation)).toThrow(/authoritative source/);
    });
  }

  it("rejects a nonexistent approved candidate ID", () => {
    const catalog = activeCuration(approvedCandidate("rename", 1));
    const invalid = deriveEdoPlaces(source, identity, catalog);
    invalid[1]!.displayName.curationCandidateId = "missing-candidate";
    invalid[1]!.curation.rename.candidateId = "missing-candidate";
    invalid[1]!.evidence.find((item) => item.kind === "manual-curation")!.id = "missing-candidate";
    expect(() => validateEdoDerivedPlaces(invalid, source, identity, catalog)).toThrow(/authoritative source/);
  });

  it("rejects runtime import of deriveEdoPlaces", () => {
    const root = mkdtempSync(join(tmpdir(), "edo-derived-leak-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src/main.ts"), 'import { deriveEdoPlaces } from "../scripts/edo-derived-place-model.mjs";');
    expect(auditEdoDerivedPlaceLeakage(root)).toEqual([
      expect.stringContaining("runtime source imports non-runtime derived place data"),
    ]);
  });

  it("rejects a derived JSON larger than 10 MB in public", () => {
    const root = mkdtempSync(join(tmpdir(), "edo-derived-leak-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "public/data"), { recursive: true });
    writeFileSync(
      join(root, "public/data/places.json"),
      JSON.stringify({ derivedPlaceId: "edo-derived-source-1-001", padding: "x".repeat(10_500_000) }),
    );
    expect(auditEdoDerivedPlaceLeakage(root)).toEqual([
      expect.stringContaining("non-runtime derived place marker leaked"),
    ]);
  });

  it("rejects a derived-looking public path regardless of size", () => {
    const root = mkdtempSync(join(tmpdir(), "edo-derived-leak-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "dist/data"), { recursive: true });
    writeFileSync(join(root, "dist/data/edo-derived-place-model.json"), "{}");
    expect(auditEdoDerivedPlaceLeakage(root)).toEqual([
      expect.stringContaining("non-runtime derived place file path leaked"),
    ]);
  });

  it("does not read or reject ordinary images and unrelated large binary files", () => {
    const root = mkdtempSync(join(tmpdir(), "edo-derived-leak-"));
    temporaryRoots.push(root);
    mkdirSync(join(root, "public/assets"), { recursive: true });
    writeFileSync(join(root, "public/assets/photo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]));
    writeFileSync(join(root, "public/assets/archive.bin"), Buffer.alloc(10_500_000, 0xff));
    expect(auditEdoDerivedPlaceLeakage(root)).toEqual([]);
  });
});
