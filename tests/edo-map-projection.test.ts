import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import projection from "../src/edo-map-projection.json";
import { createEdoMapSourceHiddenPredicate, validateEdoMapProjection } from "../src/edo-map-projection";
import { parsePlacesGeoJson } from "../src/validate";

const places = parsePlacesGeoJson(readFileSync(join(__dirname, "../public/data/edo-places.geojson"), "utf8"));
const override = { sourceRecordId: places[0]!.entryId, sourceIndex: 0, featureSha256: "a".repeat(64), hidden: true as const };

describe("Edo map projection", () => {
  it("keeps the checked-in projection minimal and empty", () => {
    expect(validateEdoMapProjection(projection).overrides).toEqual([]);
    expect(projection).toMatchObject({ sourceFeatureCount: 8788, applicableSourceCount: 8788, visibleMarkerCount: 8788 });
  });
  it("uses the production lookup path and fails closed on an ID mismatch", () => {
    const value = { ...projection, visibleMarkerCount: 8787, overrides: [override] };
    const isHidden = createEdoMapSourceHiddenPredicate(value, places);
    expect(isHidden(0, places[0]!)).toBe(true);
    expect(isHidden(1, places[1]!)).toBe(false);
    expect(() => isHidden(0, places[1]!)).toThrow(/source binding/);
    expect(places).toHaveLength(8788);
  });
  it.each([
    ["unknown root", { ...projection, reviewer: "private" }],
    ["wrong SHA", { ...projection, sourceDataSha256: "0".repeat(64) }],
    ["wrong visible", { ...projection, visibleMarkerCount: 8787 }],
    ["negative applicable", { ...projection, applicableSourceCount: -1, visibleMarkerCount: -1 }],
    ["applicable above source count", { ...projection, applicableSourceCount: 8789, visibleMarkerCount: 8789 }],
    ["negative visible", { ...projection, applicableSourceCount: 0, visibleMarkerCount: -1, overrides: [override] }],
    ["visible above applicable", { ...projection, applicableSourceCount: 8787, visibleMarkerCount: 8788 }],
    ["overrides above applicable", { ...projection, applicableSourceCount: 0, visibleMarkerCount: -1, overrides: [override] }],
    ["private override", { ...projection, visibleMarkerCount: 8787, overrides: [{ ...override, reviewer: "private" }] }],
    ["false hidden", { ...projection, visibleMarkerCount: 8787, overrides: [{ ...override, hidden: false }] }],
  ])("rejects %s", (_name, value) => expect(() => validateEdoMapProjection(value)).toThrow());
});
