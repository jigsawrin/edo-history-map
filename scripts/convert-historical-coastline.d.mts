export interface CoastlineConversionStats {
  inputShpSha256: string;
  inputRecords: number;
  inputParts: number;
  inputVertices: number;
  inputBounds: number[];
  excludedNullRecords: number[];
  excludedDuplicateCoordinateRecords: number[];
  removedRoundedDuplicateCoordinates: number;
  outputFeatures: number;
  outputGeometryTypes: Record<string, number>;
  outputVertices: number;
  outputBytes: number;
  outputSha256: string;
  targetBounds: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  processing: string;
}

export class CoastlineConversionError extends Error {}
export const COASTLINE_SOURCE_ID: string;
export const REVIEWED_SHP_SHA256: string;
export const COASTLINE_TARGET_BOUNDS: Readonly<{
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}>;
export function convertHistoricalCoastlineShapefile(input: {
  shp: Buffer;
  dbf: Buffer;
  prj: Buffer;
  cpg: Buffer;
  targetBounds?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
}): { geojson: string; stats: CoastlineConversionStats };
export function convertHistoricalCoastlineFile(inputPath: string, outputPath: string): CoastlineConversionStats;
