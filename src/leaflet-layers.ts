import L from "leaflet";
import {
  GSI_ATTRIBUTION,
  GSI_TILE_URLS,
  MAX_ZOOM,
  type BaseLayerKey,
} from "./config";
import type { HistoricalLayer } from "./historical";
import type { TransitionLayer } from "./layer-transition";

export const MAP_PANES = {
  modernBase: "modern-base-pane",
  historicalRaster: "historical-raster-pane",
  historicalArea: "historical-area-pane",
  historicalLine: "historical-line-pane",
  historicalPoints: "historical-points-pane",
  currentLocation: "current-location-pane",
  uiOverlay: "ui-overlay",
} as const;

/**
 * 下から順に: 現代基図(200)、歴史画像/安全背景(240)、面(320)、線(360)、
 * 地名(420)、現在地(650)、アプリUI(700)。現在地は常に歴史レイヤーより上。
 */
export const PANE_Z_INDEX: Readonly<Record<string, number>> = {
  [MAP_PANES.modernBase]: 200,
  [MAP_PANES.historicalRaster]: 240,
  [MAP_PANES.historicalArea]: 320,
  [MAP_PANES.historicalLine]: 360,
  [MAP_PANES.historicalPoints]: 420,
  [MAP_PANES.currentLocation]: 650,
  [MAP_PANES.uiOverlay]: 700,
};

export function createMapPanes(map: L.Map): ReadonlyMap<string, HTMLElement> {
  const panes = new Map<string, HTMLElement>();
  for (const [name, zIndex] of Object.entries(PANE_Z_INDEX)) {
    const pane = map.createPane(name);
    pane.style.zIndex = String(zIndex);
    // Canvas renderer は pane 配下の canvas でヒットテストするため、
    // 地名paneだけはイベントを受ける。背景系と現在地paneは地図操作を遮らない。
    pane.style.pointerEvents =
      name === MAP_PANES.historicalPoints ? "auto" : "none";
    panes.set(name, pane);
  }
  return panes;
}

class ReconstructedBackgroundLayer extends L.GridLayer {
  override createTile(): HTMLElement {
    const tile = document.createElement("div");
    tile.className = "reconstructed-base-tile";
    tile.setAttribute("aria-hidden", "true");
    return tile;
  }
}

export function createReconstructedBackground(): L.GridLayer {
  return new ReconstructedBackgroundLayer({
    pane: MAP_PANES.historicalRaster,
    minZoom: 5,
    maxZoom: MAX_ZOOM,
    updateWhenIdle: true,
  });
}

export class LeafletTransitionLayer implements TransitionLayer {
  readonly id: string;
  readonly #map: L.Map;
  readonly #layer: L.Layer;
  readonly #pane: HTMLElement;
  readonly #opacity: (opacity: number) => void;

  constructor(
    id: string,
    map: L.Map,
    layer: L.Layer,
    pane: HTMLElement,
    opacity: (opacity: number) => void,
  ) {
    this.id = id;
    this.#map = map;
    this.#layer = layer;
    this.#pane = pane;
    this.#opacity = opacity;
  }

  add(): void {
    if (!this.#map.hasLayer(this.#layer)) this.#layer.addTo(this.#map);
  }

  remove(): void {
    if (this.#map.hasLayer(this.#layer)) this.#map.removeLayer(this.#layer);
  }

  setOpacity(opacity: number): void {
    this.#opacity(Math.min(1, Math.max(0, opacity)));
  }

  setTransition(durationMs: number): void {
    if (durationMs > 0) void this.#pane.offsetWidth;
    this.#pane.style.transition =
      durationMs > 0 ? `opacity ${durationMs}ms ease-in-out` : "none";
  }
}

export class ModernBaseTransitionLayer implements TransitionLayer {
  readonly id = "modern-base";
  readonly #map: L.Map;
  readonly #pane: HTMLElement;
  readonly #layers: Record<BaseLayerKey, L.TileLayer>;
  #current: BaseLayerKey;
  #isAdded = false;
  #opacity = 1;

  constructor(
    map: L.Map,
    pane: HTMLElement,
    initial: BaseLayerKey,
  ) {
    this.#map = map;
    this.#pane = pane;
    this.#current = initial;
    this.#layers = {
      pale: L.tileLayer(GSI_TILE_URLS.pale, {
        attribution: GSI_ATTRIBUTION,
        maxZoom: MAX_ZOOM,
        pane: MAP_PANES.modernBase,
      }),
      std: L.tileLayer(GSI_TILE_URLS.std, {
        attribution: GSI_ATTRIBUTION,
        maxZoom: MAX_ZOOM,
        pane: MAP_PANES.modernBase,
      }),
    };
  }

  setBase(base: BaseLayerKey): void {
    if (base === this.#current) return;
    const previous = this.#layers[this.#current];
    this.#current = base;
    if (!this.#isAdded) return;
    if (this.#map.hasLayer(previous)) this.#map.removeLayer(previous);
    const next = this.#layers[this.#current];
    next.setOpacity(1);
    next.addTo(this.#map);
  }

  add(): void {
    this.#isAdded = true;
    const layer = this.#layers[this.#current];
    layer.setOpacity(1);
    this.#pane.style.opacity = String(this.#opacity);
    if (!this.#map.hasLayer(layer)) layer.addTo(this.#map);
  }

  remove(): void {
    this.#isAdded = false;
    for (const layer of Object.values(this.#layers)) {
      if (this.#map.hasLayer(layer)) this.#map.removeLayer(layer);
    }
  }

  setOpacity(opacity: number): void {
    this.#opacity = Math.min(1, Math.max(0, opacity));
    this.#pane.style.opacity = String(this.#opacity);
  }

  setTransition(durationMs: number): void {
    if (durationMs > 0) void this.#pane.offsetWidth;
    this.#pane.style.transition =
      durationMs > 0 ? `opacity ${durationMs}ms ease-in-out` : "none";
  }
}

export function createHistoricalPointsTransitionLayer(
  map: L.Map,
  historical: HistoricalLayer,
  pane: HTMLElement,
): TransitionLayer {
  return new LeafletTransitionLayer(
    "historical-points",
    map,
    historical.layer,
    pane,
    (opacity) => historical.setOpacity(opacity),
  );
}
