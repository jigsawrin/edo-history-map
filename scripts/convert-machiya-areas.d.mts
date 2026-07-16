import type { Buffer } from "node:buffer";

export interface ConversionStats {
  inputRecords: number;
  outputFeatures: number;
  excluded: number;
  excludedRings: number;
  warnings: string[];
  polygonFeatures: number;
  multiPolygonFeatures: number;
  totalVertices: number;
  sourceBounds: number[];
  outputBytes: number;
  outputSha256: string;
  simplification: "none";
  coordinateRoundingDigits: 6;
}

export function sanitizeSourceText(value: unknown): string;
export function convertMachiyaShapefile(input: {
  shp: Buffer;
  dbf: Buffer;
  prj: string;
  cpg: string;
}): {
  collection: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      geometry: {
        type: "Polygon" | "MultiPolygon";
        coordinates: unknown;
      };
      properties: Record<string, string>;
    }>;
  };
  text: string;
  stats: ConversionStats;
};

export function convertMachiyaShapefileFile(
  inputPath: string,
  outputPath: string,
): ConversionStats;
