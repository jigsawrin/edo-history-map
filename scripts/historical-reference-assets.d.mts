export const HISTORICAL_REFERENCE_ASSET_SCHEMA_VERSION: 1;
export const HISTORICAL_REFERENCE_ASSET_CATALOG_STATUSES: readonly [
  "empty-foundation",
  "reviewed",
];
export const REFERENCE_ASSET_RIGHTS_STATUSES: readonly ["approved", "pending", "rejected"];
export const REFERENCE_ASSET_TECHNICAL_STATUSES: readonly [
  "not-started",
  "in-review",
  "approved",
  "rejected",
];
export const REFERENCE_ASSET_PUBLICATION_STATUSES: readonly [
  "candidate",
  "shortlisted",
  "published",
];
export const REFERENCE_ASSET_REMOVED_ELEMENTS: readonly [
  "capture-background",
  "ruler",
  "color-chart",
  "shelfmark-label",
  "mounting-border",
  "non-content-margin",
];
export const REFERENCE_ASSET_ORIGINAL_MIME_TYPES: readonly [
  "image/jpeg",
  "image/png",
  "image/webp",
];
export const REFERENCE_ASSET_DERIVED_MIME_TYPES: readonly ["image/png", "image/webp"];
export const REFERENCE_ASSET_ROTATIONS: readonly [0, 90, 180, 270];
export const REFERENCE_ASSET_LICENSE_CATEGORIES: readonly [
  "public-domain",
  "cc0",
  "cc-by",
  "custom-commercial-open",
  "restricted",
  "unknown",
];

export interface LocalizedText {
  readonly ja: string;
  readonly en?: string;
}

export type ReferenceAssetRightsStatus = (typeof REFERENCE_ASSET_RIGHTS_STATUSES)[number];
export type ReferenceAssetTechnicalStatus = (typeof REFERENCE_ASSET_TECHNICAL_STATUSES)[number];
export type ReferenceAssetPublicationStatus =
  (typeof REFERENCE_ASSET_PUBLICATION_STATUSES)[number];
export type ReferenceAssetRemovedElement = (typeof REFERENCE_ASSET_REMOVED_ELEMENTS)[number];
export type ReferenceAssetCatalogStatus =
  (typeof HISTORICAL_REFERENCE_ASSET_CATALOG_STATUSES)[number];
export type ReferenceAssetOriginalMimeType =
  (typeof REFERENCE_ASSET_ORIGINAL_MIME_TYPES)[number];
export type ReferenceAssetDerivedMimeType = (typeof REFERENCE_ASSET_DERIVED_MIME_TYPES)[number];
export type ReferenceAssetRotationDegrees = (typeof REFERENCE_ASSET_ROTATIONS)[number];
export type ReferenceAssetLicenseCategory = (typeof REFERENCE_ASSET_LICENSE_CATEGORIES)[number];

export interface ReferenceAssetOriginalFile {
  readonly fileName: string;
  readonly mimeType: ReferenceAssetOriginalMimeType;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly rawPath: string;
}

export interface ReferenceAssetCrop {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: ReferenceAssetRotationDegrees;
}

export interface ReferenceAssetDerivedFile {
  readonly mimeType: ReferenceAssetDerivedMimeType;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly derivedPath: string;
  readonly publicPath?: string;
}

export interface HistoricalReferenceAsset {
  readonly id: string;
  readonly sourceId: string;
  readonly title: LocalizedText;
  readonly description: LocalizedText;
  readonly rightsReviewStatus: ReferenceAssetRightsStatus;
  readonly technicalReviewStatus: ReferenceAssetTechnicalStatus;
  readonly publicationStatus: ReferenceAssetPublicationStatus;
  readonly licenseCode: string;
  readonly licenseCategory: ReferenceAssetLicenseCategory;
  readonly licenseUrl: string;
  readonly attribution: LocalizedText;
  readonly derivativeDisclosure: LocalizedText;
  readonly commercialUseAllowed: boolean;
  readonly redistributionAllowed: boolean;
  readonly modificationAllowed: boolean;
  readonly croppingAllowed: boolean;
  readonly originalFile: ReferenceAssetOriginalFile;
  readonly crop: ReferenceAssetCrop;
  readonly removedElements: readonly ReferenceAssetRemovedElement[];
  readonly preservesHistoricalContent: boolean;
  readonly cropReviewNote: LocalizedText;
  readonly derivedFile?: ReferenceAssetDerivedFile;
}

export interface HistoricalReferenceAssetCatalog {
  readonly schemaVersion: 1;
  readonly catalogStatus: ReferenceAssetCatalogStatus;
  readonly reviewedAt: string | null;
  readonly assets: readonly HistoricalReferenceAsset[];
}

export interface HistoricalReferenceAssetCatalogSummary {
  readonly schemaVersion: 1;
  readonly catalogStatus: ReferenceAssetCatalogStatus;
  readonly assetCount: number;
  readonly publishedCount: number;
  readonly approvedRightsCount: number;
  readonly runtimeConnected: false;
}

export const RUNTIME_REFERENCE_ASSET_REFERENCE_NEEDLES: readonly string[];

export function validateReferenceAssetLocalizedText(value: unknown, label: string): LocalizedText;
export function validateHistoricalReferenceAssetCatalog(
  value: unknown,
): HistoricalReferenceAssetCatalog;
export function loadHistoricalReferenceAssetCatalog(root: string): HistoricalReferenceAssetCatalog;
export function summarizeHistoricalReferenceAssetCatalog(
  catalog: HistoricalReferenceAssetCatalog,
): HistoricalReferenceAssetCatalogSummary;
export function findRuntimeHistoricalReferenceAssetReferences(root: string): readonly {
  readonly file: string;
  readonly needle: string;
}[];
export interface HistoricalReferenceAssetFileVerificationOptions {
  readonly requireRawFiles: boolean;
  readonly requireDerivedFiles: boolean;
  readonly requirePublicFiles: boolean;
}
export function verifyHistoricalReferenceAssetFiles(
  root: string,
  catalog: HistoricalReferenceAssetCatalog,
  options?: Partial<HistoricalReferenceAssetFileVerificationOptions>,
): {
  readonly rawFiles: readonly unknown[];
  readonly derivedFiles: readonly unknown[];
  readonly publicFiles: readonly string[];
};
export function createHistoricalReferenceAssetStaticManifest(catalog: HistoricalReferenceAssetCatalog): {
  readonly schemaVersion: 1;
  readonly assetCount: number;
  readonly files: readonly {
    readonly publicPath: string;
    readonly sha256: string;
    readonly bytes: number;
  }[];
};
export function auditHistoricalReferenceAssetRepository(root: string, options?: { readonly verifyLocal?: boolean }): {
  readonly errors: readonly string[];
  readonly catalog: HistoricalReferenceAssetCatalog | null;
};
