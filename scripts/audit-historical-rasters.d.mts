import type { HistoricalRasterDefinition } from "../src/historical-raster";
export function auditHistoricalRasterRepository(root: string): Readonly<{ errors: readonly string[]; infos: readonly string[]; definitions: readonly HistoricalRasterDefinition[] }>;
export function validateHistoricalRasterSourceCandidates(
  definitions: readonly { readonly id: string; readonly sourceId: string }[],
  candidates: readonly { readonly candidateId: string; readonly intendedUses: readonly string[] }[],
): readonly string[];
