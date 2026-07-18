import type { HistoricalRasterDefinition } from "../src/historical-raster";
import type { HistoricalRasterManifest } from "../src/historical-raster-manifest.mjs";
export function inspectHistoricalRasterImage(buffer: Buffer, expectedFormat: "png" | "webp"): Readonly<{ width: number; height: number; format: "png" | "webp" }>;
export function verifyHistoricalRasterPackage(options: { readonly manifestPath: string; readonly tileRoot?: string; readonly definition?: HistoricalRasterDefinition }): Readonly<{ manifest: HistoricalRasterManifest; manifestSha256: string; tileCount: number; totalBytes: number }>;
