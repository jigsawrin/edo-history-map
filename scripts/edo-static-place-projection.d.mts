export interface EdoStaticLegacyPlace {
  readonly sourceIndex: number;
  readonly key: string;
  readonly anchor: string;
  readonly entryId: string;
  readonly name: string;
  readonly featureSha256: string;
}

export interface EdoStaticPlaceProjectionOverride {
  sourceRecordId: string;
  sourceIndex: number;
  featureSha256: string;
  displayName: string | null;
  hidden: boolean;
}

export interface EdoStaticPlaceProjection {
  schemaVersion: 1;
  sourceDataSha256: string;
  sourceFeatureCount: number;
  eligibleSourceCount: number;
  legacyLayoutSha256: string;
  overrides: EdoStaticPlaceProjectionOverride[];
}

export const EDO_STATIC_PLACE_PROJECTION_SCHEMA_VERSION: 1;
export function canonicalEdoStaticLegacyLayout(places: readonly EdoStaticLegacyPlace[], perPage: number): Array<{ sourceIndex: number; legacyKey: string; anchor: string; pageNumber: number; pageSlot: number }>;
export function calculateEdoStaticLegacyLayoutSha256(places: readonly EdoStaticLegacyPlace[], perPage: number): string;
export function validateEdoStaticPlaceProjection(projection: EdoStaticPlaceProjection, places: readonly EdoStaticLegacyPlace[], options: { sourceDataSha256: string; perPage: number }): EdoStaticPlaceProjection;
export function applyEdoStaticPlaceProjection<T extends EdoStaticLegacyPlace>(places: readonly T[], projection: EdoStaticPlaceProjection): ReadonlyArray<Readonly<T & { displayName: string; hidden: boolean }>>;
