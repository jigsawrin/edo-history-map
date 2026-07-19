export const HISTORICAL_MAP_DISPLAY_CATALOG_SCHEMA_VERSION: 1;
export const HISTORICAL_MAP_DISPLAY_CATALOG_STATUSES: readonly ["empty-foundation", "reviewed"];
export const HISTORICAL_MAP_DISPLAY_ROLES: readonly [
  "overview",
  "regional",
  "detail",
  "reference-only",
];
export const HISTORICAL_MAP_DISPLAY_MODES: readonly [
  "georeferenced-overlay",
  "reference-panel",
];
export const HISTORICAL_MAP_DISPLAY_ROTATIONS: readonly [0, 90, 180, 270];
export const HISTORICAL_MAP_RIGHTS_REVIEW_STATUSES: readonly ["approved", "pending", "rejected"];
export const HISTORICAL_MAP_TECHNICAL_REVIEW_STATUSES: readonly [
  "not-started",
  "in-review",
  "approved",
  "rejected",
];
export const HISTORICAL_MAP_PUBLICATION_STATUSES: readonly [
  "candidate",
  "shortlisted",
  "published",
];
export const RUNTIME_MAP_DISPLAY_REFERENCE_NEEDLES: readonly string[];

export interface LocalizedText {
  readonly ja: string;
  readonly en?: string;
}

export type HistoricalMapDisplayRole = (typeof HISTORICAL_MAP_DISPLAY_ROLES)[number];
export type HistoricalMapDisplayMode = (typeof HISTORICAL_MAP_DISPLAY_MODES)[number];
export type HistoricalMapDisplayRotation = (typeof HISTORICAL_MAP_DISPLAY_ROTATIONS)[number];
export type HistoricalMapRightsReviewStatus =
  (typeof HISTORICAL_MAP_RIGHTS_REVIEW_STATUSES)[number];
export type HistoricalMapTechnicalReviewStatus =
  (typeof HISTORICAL_MAP_TECHNICAL_REVIEW_STATUSES)[number];
export type HistoricalMapPublicationStatus =
  (typeof HISTORICAL_MAP_PUBLICATION_STATUSES)[number];
export type HistoricalMapDisplayCatalogStatus =
  (typeof HISTORICAL_MAP_DISPLAY_CATALOG_STATUSES)[number];

export interface HistoricalMapDisplayCrop {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: HistoricalMapDisplayRotation;
}

export interface HistoricalMapDisplayZoom {
  readonly minimum: number;
  readonly maximum: number;
  readonly enterDetailAt: number;
  readonly leaveDetailBelow: number;
}

export interface HistoricalMapCoveragePolygon {
  readonly type: "Polygon" | "MultiPolygon";
  readonly coordinates: readonly unknown[];
}

export interface HistoricalMapDisplayEntry {
  readonly id: string;
  readonly name: LocalizedText;
  readonly displayRole: HistoricalMapDisplayRole;
  readonly displayMode: HistoricalMapDisplayMode;
  readonly crop: HistoricalMapDisplayCrop;
  readonly zoom: HistoricalMapDisplayZoom;
  readonly regionId: string;
  readonly eraId: string;
  readonly parentMapId?: string;
  readonly priority: number;
  readonly coveragePolygon: HistoricalMapCoveragePolygon;
  readonly sourceId: string;
  readonly rightsReviewStatus: HistoricalMapRightsReviewStatus;
  readonly technicalReviewStatus: HistoricalMapTechnicalReviewStatus;
  readonly publicationStatus: HistoricalMapPublicationStatus;
}

export interface HistoricalMapDisplayCatalog {
  readonly schemaVersion: 1;
  readonly catalogStatus: HistoricalMapDisplayCatalogStatus;
  readonly reviewedAt: string | null;
  readonly maps: readonly HistoricalMapDisplayEntry[];
}

export interface HistoricalMapDisplayCatalogSummary {
  readonly schemaVersion: 1;
  readonly catalogStatus: HistoricalMapDisplayCatalogStatus;
  readonly mapCount: number;
  readonly publishedCount: number;
  readonly technicalApprovedCount: number;
  readonly runtimeEligibleCount: number;
  readonly runtimeConnected: false;
}

export function validateMapDisplayLocalizedText(value: unknown, label: string): LocalizedText;
export function validateHistoricalMapDisplayCatalog(value: unknown): HistoricalMapDisplayCatalog;
export function loadHistoricalMapDisplayCatalog(root: string): HistoricalMapDisplayCatalog;
export function summarizeHistoricalMapDisplayCatalog(
  catalog: HistoricalMapDisplayCatalog,
): HistoricalMapDisplayCatalogSummary;
export function findRuntimeHistoricalMapDisplayCatalogReferences(root: string): readonly {
  readonly file: string;
  readonly needle: string;
}[];
export function auditHistoricalMapDisplayCatalogRepository(root: string): {
  readonly errors: readonly string[];
  readonly catalog: HistoricalMapDisplayCatalog | null;
};
