import type { PlaceFeature } from "./validate";
import projectionJson from "./edo-map-projection.json";

const SOURCE_SHA = "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4";
const SOURCE_COUNT = 8788;
const ROOT_KEYS = ["applicableSourceCount", "overrides", "schemaVersion", "sourceDataSha256", "sourceFeatureCount", "visibleMarkerCount"];
const OVERRIDE_KEYS = ["featureSha256", "hidden", "sourceIndex", "sourceRecordId"];
const SHA256 = /^[0-9a-f]{64}$/u;

export interface EdoMapOverride {
  readonly sourceRecordId: string;
  readonly sourceIndex: number;
  readonly featureSha256: string;
  readonly hidden: true;
}
export interface EdoMapProjection {
  readonly schemaVersion: 1;
  readonly sourceDataSha256: string;
  readonly sourceFeatureCount: number;
  readonly applicableSourceCount: number;
  readonly visibleMarkerCount: number;
  readonly overrides: readonly EdoMapOverride[];
}

function exact(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateEdoMapProjection(value: unknown, places?: readonly PlaceFeature[]): EdoMapProjection {
  if (!value || typeof value !== "object" || Array.isArray(value) || !exact(value, ROOT_KEYS)) {
    throw new Error("Edo map projection has unknown or missing fields");
  }
  const projection = value as EdoMapProjection;
  if (projection.schemaVersion !== 1 || projection.sourceDataSha256 !== SOURCE_SHA ||
      projection.sourceFeatureCount !== SOURCE_COUNT ||
      !Number.isInteger(projection.applicableSourceCount) ||
      projection.applicableSourceCount < 0 ||
      projection.applicableSourceCount > projection.sourceFeatureCount ||
      !Number.isInteger(projection.visibleMarkerCount) ||
      projection.visibleMarkerCount < 0 ||
      projection.visibleMarkerCount > projection.applicableSourceCount ||
      !Array.isArray(projection.overrides) ||
      projection.overrides.length > projection.applicableSourceCount ||
      projection.visibleMarkerCount !== projection.applicableSourceCount - projection.overrides.length) {
    throw new Error("Edo map projection is stale or invalid");
  }
  if (places && places.length !== projection.sourceFeatureCount) throw new Error("Edo map projection source count is stale");
  let previous = -1;
  for (const item of projection.overrides) {
    if (!item || typeof item !== "object" || Array.isArray(item) || !exact(item, OVERRIDE_KEYS) ||
        !Number.isInteger(item.sourceIndex) || item.sourceIndex <= previous || item.sourceIndex >= projection.sourceFeatureCount ||
        typeof item.sourceRecordId !== "string" || !SHA256.test(item.featureSha256) || item.hidden !== true) {
      throw new Error("Edo map projection override is invalid or unordered");
    }
    if (places && places[item.sourceIndex]?.entryId !== item.sourceRecordId) throw new Error("Edo map projection source binding is invalid");
    previous = item.sourceIndex;
  }
  return projection;
}

export function createEdoMapSourceHiddenPredicate(
  value: unknown,
  places?: readonly PlaceFeature[],
): (sourceIndex: number, place: PlaceFeature) => boolean {
  const projection = validateEdoMapProjection(value, places);
  const hiddenByIndex = new Map(projection.overrides.map((item) => [item.sourceIndex, item.sourceRecordId]));
  return (sourceIndex, place) => {
    const sourceRecordId = hiddenByIndex.get(sourceIndex);
    if (sourceRecordId === undefined) return false;
    if (sourceRecordId !== place.entryId) throw new Error("Edo map projection source binding is invalid");
    return true;
  };
}

const checkedIsHidden = createEdoMapSourceHiddenPredicate(projectionJson);

export function isEdoMapSourceHidden(sourceIndex: number, place: PlaceFeature): boolean {
  return checkedIsHidden(sourceIndex, place);
}
