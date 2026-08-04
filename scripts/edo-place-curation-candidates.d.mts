/* eslint-disable @typescript-eslint/no-explicit-any */
export const EDO_CURATION_CATALOG_PATH: string;
export const EDO_SOURCE_DATASET_ID: string;
export const EDO_SOURCE_DATA_PATH: string;
export const EDO_SOURCE_SHA256: string;
export const EDO_SOURCE_FEATURE_COUNT: number;
export function calculateEdoSourceFeatureSha256(feature: unknown): string;
export function validateEdoPlaceCurationCatalog(value: any, sourceGeoJson: any): any;
export function auditEdoPlaceCurationLeakage(root: string): string[];
export function summarizeEdoPlaceCurationCandidates(catalog: any): {
  count: number;
  approvedCount: number;
  statuses: Record<string, number>;
  types: Record<string, number>;
};
export function auditEdoPlaceCurationCandidateRepository(root?: string): {
  catalog: any;
  errors: string[];
};
