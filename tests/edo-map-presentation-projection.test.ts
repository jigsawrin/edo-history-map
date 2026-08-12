import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlacesGeoJson } from "../src/validate";
import projectionJson from "../src/edo-map-presentation-projection.json";
import { buildEdoMapPresentationProjection } from "../scripts/edo-map-presentation-projection.mjs";
import { createEdoMapPresentationResolver, validateEdoMapPresentationProjection } from "../src/edo-map-presentation-projection";

const root = join(__dirname, "..");
const sourceText = readFileSync(join(root, "public/data/edo-places.geojson"), "utf8");
const relationText = readFileSync(join(root, "data-curation/edo-place-source-identity-relations.json"), "utf8");
const places = parsePlacesGeoJson(sourceText);

describe("Edo Map presentation projection", () => {
  it("is deterministic and exactly matches the generated runtime projection", () => {
    const first = buildEdoMapPresentationProjection(sourceText, relationText);
    const second = buildEdoMapPresentationProjection(sourceText, relationText);
    expect(first).toEqual(second);
    expect(first).toEqual(projectionJson);
    expect(() => validateEdoMapPresentationProjection(projectionJson, places)).not.toThrow();
  });

  it("aggregates 528 exact duplicate groups without changing 8,788 sources", () => {
    const projection = validateEdoMapPresentationProjection(projectionJson, places);
    expect(places).toHaveLength(8788);
    expect(projection.aggregateGroupCount).toBe(528);
    expect(projection.aggregateMemberCount).toBe(1082);
    expect(projection.markerReductionCount).toBe(554);
    expect(projection.presentationMarkerCount).toBe(8234);
    expect(projection.groups.filter((group) => group.memberSourceIndexes.length === 2)).toHaveLength(503);
    expect(projection.groups.filter((group) => group.memberSourceIndexes.length === 3)).toHaveLength(24);
    expect(projection.groups.filter((group) => group.memberSourceIndexes.length === 4)).toHaveLength(1);
  });

  it("excludes all PR #58 supplemental names and exposes no private relation metadata", () => {
    const serialized = JSON.stringify(projectionJson);
    for (const name of ["（辻番）", "（木戸）", "（坂道）"]) {
      expect(projectionJson.groups.some((group) => group.memberSourceIndexes.some((sourceIndex) => places[sourceIndex]?.name === name))).toBe(false);
    }
    for (const forbidden of ["preferred", "role", "evidence", "reviewer", "candidate"]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it("keeps a complete one-to-one member to group reverse mapping", () => {
    const resolver = createEdoMapPresentationResolver(projectionJson, places);
    const members = resolver.projection.groups.flatMap((group) => group.members);
    expect(new Set(members.map((member) => member.sourceIndex)).size).toBe(1082);
    for (const member of members) {
      expect(resolver.groupForSourceIndex(member.sourceIndex)?.members.some((item) => item.sourceIndex === member.sourceIndex)).toBe(true);
    }
  });

  it("rejects unknown keys and source binding tampering", () => {
    expect(() => validateEdoMapPresentationProjection({ ...projectionJson, unexpected: true }, places)).toThrow(/unknown or missing/u);
    const tampered = structuredClone(projectionJson);
    tampered.groups[0]!.memberSourceIndexes[0] = 1;
    expect(() => validateEdoMapPresentationProjection(tampered, places)).toThrow(/source binding/u);
  });
});
