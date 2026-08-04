import type { HistoricalRasterDefinition } from "../../src/historical-raster";

export function rasterDefinition(
  overrides: Partial<HistoricalRasterDefinition> = {},
): HistoricalRasterDefinition {
  return {
    id: "project-grid", regionId: "edo", eraId: "edo-late",
    titleJa: "権利確認済みテスト定義", sheetLabelJa: "テスト格子",
    localTilePath: "data/historical-rasters/project-grid/{z}/{x}/{y}.png",
    tileManifestPath: "data/historical-rasters/project-grid/tile-manifest.json",
    tileFormat: "png", tileSize: 256, minZoom: 1, maxZoom: 1, maxNativeZoom: 1,
    bounds: [[35.6, 139.7], [35.7, 139.8]], defaultOpacity: 0.8,
    attributionId: "gsi-tiles", sourceId: "project-generated-fixture",
    georeferenceMethod: "projective", controlPointCount: 4,
    estimatedErrorMeters: 12, maximumErrorMeters: 25,
    qualityGateVersion: 1, qualityGatePassed: true,
    sourceDateDisplayJa: "テスト用（実在資料ではありません）",
    geographicCoverageJa: "テスト専用格子範囲",
    georeferenceNoteJa: "四隅の自作基準点で検証します。",
    contextNoteJa: "利用者向けの古地図として表示しません。",
    seamPolicy: "single-sheet", priority: 10, reviewStatus: "approved",
    ...overrides,
  };
}
