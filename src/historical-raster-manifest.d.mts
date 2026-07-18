import type { HistoricalRasterDefinition, HistoricalRasterTileFormat } from "./historical-raster";

export interface HistoricalRasterManifestFile { readonly path: string; readonly sha256: string; readonly bytes: number; readonly width: 256; readonly height: 256; }
export interface HistoricalRasterManifest { readonly schemaVersion: 1; readonly rasterId: string; readonly sourceId: string; readonly regionId: string; readonly eraId: string; readonly tileScheme: "xyz"; readonly tileFormat: HistoricalRasterTileFormat; readonly tileSize: 256; readonly minZoom: number; readonly maxZoom: number; readonly maxNativeZoom: number; readonly bounds: Readonly<{ south: number; west: number; north: number; east: number }>; readonly originalFileSha256: string; readonly georeferenceMetadataSha256: string; readonly tileCount: number; readonly totalBytes: number; readonly files: readonly HistoricalRasterManifestFile[]; }
export const HISTORICAL_RASTER_MANIFEST_SCHEMA_VERSION: 1;
export const HISTORICAL_RASTER_LIMITS: Readonly<{ maxTileBytes: number; maxTotalBytes: number; maxTileCount: number; tileSize: 256; maxZoom: number }>;
export function parseHistoricalRasterTilePath(value: unknown, format: HistoricalRasterTileFormat, minZoom: number, maxZoom: number): Readonly<{ zoom: number; x: number; y: number; format: HistoricalRasterTileFormat }>;
export function validateHistoricalRasterManifest(input: unknown): Readonly<HistoricalRasterManifest>;
export function assertManifestMatchesDefinition(manifest: HistoricalRasterManifest, definition: HistoricalRasterDefinition): HistoricalRasterManifest;
