import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  auditEdoDerivedPlaceLeakage,
  auditEdoDerivedPlaceRepository,
  canonicalEdoDerivedPlacesSha256,
  deriveEdoPlaces,
  validateEdoDerivedPlaces,
  validateEdoDerivedPlaceSnapshot,
} from "../scripts/edo-derived-place-model.mjs";

const ROOT = join(__dirname, "..");
const source = JSON.parse(readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"));
const identity = JSON.parse(readFileSync(join(ROOT, "data-curation/edo-place-source-identity-relations.json"), "utf8"));
const curation = JSON.parse(readFileSync(join(ROOT, "data-curation/edo-place-curation-candidates.json"), "utf8"));
type IdentityMember = { target: { entryId: string } };
type IdentityGroup = { groupId: string; members: IdentityMember[] };
const identityGroups = identity.groups as IdentityGroup[];

function clone<T>(value: T): T {
  return structuredClone(value);
}

describe("Edo derived place non-runtime foundation", () => {
  const places = deriveEdoPlaces(source, identity, curation);

  it("keeps all 8,788 source records independently reverse-mappable", () => {
    expect(() => validateEdoDerivedPlaces(places, source, identity)).not.toThrow();
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

  it("keeps every public surface disabled", () => {
    expect(places.every((place) => Object.values(place.applicability).every((value) => value === false))).toBe(true);
  });

  it("is deterministic for an empty curation catalog", () => {
    const again = deriveEdoPlaces(source, identity, curation);
    expect(canonicalEdoDerivedPlacesSha256(again)).toBe(canonicalEdoDerivedPlacesSha256(places));
    expect(canonicalEdoDerivedPlacesSha256(places)).toBe("6c32a29fb1ff960ef5b4c888d0d7ec532156b6f7dd24b743ebb685ebc541f98a");
  });

  it("rejects unknown keys", () => {
    const invalid = clone(places) as Array<(typeof places)[number] & { unexpected?: boolean }>;
    invalid[0]!.unexpected = true;
    expect(() => validateEdoDerivedPlaces(invalid, source, identity)).toThrow(/unknown or missing keys/);
  });

  it("rejects missing source reverse mappings", () => {
    const invalid = clone(places);
    invalid[0]!.reverseMapping = [];
    expect(() => validateEdoDerivedPlaces(invalid, source, identity)).toThrow(/reverseMapping is incomplete/);
  });

  it("rejects a preferred record being silently substituted as display representative", () => {
    const invalid = clone(places);
    invalid[0]!.displayRepresentativeSourceRecordId = identityGroups[0]!.members[1]!.target.entryId;
    expect(() => validateEdoDerivedPlaces(invalid, source, identity)).toThrow(/display representative must be a member/);
  });

  it("rejects snapshot drift", () => {
    const snapshot = JSON.parse(readFileSync(join(ROOT, "audit/edo-derived-place-model.snapshot.json"), "utf8"));
    const changed = { ...snapshot, derivedPlaceCount: 8787 };
    expect(() => validateEdoDerivedPlaceSnapshot(changed, snapshot)).toThrow(/does not match deterministic output/);
  });

  it("passes the repository audit without leaking into public or dist", () => {
    const audit = auditEdoDerivedPlaceRepository(ROOT);
    expect(audit.errors).toEqual([]);
    expect(audit.summary?.runtimeApplicableDerivedPlaceCount).toBe(0);
    expect(auditEdoDerivedPlaceLeakage(ROOT)).toEqual([]);
  });
});
