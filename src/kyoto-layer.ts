import L from "leaflet";
import type {
  KyotoBakumatsuPlace,
  KyotoPlaceCategory,
} from "./kyoto-bakumatsu-places";
import { MAP_PANES } from "./leaflet-layers";
import type { HistoricalLayer } from "./historical";

interface KyotoMarkerStyle {
  color: string;
  fillColor: string;
  dashArray: string | undefined;
  radius: number;
}

const KYOTO_MARKER_STYLES: Readonly<
  Record<KyotoPlaceCategory, KyotoMarkerStyle>
> = Object.freeze({
  "court-politics": {
    color: "#3f1d70",
    fillColor: "#d7c5f2",
    dashArray: undefined,
    radius: 8,
  },
  bakufu: {
    color: "#3b2b20",
    fillColor: "#d8c4aa",
    dashArray: "5 2",
    radius: 8,
  },
  "domain-residence": {
    color: "#174f76",
    fillColor: "#a9d5ef",
    dashArray: "2 2",
    radius: 7,
  },
  shinsengumi: {
    color: "#14505b",
    fillColor: "#9fd9df",
    dashArray: "6 2",
    radius: 8,
  },
  incident: {
    color: "#7a1d2b",
    fillColor: "#f1aeb8",
    dashArray: undefined,
    radius: 7,
  },
  battle: {
    color: "#7a3416",
    fillColor: "#f5bd84",
    dashArray: "1 2",
    radius: 9,
  },
  residence: {
    color: "#245b2a",
    fillColor: "#b9dfae",
    dashArray: "4 3",
    radius: 7,
  },
  memorial: {
    color: "#4c4c4c",
    fillColor: "#dedede",
    dashArray: "2 3",
    radius: 6,
  },
});

export function kyotoMarkerStyle(
  category: KyotoPlaceCategory,
): Readonly<KyotoMarkerStyle> {
  return KYOTO_MARKER_STYLES[category];
}

export function createKyotoBakumatsuLayer(
  places: readonly KyotoBakumatsuPlace[],
  onSelect: (place: KyotoBakumatsuPlace) => void,
  pane: HTMLElement,
): HistoricalLayer {
  const group = L.layerGroup();
  for (const place of places) {
    const style = kyotoMarkerStyle(place.category);
    const marker = L.circleMarker([place.latitude, place.longitude], {
      radius: style.radius,
      color: style.color,
      weight: 3,
      dashArray: style.dashArray,
      fillColor: style.fillColor,
      fillOpacity: 0.82,
      opacity: 1,
      pane: MAP_PANES.historicalPoints,
      interactive: true,
      bubblingMouseEvents: false,
    });
    marker.on("click", () => onSelect(place));
    marker.on("keypress", (event) => {
      const key = (event as unknown as { originalEvent?: KeyboardEvent })
        .originalEvent?.key;
      if (key === "Enter" || key === " ") onSelect(place);
    });
    group.addLayer(marker);
  }
  return {
    layer: group,
    setOpacity(opacity: number): void {
      pane.style.opacity = String(Math.min(1, Math.max(0, opacity)));
    },
  };
}
