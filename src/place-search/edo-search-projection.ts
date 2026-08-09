import type { PlaceFeature } from "../validate";
import projectionJson from "./edo-search-projection.json";

const SOURCE_DATA_SHA256 =
  "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4";
const PROJECTION_KEYS = [
  "eligibleSourceCount",
  "overrides",
  "schemaVersion",
  "sourceDataSha256",
  "sourceFeatureCount",
] as const;
const OVERRIDE_KEYS = [
  "displayName",
  "hidden",
  "featureSha256",
  "sourceIndex",
  "sourceRecordId",
] as const;
const SHA256 = /^[0-9a-f]{64}$/u;

export interface EdoSearchOverride {
  readonly sourceRecordId: string;
  readonly sourceIndex: number;
  readonly featureSha256: string;
  readonly displayName: string | null;
  readonly hidden: boolean;
}

export interface EdoSearchProjection {
  readonly schemaVersion: 1;
  readonly sourceDataSha256: string;
  readonly sourceFeatureCount: number;
  readonly eligibleSourceCount: number;
  readonly overrides: readonly EdoSearchOverride[];
}

function hasExactKeys(
  value: object,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
}

export function applyEdoSearchProjection(
  places: readonly PlaceFeature[],
  value: unknown = projectionJson,
): readonly {
  readonly record: PlaceFeature;
  readonly name: string;
  readonly sourceIndex: number;
}[] {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !hasExactKeys(value, PROJECTION_KEYS)) {
    throw new Error("Edo search projection has unknown or missing fields");
  }
  const projection = value as EdoSearchProjection;
  if (projection.schemaVersion !== 1 ||
      projection.sourceDataSha256 !== SOURCE_DATA_SHA256 ||
      projection.sourceFeatureCount !== places.length ||
      !Number.isInteger(projection.eligibleSourceCount) ||
      !Array.isArray(projection.overrides)) {
    throw new Error("Edo search projection is stale or invalid");
  }

  const overrides = new Map<number, EdoSearchOverride>();
  let previousIndex = -1;
  for (const item of projection.overrides) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !hasExactKeys(item, OVERRIDE_KEYS) ||
        !Number.isInteger(item.sourceIndex) || item.sourceIndex <= previousIndex ||
        typeof item.sourceRecordId !== "string" ||
        !SHA256.test(item.featureSha256) ||
        !(item.displayName === null ||
          (typeof item.displayName === "string" && item.displayName.trim() === item.displayName && item.displayName.length > 0)) ||
        typeof item.hidden !== "boolean") {
      throw new Error("Edo search projection override is invalid or unordered");
    }
    const source = places[item.sourceIndex];
    if (!source || source.entryId !== item.sourceRecordId || overrides.has(item.sourceIndex)) {
      throw new Error("Edo search projection override does not match its source record");
    }
    overrides.set(item.sourceIndex, item);
    previousIndex = item.sourceIndex;
  }

  const projected = places.flatMap((record, sourceIndex) => {
    const item = overrides.get(sourceIndex);
    return item?.hidden ? [] : [{ record, name: item?.displayName ?? record.name, sourceIndex }];
  });
  if (projected.length !== projection.eligibleSourceCount) {
    throw new Error("Edo search projection eligible count is inconsistent");
  }
  return Object.freeze(projected.map((item) => Object.freeze(item)));
}
