export type EdoDerivedSurface = "map" | "search" | "card" | "static-page";
export type EdoDerivedReviewState =
  | "source-only"
  | "needs-human-review"
  | "curation-approved";

export interface EdoDerivedPlace {
  schemaVersion: 1;
  derivedPlaceId: string;
  sourceDatasetId: "codh-edo-maps-places";
  sourceIdentityGroupId: string | null;
  memberSourceRecordIds: string[];
  displayRepresentativeSourceRecordId: string;
  displayName: {
    value: string;
    basis: "source-record" | "approved-rename";
    sourceRecordId: string;
    curationCandidateId: string | null;
  };
  sourceNames: Array<{ sourceRecordId: string; value: string }>;
  sourceDifferences: {
    hasNameDifference: boolean;
    hasCategoryDifference: boolean;
    hasSheetDifference: boolean;
    categories: string[];
    sheets: string[];
  };
  location: {
    longitude: number;
    latitude: number;
    basisSourceRecordId: string;
    certainty: "source-point-unassessed";
  };
  curation: {
    hide: { decision: "none" | "approved"; candidateId: string | null };
    rename: { decision: "none" | "approved"; candidateId: string | null };
    annotations: Array<{ candidateId: string; text: string }>;
  };
  evidence: Array<{
    kind: "source-record" | "source-identity-relation" | "manual-curation";
    id: string;
    sourceUrl: string | null;
  }>;
  rights: {
    license: "CC BY 4.0";
    attribution: string;
    sourceUrl: string;
  };
  applicability: Record<EdoDerivedSurface, boolean>;
  reviewState: EdoDerivedReviewState;
  reverseMapping: Array<{
    sourceRecordId: string;
    sourceIndex: number;
    sourceFeatureSha256: string;
  }>;
}

export interface EdoDerivedPlaceAuditSnapshot {
  schemaVersion: 1;
  snapshotStatus: "non-runtime-foundation";
  sourceDataSha256: string;
  sourceFeatureCount: 8788;
  sourceIdentityGroupCount: 825;
  sourceIdentityMemberCount: 1693;
  curationCandidateCount: 0;
  derivedPlaceCount: 8788;
  reverseMappedSourceRecordCount: 8788;
  multiMemberDerivedPlaceCount: 0;
  hiddenDerivedPlaceCount: 0;
  renamedDerivedPlaceCount: 0;
  annotatedDerivedPlaceCount: 0;
  runtimeApplicableDerivedPlaceCount: 0;
  canonicalOutputSha256: string;
}

export const EDO_DERIVED_PLACE_SCHEMA_VERSION: 1;
export const EDO_DERIVED_PLACE_SNAPSHOT: Readonly<EdoDerivedPlaceAuditSnapshot>;
export function deriveEdoPlaces(sourceGeoJson: unknown, identityCatalog: unknown, curationCatalog: unknown): EdoDerivedPlace[];
export function validateEdoDerivedPlaces(places: EdoDerivedPlace[], sourceGeoJson: unknown, identityCatalog: unknown): void;
export function canonicalEdoDerivedPlacesSha256(places: EdoDerivedPlace[]): string;
export function summarizeEdoDerivedPlaces(places: EdoDerivedPlace[], identityCatalog: unknown, curationCatalog: unknown): EdoDerivedPlaceAuditSnapshot;
export function validateEdoDerivedPlaceSnapshot(snapshot: EdoDerivedPlaceAuditSnapshot, expected: EdoDerivedPlaceAuditSnapshot): void;
export function auditEdoDerivedPlaceLeakage(root: string): string[];
export function auditEdoDerivedPlaceRepository(root?: string): { errors: string[]; summary: EdoDerivedPlaceAuditSnapshot | null };
