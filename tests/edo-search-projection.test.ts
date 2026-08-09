import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createEdoSearchRecords } from "../src/place-search/adapters";
import { applyEdoSearchProjection } from "../src/place-search/edo-search-projection";
import { normalizeSearchText } from "../src/place-search/normalize";
import { paginateSearchResults, searchHistoricalPlaces } from "../src/place-search/query";
import { parsePlacesGeoJson } from "../src/validate";

const ROOT = join(__dirname, "..");
const places = parsePlacesGeoJson(
  readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"),
);
const sourceSha = "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4";

function projection(overrides: unknown[] = []) {
  return {
    schemaVersion: 1,
    sourceDataSha256: sourceSha,
    sourceFeatureCount: places.length,
    eligibleSourceCount: places.length,
    overrides,
  };
}

describe("Edo search runtime-safe projection", () => {
  it("preserves the complete legacy read model and source object identity", () => {
    const records = createEdoSearchRecords(places);
    expect(records).toHaveLength(8788);
    records.forEach((record, sourceIndex) => {
      const source = places[sourceIndex]!;
      expect(record.key).toBe(`edo:${source.entryId}`);
      expect(record.name).toBe(source.name);
      expect(record.secondaryText).toBe([source.category, source.sheet].filter(Boolean).join("／"));
      expect(record.categoryId).toBe(source.category);
      expect(record.categoryLabel).toBe(source.category);
      expect(record.latitude).toBe(source.lat);
      expect(record.longitude).toBe(source.lon);
      expect(record.normalizedName).toBe(normalizeSearchText(source.name));
      expect(record.normalizedCategory).toBe(normalizeSearchText(source.category));
      expect(record.normalizedSecondary).toBe(normalizeSearchText(source.sheet));
      expect(record.sourceRecord.record).toBe(source);
      expect(record.sourceRecord.sourceIndex).toBe(sourceIndex);
    });
  }, 60_000);

  it("preserves ordering, query results, category filtering, and pagination", () => {
    const records = createEdoSearchRecords(places);
    const empty = searchHistoricalPlaces(records, "");
    expect(empty).toHaveLength(8788);
    expect(paginateSearchResults(empty, 1).items).toHaveLength(50);
    expect(paginateSearchResults(empty, 176).items).toHaveLength(38);
    const sample = records[1234]!;
    expect(searchHistoricalPlaces(records, sample.name).map((item) => item.key)).toContain(sample.key);
    expect(searchHistoricalPlaces(records, "", sample.categoryId).every((item) => item.categoryId === sample.categoryId)).toBe(true);
  }, 60_000);

  it("rejects stale SHA, unknown/private fields, wrong index, and duplicates", () => {
    expect(() => applyEdoSearchProjection(places, { ...projection(), sourceDataSha256: "0".repeat(64) })).toThrow(/stale or invalid/);
    expect(() => applyEdoSearchProjection(places, { ...projection(), sourceIdentityGroupId: "private" })).toThrow(/unknown or missing/);
    const item = {
      sourceRecordId: places[0]!.entryId,
      sourceIndex: 1,
      featureSha256: "0".repeat(64),
      displayName: null,
      hidden: false,
    };
    expect(() => applyEdoSearchProjection(places, projection([item]))).toThrow(/does not match/);
    const validIndex = { ...item, sourceIndex: 0 };
    expect(() => applyEdoSearchProjection(places, projection([validIndex, validIndex]))).toThrow(/invalid or unordered/);
  });

  it("does not mutate the source record when applying an approved-shaped rename", () => {
    const source = places[0]!;
    const item = {
      sourceRecordId: source.entryId,
      sourceIndex: 0,
      featureSha256: "0".repeat(64),
      displayName: "承認済み表示名",
      hidden: false,
    };
    const before = source.name;
    const projected = applyEdoSearchProjection(places, projection([item]));
    expect(projected[0]?.name).toBe("承認済み表示名");
    expect(projected[0]?.record).toBe(source);
    expect(source.name).toBe(before);
  });
});
