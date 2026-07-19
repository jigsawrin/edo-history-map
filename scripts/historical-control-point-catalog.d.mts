export const HISTORICAL_CONTROL_POINT_CATALOG_SCHEMA_VERSION: 1;
export const HISTORICAL_CONTROL_POINT_CATALOG_STATUSES: readonly ["empty-foundation", "reviewed"];
export const HISTORICAL_CONTROL_POINT_FEATURE_TYPES: readonly [
  "castle-gate",
  "moat-corner",
  "bridge",
  "temple",
  "shrine",
  "stone-wall",
  "river-junction",
  "road-junction",
  "other",
];
export const HISTORICAL_CONTROL_POINT_EXISTENCE: readonly [
  "extant",
  "archaeological-remains",
  "officially-located-lost-site",
  "uncertain",
];
export const HISTORICAL_CONTROL_POINT_MOVED_STATUSES: readonly [
  "not-moved",
  "possibly-moved",
  "moved",
  "unknown",
];
export const HISTORICAL_CONTROL_POINT_COORDINATE_ACCURACY: readonly [
  "surveyed",
  "official-gis",
  "official-published-coordinate",
  "official-map-derived",
  "approximate",
  "unknown",
];
export const HISTORICAL_CONTROL_POINT_ELIGIBILITY: readonly [
  "eligible-candidate",
  "validation-only-candidate",
  "hold",
  "rejected",
];

export interface LocalizedText {
  readonly ja: string;
  readonly en?: string;
}

export type HistoricalControlPointFeatureType =
  (typeof HISTORICAL_CONTROL_POINT_FEATURE_TYPES)[number];
export type HistoricalControlPointExistence =
  (typeof HISTORICAL_CONTROL_POINT_EXISTENCE)[number];
export type HistoricalControlPointMovedStatus =
  (typeof HISTORICAL_CONTROL_POINT_MOVED_STATUSES)[number];
export type HistoricalControlPointCoordinateAccuracy =
  (typeof HISTORICAL_CONTROL_POINT_COORDINATE_ACCURACY)[number];
export type HistoricalControlPointEligibility =
  (typeof HISTORICAL_CONTROL_POINT_ELIGIBILITY)[number];
export type HistoricalControlPointCatalogStatus =
  (typeof HISTORICAL_CONTROL_POINT_CATALOG_STATUSES)[number];

export interface HistoricalControlPointCatalogEntry {
  readonly id: string;
  readonly name: LocalizedText;
  readonly description: LocalizedText;
  readonly featureType: HistoricalControlPointFeatureType;
  readonly currentExistence: HistoricalControlPointExistence;
  readonly movedStatus: HistoricalControlPointMovedStatus;
  readonly latitude: number;
  readonly longitude: number;
  readonly coordinateAccuracy: HistoricalControlPointCoordinateAccuracy;
  readonly eligibility: HistoricalControlPointEligibility;
  readonly applicableRegionIds: readonly string[];
  readonly applicableEraIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly evidenceUrls: readonly string[];
  readonly identityBasis: LocalizedText;
  readonly coordinateBasis: LocalizedText;
  readonly rejectionReason?: LocalizedText;
}

export interface HistoricalControlPointCatalog {
  readonly schemaVersion: 1;
  readonly reviewedAt: string | null;
  readonly catalogStatus: HistoricalControlPointCatalogStatus;
  readonly entries: readonly HistoricalControlPointCatalogEntry[];
}

export interface HistoricalControlPointCatalogSummary {
  readonly schemaVersion: 1;
  readonly catalogStatus: HistoricalControlPointCatalogStatus;
  readonly entryCount: number;
  readonly eligibleCandidateCount: number;
  readonly validationOnlyCandidateCount: number;
  readonly holdCount: number;
  readonly rejectedCount: number;
  readonly transformPromotionCount: 0;
}

export function validateCatalogLocalizedText(value: unknown, label: string): LocalizedText;
export function validateHistoricalControlPointCatalog(value: unknown): HistoricalControlPointCatalog;
export function loadHistoricalControlPointCatalog(root: string): HistoricalControlPointCatalog;
export function summarizeHistoricalControlPointCatalog(
  catalog: HistoricalControlPointCatalog,
): HistoricalControlPointCatalogSummary;
export function auditHistoricalControlPointCatalogRepository(root: string): {
  readonly errors: readonly string[];
  readonly catalog: HistoricalControlPointCatalog | null;
};
