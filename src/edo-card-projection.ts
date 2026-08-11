import type { PlaceFeature } from "./validate";
import projectionJson from "./edo-card-projection.json";

const SOURCE_SHA = "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4";
const SOURCE_COUNT = 8788;
const ROOT_KEYS = [
  "applicableSourceCount",
  "overrides",
  "renderableCardCount",
  "schemaVersion",
  "sourceDataSha256",
  "sourceFeatureCount",
] as const;
const OVERRIDE_KEYS = [
  "displayName",
  "featureSha256",
  "hidden",
  "sourceIndex",
  "sourceRecordId",
] as const;
const SHA256 = /^[0-9a-f]{64}$/u;
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f<>]/u;

export interface EdoCardOverride {
  readonly sourceRecordId: string;
  readonly sourceIndex: number;
  readonly featureSha256: string;
  readonly displayName: string | null;
  readonly hidden: boolean;
}

export interface EdoCardProjection {
  readonly schemaVersion: 1;
  readonly sourceDataSha256: string;
  readonly sourceFeatureCount: number;
  readonly applicableSourceCount: number;
  readonly renderableCardCount: number;
  readonly overrides: readonly EdoCardOverride[];
}

export interface EdoCardResolution {
  readonly hidden: boolean;
  readonly displayName: string;
  readonly sourceName: string | null;
}

export type EdoCardResolver = (place: PlaceFeature) => EdoCardResolution;

function exact(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function safeDisplayName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim() &&
    !UNSAFE_TEXT.test(value);
}

export function validateEdoCardProjection(value: unknown): EdoCardProjection {
  if (!value || typeof value !== "object" || Array.isArray(value) || !exact(value, ROOT_KEYS)) {
    throw new Error("Edo card projection has unknown or missing fields");
  }
  const projection = value as EdoCardProjection;
  if (
    projection.schemaVersion !== 1 ||
    projection.sourceDataSha256 !== SOURCE_SHA ||
    projection.sourceFeatureCount !== SOURCE_COUNT ||
    !Number.isInteger(projection.applicableSourceCount) ||
    projection.applicableSourceCount < 0 ||
    projection.applicableSourceCount > projection.sourceFeatureCount ||
    !Number.isInteger(projection.renderableCardCount) ||
    projection.renderableCardCount < 0 ||
    projection.renderableCardCount > projection.applicableSourceCount ||
    !Array.isArray(projection.overrides) ||
    projection.overrides.length > projection.applicableSourceCount
  ) {
    throw new Error("Edo card projection is stale or invalid");
  }

  let previousIndex = -1;
  let hiddenCount = 0;
  const sourceRecordIds = new Set<string>();
  for (const item of projection.overrides) {
    const validShape = item?.hidden === true
      ? item.displayName === null
      : item?.hidden === false && safeDisplayName(item.displayName);
    if (
      !item || typeof item !== "object" || Array.isArray(item) || !exact(item, OVERRIDE_KEYS) ||
      !Number.isInteger(item.sourceIndex) || item.sourceIndex <= previousIndex ||
      item.sourceIndex < 0 || item.sourceIndex >= projection.sourceFeatureCount ||
      typeof item.sourceRecordId !== "string" || item.sourceRecordId.length === 0 ||
      sourceRecordIds.has(item.sourceRecordId) || !SHA256.test(item.featureSha256) || !validShape
    ) {
      throw new Error("Edo card projection override is invalid or unordered");
    }
    if (item.hidden) hiddenCount += 1;
    sourceRecordIds.add(item.sourceRecordId);
    previousIndex = item.sourceIndex;
  }
  if (projection.renderableCardCount !== projection.applicableSourceCount - hiddenCount) {
    throw new Error("Edo card projection renderable count is inconsistent");
  }
  return projection;
}

export function createEdoCardResolver(
  value: unknown,
): EdoCardResolver {
  const projection = validateEdoCardProjection(value);
  const overrideById = new Map(
    projection.overrides.map((item) => [item.sourceRecordId, item]),
  );
  return (place) => {
    const override = overrideById.get(place.entryId);
    if (!override) {
      return Object.freeze({ hidden: false, displayName: place.name, sourceName: null });
    }
    if (override.hidden) {
      return Object.freeze({ hidden: true, displayName: "", sourceName: null });
    }
    return Object.freeze({
      hidden: false,
      displayName: override.displayName as string,
      sourceName: place.name,
    });
  };
}

export const resolveEdoCard = createEdoCardResolver(projectionJson);
