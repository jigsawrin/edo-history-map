import type { HistoricalRasterDefinition } from "../src/historical-raster";
export function auditHistoricalRasterRepository(root: string): Readonly<{ errors: readonly string[]; infos: readonly string[]; definitions: readonly HistoricalRasterDefinition[] }>;
