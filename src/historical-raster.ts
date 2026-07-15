import L from "leaflet";

export interface HistoricalRasterDefinition {
  id: string;
  eraId: string;
  title: string;
  localTilePath: string;
  minZoom: number;
  maxZoom: number;
  bounds: [[number, number], [number, number]];
  opacity: number;
  attributionId: string;
  sourceId: string;
  georeferenceMethod: string;
  estimatedErrorMeters: number | null;
  reviewStatus: "approved" | "pending" | "rejected";
}

/**
 * DATA_SOURCES.yml の全権利条件を公開前監査で通過した source id だけを列挙する。
 * 現在は該当画像がないため空。台帳と監査を更新せずに画像を実行時登録できない。
 */
export const APPROVED_HISTORICAL_RASTER_SOURCE_IDS: readonly string[] = [];

/** 実行時レジストリ。権利確認済み画像がない現在は空。 */
export const HISTORICAL_RASTER_DEFINITIONS: readonly HistoricalRasterDefinition[] =
  [];

function isSafeLocalTilePath(path: string): boolean {
  return (
    path.startsWith("data/historical-rasters/") &&
    !path.includes("..") &&
    !path.includes(":") &&
    path.includes("{z}") &&
    path.includes("{x}") &&
    path.includes("{y}")
  );
}

function hasValidBounds(
  bounds: HistoricalRasterDefinition["bounds"],
): boolean {
  const [[south, west], [north, east]] = bounds;
  return (
    [south, west, north, east].every(Number.isFinite) &&
    south >= -90 &&
    north <= 90 &&
    west >= -180 &&
    east <= 180 &&
    south < north &&
    west < east
  );
}

export function getApprovedHistoricalRasters(
  definitions: readonly HistoricalRasterDefinition[] =
    HISTORICAL_RASTER_DEFINITIONS,
  approvedSourceIds: readonly string[] = APPROVED_HISTORICAL_RASTER_SOURCE_IDS,
): readonly HistoricalRasterDefinition[] {
  const approvedSources = new Set(approvedSourceIds);
  return definitions.filter(
    (definition) =>
      definition.reviewStatus === "approved" &&
      approvedSources.has(definition.sourceId) &&
      isSafeLocalTilePath(definition.localTilePath) &&
      definition.attributionId.length > 0 &&
      definition.georeferenceMethod.length > 0 &&
      definition.minZoom >= 0 &&
      definition.maxZoom >= definition.minZoom &&
      definition.opacity >= 0 &&
      definition.opacity <= 1 &&
      hasValidBounds(definition.bounds),
  );
}

/**
 * 既存の安全装置を維持した古地図画像フック。
 * 実行時レジストリと承認source一覧の両方を通過した定義以外は追加しない。
 */
export function addHistoricalImageLayer(
  rasterId?: string,
): L.TileLayer | null {
  if (!rasterId) return null;
  const definition = getApprovedHistoricalRasters().find(
    (candidate) => candidate.id === rasterId,
  );
  if (!definition) return null;
  return L.tileLayer(definition.localTilePath, {
    pane: "historical-raster-pane",
    minZoom: definition.minZoom,
    maxZoom: definition.maxZoom,
    bounds: definition.bounds,
    opacity: definition.opacity,
  });
}
