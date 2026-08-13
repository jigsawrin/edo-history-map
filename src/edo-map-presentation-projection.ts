import type { PlaceFeature } from "./validate";
import projectionJson from "./edo-map-presentation-projection.json";

const SOURCE_SHA = "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4";
const SOURCE_COUNT = 8788;
const SHA256 = /^[0-9a-f]{64}$/u;
const GROUP_ID = /^edo-map-aggregate-[0-9a-f]{64}$/u;
const ROOT_KEYS = ["aggregateGroupCount", "aggregateMemberCount", "excludedExactNames", "groups", "markerReductionCount", "presentationMarkerCount", "relationDataSha256", "schemaVersion", "sourceDataSha256", "sourceFeatureCount"];
const GROUP_KEYS = ["groupId", "memberSourceIndexes"];

export interface EdoMapAggregateMember {
  readonly sourceIndex: number;
  readonly entryId: string;
  readonly sheet: string;
  readonly sourceUrl: string | null;
}
interface EdoMapAggregateIdentityGroup {
  readonly groupId: string;
  readonly memberSourceIndexes: readonly number[];
}
export interface EdoMapAggregateGroup {
  readonly groupId: string;
  readonly name: string;
  readonly category: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly memberCount: number;
  readonly members: readonly EdoMapAggregateMember[];
}
export interface EdoMapPresentationProjection {
  readonly schemaVersion: 1;
  readonly sourceDataSha256: string;
  readonly sourceFeatureCount: number;
  readonly relationDataSha256: string;
  readonly excludedExactNames: readonly string[];
  readonly aggregateGroupCount: number;
  readonly aggregateMemberCount: number;
  readonly markerReductionCount: number;
  readonly presentationMarkerCount: number;
  readonly groups: readonly EdoMapAggregateIdentityGroup[];
}

function exact(value: object, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function validateEdoMapPresentationProjection(value: unknown, places: readonly PlaceFeature[]): EdoMapPresentationProjection {
  if (!value || typeof value !== "object" || Array.isArray(value) || !exact(value, ROOT_KEYS)) throw new Error("Edo map presentation projection has unknown or missing fields");
  const projection = value as EdoMapPresentationProjection;
  if (projection.schemaVersion !== 1 || projection.sourceDataSha256 !== SOURCE_SHA || projection.sourceFeatureCount !== SOURCE_COUNT || places.length !== SOURCE_COUNT || !SHA256.test(projection.relationDataSha256) || !Array.isArray(projection.excludedExactNames) || projection.excludedExactNames.join("|") !== "（辻番）|（木戸）|（坂道）" || !Array.isArray(projection.groups)) throw new Error("Edo map presentation projection is stale or invalid");
  const projectedMemberCount = projection.groups.reduce((sum, group) => sum + (Array.isArray(group?.memberSourceIndexes) ? group.memberSourceIndexes.length : 0), 0);
  if (projection.aggregateGroupCount !== projection.groups.length || projection.aggregateMemberCount !== projectedMemberCount || projection.markerReductionCount !== projection.aggregateMemberCount - projection.aggregateGroupCount || projection.presentationMarkerCount !== SOURCE_COUNT - projection.markerReductionCount) throw new Error("Edo map presentation counts are invalid");

  const memberIndexes = new Set<number>();
  const groupIds = new Set<string>();
  let previousFirst = -1;
  for (const group of projection.groups) {
    if (!group || typeof group !== "object" || Array.isArray(group) || !exact(group, GROUP_KEYS) || !GROUP_ID.test(group.groupId) || groupIds.has(group.groupId) || !Array.isArray(group.memberSourceIndexes) || group.memberSourceIndexes.length < 2) throw new Error("Edo map presentation group is invalid");
    groupIds.add(group.groupId);
    let previous = -1;
    const firstPlace = places[group.memberSourceIndexes[0]!];
    if (!firstPlace || projection.excludedExactNames.includes(firstPlace.name)) throw new Error("Edo map presentation source binding is invalid");
    for (const sourceIndex of group.memberSourceIndexes) {
      if (!Number.isInteger(sourceIndex) || sourceIndex <= previous || sourceIndex >= places.length || memberIndexes.has(sourceIndex)) throw new Error("Edo map presentation member is invalid or unordered");
      const place = places[sourceIndex];
      if (!place || place.name !== firstPlace.name || place.category !== firstPlace.category || place.lon !== firstPlace.lon || place.lat !== firstPlace.lat) throw new Error("Edo map presentation source binding is invalid");
      previous = sourceIndex;
      memberIndexes.add(sourceIndex);
    }
    if (group.memberSourceIndexes[0]! <= previousFirst) throw new Error("Edo map presentation groups are unordered");
    previousFirst = group.memberSourceIndexes[0]!;
  }
  return projection;
}

export function createEdoMapPresentationResolver(value: unknown, places: readonly PlaceFeature[]) {
  const projection = validateEdoMapPresentationProjection(value, places);
  const groups: readonly EdoMapAggregateGroup[] = projection.groups.map((group) => {
    const first = places[group.memberSourceIndexes[0]!]!;
    return {
      groupId: group.groupId,
      name: first.name,
      category: first.category,
      longitude: first.lon,
      latitude: first.lat,
      memberCount: group.memberSourceIndexes.length,
      members: group.memberSourceIndexes.map((sourceIndex) => ({ sourceIndex, entryId: places[sourceIndex]!.entryId, sheet: places[sourceIndex]!.sheet, sourceUrl: places[sourceIndex]!.sourceUrl })),
    };
  });
  const groupById = new Map(groups.map((group) => [group.groupId, group]));
  const groupIdBySourceIndex = new Map(groups.flatMap((group) => group.members.map((member) => [member.sourceIndex, group.groupId] as const)));
  return {
    projection: { ...projection, groups },
    groupForSourceIndex(sourceIndex: number): EdoMapAggregateGroup | null {
      const id = groupIdBySourceIndex.get(sourceIndex);
      return id ? groupById.get(id) ?? null : null;
    },
  };
}

export function resolveEdoMapPresentation(places: readonly PlaceFeature[]) {
  return createEdoMapPresentationResolver(projectionJson, places);
}
