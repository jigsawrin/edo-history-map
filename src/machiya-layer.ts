import L from "leaflet";
import { VISUAL_LAYER_IDS } from "./eras";
import { MAP_PANES } from "./leaflet-layers";
import type { MachiyaAreaCollection } from "./machiya-areas";
import type { TransitionLayer } from "./layer-transition";

export const MACHIYA_STYLE: L.PathOptions = {
  color: "#7b4527",
  weight: 1.25,
  opacity: 0.9,
  dashArray: "5 3",
  lineCap: "butt",
  fillColor: "#c47b4a",
  fillOpacity: 1,
  interactive: false,
  bubblingMouseEvents: false,
};

export class MachiyaAreaTransitionLayer implements TransitionLayer {
  readonly id = VISUAL_LAYER_IDS.historicalCommonerAreas;
  readonly layer: L.GeoJSON;
  readonly #map: L.Map;
  readonly #pane: HTMLElement;
  #transitionOpacity = 0;
  #userOpacity = 0.35;

  constructor(map: L.Map, data: MachiyaAreaCollection, pane: HTMLElement) {
    this.#map = map;
    this.#pane = pane;
    const renderer = L.canvas({ pane: MAP_PANES.historicalArea, padding: 0.25 });
    this.layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
      pane: MAP_PANES.historicalArea,
      interactive: false,
      bubblingMouseEvents: false,
      style: () => ({ ...MACHIYA_STYLE, renderer }),
    });
  }

  add(): void {
    if (!this.#map.hasLayer(this.layer)) this.layer.addTo(this.#map);
  }

  remove(): void {
    if (this.#map.hasLayer(this.layer)) this.#map.removeLayer(this.layer);
  }

  setOpacity(opacity: number): void {
    this.#transitionOpacity = Math.min(1, Math.max(0, opacity));
    this.#syncOpacity();
  }

  setUserOpacity(opacity: number): void {
    this.#userOpacity = Math.min(1, Math.max(0, opacity));
    this.#syncOpacity();
  }

  setTransition(durationMs: number): void {
    if (durationMs > 0) void this.#pane.offsetWidth;
    this.#pane.style.transition =
      durationMs > 0 ? `opacity ${durationMs}ms ease-in-out` : "none";
  }

  #syncOpacity(): void {
    this.#pane.style.opacity = String(this.#transitionOpacity * this.#userOpacity);
  }
}
