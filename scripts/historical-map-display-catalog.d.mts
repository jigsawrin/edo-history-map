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
export const HISTORICAL_MAP_ARTIFACT_KINDS: readonly ["historical-raster", "reference-asset"];
export const HISTORICAL_MAP_SPATIAL_KINDS: readonly [
  "georeferenced-coverage",
  "display-trigger-area",
];
export const HISTORICAL_MAP_CROP_REMOVED_ELEMENTS: readonly [
  "capture-background",
  "ruler",
  "color-chart",
  "shelfmark-label",
  "mounting-border",
  "non-content-margin",
];
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
export type HistoricalMapArtifactKind = (typeof HISTORICAL_MAP_ARTIFACT_KINDS)[number];
export type HistoricalMapSpatialKind = (typeof HISTORICAL_MAP_SPATIAL_KINDS)[number];
export type HistoricalMapCropRemovedElement =
  (typeof HISTORICAL_MAP_CROP_REMOVED_ELEMENTS)[number];
export type HistoricalMapRightsReviewStatus =
  (typeof HISTORICAL_MAP_RIGHTS_REVIEW_STATUSES)[number];
export type HistoricalMapTechnicalReviewStatus =
  (typeof HISTORICAL_MAP_TECHNICAL_REVIEW_STATUSES)[number];
export type HistoricalMapPublicationStatus =
  (typeof HISTORICAL_MAP_PUBLICATION_STATUSES)[number];
export type HistoricalMapDisplayCatalogStatus =
  (typeof HISTORICAL_MAP_DISPLAY_CATALOG_STATUSES)[number];

export type HistoricalMapPosition = readonly [number, number];
export type HistoricalMapLinearRing = readonly HistoricalMapPosition[];
export type HistoricalMapPolygonCoordinates = readonly HistoricalMapLinearRing[];
export type HistoricalMapMultiPolygonCoordinates = readonly HistoricalMapPolygonCoordinates[];

export type HistoricalMapCoverageGeometry =
  | {
      readonly type: "Polygon";
      readonly coordinates: HistoricalMapPolygonCoordinates;
    }
  | {
      readonly type: "MultiPolygon";
      readonly coordinates: HistoricalMapMultiPolygonCoordinates;
    };

export type HistoricalMapArtifactBinding =
  | {
      readonly kind: "historical-raster";
      readonly rasterId: string;
    }
  | {
      readonly kind: "reference-asset";
      readonly assetId: string;
    };

export type HistoricalMapSpatialBinding =
  | {
      readonly kind: "georeferenced-coverage";
      readonly geometry: HistoricalMapCoverageGeometry;
    }
  | {
      readonly kind: "display-trigger-area";
      readonly geometry: HistoricalMapCoverageGeometry;
    };

export interface HistoricalMapDisplayCrop {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: HistoricalMapDisplayRotation;
}

export interface HistoricalMapCropReview {
  readonly removedElements: readonly HistoricalMapCropRemovedElement[];
  readonly preservesHistoricalContent: boolean;
  readonly note: LocalizedText;
}

export interface HistoricalMapDisplayZoom {
  readonly minimum: number;
  readonly maximum: number;
  readonly enterDetailAt: number;
  readonly leaveDetailBelow: number;
}

export interface HistoricalMapDisplayEntry {
  readonly id: string;
  readonly name: LocalizedText;
  readonly displayRole: HistoricalMapDisplayRole;
  readonly displayMode: HistoricalMapDisplayMode;
  readonly artifactBinding: HistoricalMapArtifactBinding;
  readonly spatialBinding: HistoricalMapSpatialBinding;
  readonly crop: HistoricalMapDisplayCrop;
  readonly cropReview: HistoricalMapCropReview;
  readonly zoom: HistoricalMapDisplayZoom;
  readonly regionId: string;
  readonly eraId: string;
  readonly parentMapId?: string;
  readonly priority: number;
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
