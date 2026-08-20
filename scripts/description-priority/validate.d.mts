/* eslint-disable @typescript-eslint/no-explicit-any */
export const DESCRIPTION_PRIORITY_CATALOG_PATH: string;
export const DESCRIPTION_PRIORITY_SCHEMA_VERSION: number;
export const DESCRIPTION_PRIORITY_GENERATOR_VERSION: number;
export const DESCRIPTION_PRIORITY_CANDIDATE_COUNT: number;
export const DESCRIPTION_PRIORITY_PER_CATEGORY: number;
export const DESCRIPTION_PRIORITY_CATEGORIES: readonly string[];
export const DESCRIPTION_PRIORITY_TIERS: readonly string[];
export function canonicalDescriptionPriorityCatalogSha256(value: unknown): string;
export function validateDescriptionPriorityCatalog(value: any, sourceGeoJson: any): any;
