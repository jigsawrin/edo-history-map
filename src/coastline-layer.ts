import L from "leaflet";
import type { CoastlineCollection } from "./coastlines";
import type { TransitionLayer } from "./layer-transition";
import { MAP_PANES } from "./leaflet-layers";

export class CoastlineTransitionLayer implements TransitionLayer {
  readonly id = "historical-coastline";
  readonly layer: L.GeoJSON;
  readonly #map: L.Map;
  readonly #pane: HTMLElement;
  #userOpacity = 0.8;
  #transitionOpacity = 0;

  constructor(map: L.Map, data: CoastlineCollection, pane: HTMLElement) {
    this.#map = map;
    this.#pane = pane;
    const renderer = L.canvas({ pane: MAP_PANES.historicalWaterLine, tolerance: 0 });
    this.layer = L.geoJSON(data as GeoJSON.GeoJsonObject, {
      pane: MAP_PANES.historicalWaterLine,
      interactive: false,
      bubblingMouseEvents: false,
      style: {
        color: "#315f78",
        weight: 2.4,
        opacity: 1,
        dashArray: "9 5",
        lineCap: "butt",
        lineJoin: "round",
        renderer,
      },
    });
    this.#renderOpacity();
  }

  add(): void {
    if (!this.#map.hasLayer(this.layer)) this.layer.addTo(this.#map);
  }

  remove(): void {
    if (this.#map.hasLayer(this.layer)) this.#map.removeLayer(this.layer);
  }

  setOpacity(opacity: number): void {
    this.#transitionOpacity = Math.min(1, Math.max(0, opacity));
    this.#renderOpacity();
  }

  setUserOpacity(opacity: number): void {
    this.#userOpacity = Math.min(1, Math.max(0, opacity));
    this.#renderOpacity();
  }

  setTransition(durationMs: number): void {
    if (durationMs > 0) void this.#pane.offsetWidth;
    this.#pane.style.transition = durationMs > 0 ? `opacity ${durationMs}ms ease-in-out` : "none";
  }

  #renderOpacity(): void {
    this.#pane.style.opacity = String(this.#userOpacity * this.#transitionOpacity);
  }
}
