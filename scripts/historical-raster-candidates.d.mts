export interface HistoricalRasterCandidateRegistry {
  readonly schemaVersion: 1;
  readonly reviewedAt: string;
  readonly commercialContextJa: string;
  readonly candidates: readonly Readonly<Record<string, unknown>>[];
}

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
