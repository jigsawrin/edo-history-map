import type { HistoricalRasterDefinition } from "./historical-raster";

export const HISTORICAL_RASTER_REVIEW_STATUSES: readonly ["approved", "pending", "rejected"];
export const HISTORICAL_RASTER_TILE_FORMATS: readonly ["png", "webp"];
export const HISTORICAL_RASTER_GEOREFERENCE_METHODS: readonly ["projective", "polynomial-1", "polynomial-2", "thin-plate-spline", "map-warper-export", "other"];
export const HISTORICAL_RASTER_SEAM_POLICIES: readonly ["single-sheet", "manual-selection", "fixed-priority"];
export function validateHistoricalRasterDefinition(input: unknown, label?: string): Readonly<HistoricalRasterDefinition>;
export function validateHistoricalRasterDefinitions(input: unknown): readonly Readonly<HistoricalRasterDefinition>[];
