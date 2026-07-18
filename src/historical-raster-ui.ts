import type { HistoricalRasterDefinition } from "./historical-raster";

export interface HistoricalRasterViewport {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

export interface HistoricalRasterControlState {
  readonly showControls: boolean;
  readonly showSheetSelect: boolean;
  readonly selected: Readonly<HistoricalRasterDefinition> | null;
}

export function historicalRasterControlState(
  rasters: readonly Readonly<HistoricalRasterDefinition>[],
  requestedId: string,
  defaultId?: string,
): HistoricalRasterControlState {
  const selected = rasters.find((raster) => raster.id === requestedId)
    ?? rasters.find((raster) => raster.id === defaultId)
    ?? rasters[0]
    ?? null;
  return Object.freeze({
    showControls: rasters.length > 0,
    showSheetSelect: rasters.length > 1,
    selected,
  });
}

export function historicalRasterViewportStatus(
  viewport: HistoricalRasterViewport,
  bounds: HistoricalRasterDefinition["bounds"],
): string {
  const [[south, west], [north, east]] = bounds;
  const intersects = viewport.west <= east
    && viewport.east >= west
    && viewport.south <= north
    && viewport.north >= south;
  return intersects ? "" : "現在の表示範囲は、この古地図シートの対象範囲外です。";
}

export interface HistoricalRasterExtentMap {
  fitBounds(
    bounds: [[number, number], [number, number]],
    options: { animate: false },
  ): unknown;
}

export function fitHistoricalRasterExtent(
  map: HistoricalRasterExtentMap,
  definition: Readonly<HistoricalRasterDefinition>,
): void {
  map.fitBounds(
    [[...definition.bounds[0]], [...definition.bounds[1]]],
    { animate: false },
  );
}
