export type RightsPermission = "allowed" | "prohibited" | "unknown";
export type DescriptionStatus = "proposed" | "in-review" | "approved" | "rejected" | "withdrawn";
export type CompositionMode = "editorial-summary" | "direct-quote";
export type EpistemicStatus = "historical-fact" | "inference" | "tradition";
export type EvidenceRole = "fact-verification" | "text-reuse";

export interface HistoricalDescriptionPublicProjection {
  schemaVersion: 1;
  projectionStatus: "non-runtime-foundation";
  sourceDataSha256: string;
  sourceFeatureCount: 8788;
  approvedDescriptionCount: number;
  descriptions: readonly unknown[];
}

export function canonicalDescriptionContentSha256(textJa: string): string;
export function validateDescriptionRightsRegistry(value: unknown): unknown;
export function validateHistoricalPlaceDescriptionCatalog(value: unknown, sourceGeoJson: unknown, rightsRegistryValue: unknown): unknown;
export function createHistoricalPlaceDescriptionPublicProjection(catalogValue: unknown, rightsRegistryValue: unknown, sourceGeoJson: unknown): HistoricalDescriptionPublicProjection;
export function isHistoricalPlaceDescriptionTranslationStale(description: { content: { ja: { text: string } } }, translation: { translationOfContentSha256: string }): boolean;
export function validateHistoricalPlaceDescriptionPublicProjection(value: unknown, expected: HistoricalDescriptionPublicProjection): unknown;
export function auditHistoricalPlaceDescriptionPrivateLeakage(root: string): string[];
export function summarizeHistoricalPlaceDescriptions(catalog: { descriptions: readonly { status: DescriptionStatus }[] }, projection: HistoricalDescriptionPublicProjection): { count: number; proposedCount: number; approvedCount: number; publicCount: number; canonicalOutputSha256: string };
export function auditHistoricalPlaceDescriptionRepository(root?: string): { errors: string[]; catalog: unknown | null; projection: HistoricalDescriptionPublicProjection | null; summary: ReturnType<typeof summarizeHistoricalPlaceDescriptions> | null };
