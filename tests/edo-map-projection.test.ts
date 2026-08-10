import { describe, expect, it } from "vitest";
import projection from "../src/edo-map-projection.json";
import { validateEdoMapProjection } from "../src/edo-map-projection";
import type { PlaceFeature } from "../src/validate";

const place = { entryId: "source-1" } as PlaceFeature;
const override = { sourceRecordId: "source-1", sourceIndex: 0, featureSha256: "a".repeat(64), hidden: true as const };

describe("Edo map projection", () => {
  it("keeps the checked-in projection minimal and empty", () => {
    expect(validateEdoMapProjection(projection).overrides).toEqual([]);
    expect(projection).toMatchObject({ sourceFeatureCount: 8788, applicableSourceCount: 8788, visibleMarkerCount: 8788 });
  });
  it("validates a source-bound hidden override without cloning the source", () => {
    const value = { ...projection, sourceFeatureCount: 1, applicableSourceCount: 1, visibleMarkerCount: 0, overrides: [override] };
    expect(() => validateEdoMapProjection(value, [place])).toThrow(/stale or invalid/);
    expect(place.entryId).toBe("source-1");
  });
  it.each([
    ["unknown root", { ...projection, reviewer: "private" }],
    ["wrong SHA", { ...projection, sourceDataSha256: "0".repeat(64) }],
    ["wrong visible", { ...projection, visibleMarkerCount: 8787 }],
    ["private override", { ...projection, visibleMarkerCount: 8787, overrides: [{ ...override, reviewer: "private" }] }],
    ["false hidden", { ...projection, visibleMarkerCount: 8787, overrides: [{ ...override, hidden: false }] }],
  ])("rejects %s", (_name, value) => expect(() => validateEdoMapProjection(value)).toThrow());
});
