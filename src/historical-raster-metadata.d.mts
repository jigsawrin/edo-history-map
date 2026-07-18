import type { HistoricalRasterGeoreferenceMethod } from "./historical-raster";
export interface HistoricalRasterControlPoint { readonly id: string; readonly pixelX: number; readonly pixelY: number; readonly latitude: number; readonly longitude: number; readonly basisJa: string; readonly confidence: "high" | "medium" | "low"; readonly sourceIds: readonly string[]; }
export interface HistoricalRasterControlPoints { readonly schemaVersion: 1; readonly rasterId: string; readonly imageWidth: number; readonly imageHeight: number; readonly points: readonly HistoricalRasterControlPoint[]; }
export interface HistoricalRasterGeoreference { readonly schemaVersion: 1; readonly rasterId: string; readonly method: HistoricalRasterGeoreferenceMethod; readonly controlPointCount: number; readonly software: string; readonly softwareVersion: string; readonly meanErrorMeters: number | null; readonly medianErrorMeters: number | null; readonly maximumErrorMeters: number | null; readonly geographicCoverageJa: string; readonly distortionNoteJa: string; readonly adjacentSheetNoteJa: string; readonly controlPointsSha256: string; readonly transformationParametersSha256: string; }
export const HISTORICAL_RASTER_CONTROL_POINT_SCHEMA_VERSION: 1;
export const HISTORICAL_RASTER_GEOREFERENCE_SCHEMA_VERSION: 1;
export const HISTORICAL_RASTER_CONTROL_POINT_CONFIDENCES: readonly ["high", "medium", "low"];
export function validateHistoricalRasterControlPoints(input: unknown): Readonly<HistoricalRasterControlPoints>;
export function hasDistributedControlPoints(controlPoints: HistoricalRasterControlPoints): boolean;
export function validateHistoricalRasterGeoreference(input: unknown): Readonly<HistoricalRasterGeoreference>;
