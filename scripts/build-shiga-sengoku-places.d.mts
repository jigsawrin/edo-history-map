export interface ShigaBuildResult {
  output: string;
  sha256: string;
  featureCount: number;
  sourceCount: number;
  counts: Readonly<Record<string, unknown>>;
}
export function buildShigaGeoJson(): ShigaBuildResult;
