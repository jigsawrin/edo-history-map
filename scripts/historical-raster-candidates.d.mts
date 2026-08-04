export type HistoricalSourceIntendedUse = "georeferenced-overlay" | "reference-panel";

export interface HistoricalRasterCandidate extends Readonly<Record<string, unknown>> {
  readonly intendedUses: readonly HistoricalSourceIntendedUse[];
}

export interface HistoricalRasterCandidateRegistry {
  readonly schemaVersion: 3;
  readonly reviewedAt: string;
  readonly commercialContextJa: string;
  readonly candidates: readonly HistoricalRasterCandidate[];
}

export function migrateHistoricalRasterCandidateRegistryV1(value: unknown): unknown;
export function migrateHistoricalRasterCandidateRegistryV2(value: unknown): unknown;
export const HISTORICAL_SOURCE_INTENDED_USES: readonly HistoricalSourceIntendedUse[];

export interface HistoricalRasterCandidateSummary {
  readonly total: number;
  readonly institutions: number;
  readonly approved: number;
  readonly pending: number;
  readonly rejected: number;
  readonly commercialUseCompatible: number;
}

export function validateHistoricalRasterCandidateRegistry(value: unknown): HistoricalRasterCandidateRegistry;
export function loadHistoricalRasterCandidateRegistry(root: string): HistoricalRasterCandidateRegistry;
export function summarizeHistoricalRasterCandidates(registry: HistoricalRasterCandidateRegistry): HistoricalRasterCandidateSummary;
export function auditHistoricalRasterCandidateRepository(root: string): {
  readonly errors: readonly string[];
  readonly registry: HistoricalRasterCandidateRegistry | null;
};
