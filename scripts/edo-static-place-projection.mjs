import { createHash } from "node:crypto";

export const EDO_STATIC_PLACE_PROJECTION_SCHEMA_VERSION = 1;

const PROJECTION_KEYS = [
  "schemaVersion", "sourceDataSha256", "sourceFeatureCount",
  "eligibleSourceCount", "legacyLayoutSha256", "overrides",
];
const OVERRIDE_KEYS = [
  "sourceRecordId", "sourceIndex", "featureSha256", "displayName", "hidden",
];
const SHA256 = /^[0-9a-f]{64}$/u;
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f<>]/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has unknown or missing keys`);
}

export function canonicalEdoStaticLegacyLayout(places, perPage) {
  assert(Number.isSafeInteger(perPage) && perPage > 0, "static legacy layout perPage is invalid");
  return places.map((place, index) => ({
    sourceIndex: place.sourceIndex,
    legacyKey: place.key,
    anchor: place.anchor,
    pageNumber: Math.floor(index / perPage) + 1,
    pageSlot: (index % perPage) + 1,
  }));
}

export function calculateEdoStaticLegacyLayoutSha256(places, perPage) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalEdoStaticLegacyLayout(places, perPage)))
    .digest("hex");
}

export function validateEdoStaticPlaceProjection(projection, places, options) {
  exactKeys(projection, PROJECTION_KEYS, "static projection");
  assert(projection.schemaVersion === EDO_STATIC_PLACE_PROJECTION_SCHEMA_VERSION, "static projection schemaVersion must be 1");
  assert(projection.sourceDataSha256 === options.sourceDataSha256, "static projection source SHA is stale");
  assert(projection.sourceFeatureCount === places.length, "static projection source count is stale");
  assert(Number.isSafeInteger(projection.eligibleSourceCount) && projection.eligibleSourceCount >= 0 && projection.eligibleSourceCount <= places.length, "static projection eligible count is invalid");
  assert(projection.legacyLayoutSha256 === calculateEdoStaticLegacyLayoutSha256(places, options.perPage), "static projection legacy layout SHA is stale");
  assert(Array.isArray(projection.overrides), "static projection overrides must be an array");

  const bySourceIndex = new Map(places.map((place) => [place.sourceIndex, place]));
  let previousIndex = -1;
  for (const [index, item] of projection.overrides.entries()) {
    const label = `static projection overrides[${index}]`;
    exactKeys(item, OVERRIDE_KEYS, label);
    assert(Number.isSafeInteger(item.sourceIndex) && item.sourceIndex > previousIndex, `${label} must be sourceIndex ordered and not duplicated`);
    assert(typeof item.sourceRecordId === "string" && item.sourceRecordId.length > 0, `${label} sourceRecordId is invalid`);
    assert(typeof item.featureSha256 === "string" && SHA256.test(item.featureSha256), `${label} feature SHA is invalid`);
    assert(item.displayName === null || (typeof item.displayName === "string" && item.displayName === item.displayName.trim() && item.displayName.length > 0 && !UNSAFE_TEXT.test(item.displayName)), `${label} displayName is invalid`);
    assert(typeof item.hidden === "boolean", `${label} hidden is invalid`);
    assert(!item.hidden || item.displayName === null, `${label} hidden tombstone cannot expose a displayName`);
    const source = bySourceIndex.get(item.sourceIndex);
    assert(source?.entryId === item.sourceRecordId, `${label} sourceIndex/sourceRecordId is invalid`);
    assert(source?.featureSha256 === item.featureSha256, `${label} feature SHA is stale`);
    previousIndex = item.sourceIndex;
  }
  return projection;
}

export function applyEdoStaticPlaceProjection(places, projection) {
  const overrides = new Map(projection.overrides.map((item) => [item.sourceIndex, item]));
  return Object.freeze(places.map((place) => {
    const override = overrides.get(place.sourceIndex);
    return Object.freeze({
      ...place,
      displayName: override?.displayName ?? place.name,
      hidden: override?.hidden ?? false,
    });
  }));
}
