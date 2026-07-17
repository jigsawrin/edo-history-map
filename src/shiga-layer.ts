import L from "leaflet";
import type { HistoricalLayer } from "./historical";
import { MAP_PANES } from "./leaflet-layers";
import type { ShigaPlaceCategory, ShigaSengokuPlace } from "./shiga-sengoku-places";

interface MarkerStyle { color: string; fillColor: string; dashArray?: string; radius: number }
const STYLES: Readonly<Record<ShigaPlaceCategory, MarkerStyle>> = Object.freeze({
  castle: { color: "#44260f", fillColor: "#dba85b", dashArray: "6 2", radius: 8 },
  battle: { color: "#781d18", fillColor: "#ed8c78", dashArray: "2 2", radius: 9 },
  politics: { color: "#42206d", fillColor: "#c5a7e8", radius: 8 },
  "temple-shrine": { color: "#215528", fillColor: "#a9d59e", dashArray: "4 2", radius: 7 },
  residence: { color: "#174d6d", fillColor: "#9ac8e0", dashArray: "3 3", radius: 7 },
  transport: { color: "#07545a", fillColor: "#7bcbd0", dashArray: "1 2", radius: 7 },
  memorial: { color: "#505050", fillColor: "#d3d3d3", dashArray: "2 3", radius: 6 },
});

export function shigaMarkerStyle(category: ShigaPlaceCategory): Readonly<MarkerStyle> { return STYLES[category]; }

export function createShigaSengokuLayer(places: readonly ShigaSengokuPlace[], onSelect: (place: ShigaSengokuPlace) => void, pane: HTMLElement): HistoricalLayer {
  const group = L.layerGroup();
  for (const place of places) {
    const style = shigaMarkerStyle(place.category);
    const marker = L.circleMarker([place.latitude, place.longitude], {
      radius: style.radius, color: style.color, fillColor: style.fillColor, dashArray: style.dashArray,
      weight: 3, fillOpacity: 0.84, opacity: 1, pane: MAP_PANES.historicalPoints,
      interactive: true, bubblingMouseEvents: false,
    });
    marker.on("click", () => onSelect(place));
    marker.on("keypress", (event) => {
      const key = (event as unknown as { originalEvent?: KeyboardEvent }).originalEvent?.key;
      if (key === "Enter" || key === " ") onSelect(place);
    });
    group.addLayer(marker);
  }
  return { layer: group, setOpacity(opacity: number): void { pane.style.opacity = String(Math.min(1, Math.max(0, opacity))); } };
}
