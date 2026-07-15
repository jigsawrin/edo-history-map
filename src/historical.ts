import L from "leaflet";
import type { PlaceFeature } from "./validate";
import { MAP_PANES } from "./leaflet-layers";

/**
 * 歴史レイヤー(江戸後期の地名ポイント)。
 * 分類ごとに色と枠線スタイルを変える(色だけに依存しない: 枠線の実線/破線でも区別し、
 * 情報カードに分類名を文字で表示する)。
 *
 * 古地図画像の権利ゲートは historical-raster.ts に分離している。
 */

interface CategoryStyle {
  color: string;
  dashArray: string | undefined;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  施設: { color: "#7b1fa2", dashArray: undefined },
  屋敷地: { color: "#1565c0", dashArray: "2 3" },
  寺社: { color: "#c62828", dashArray: undefined },
  町地: { color: "#2e7d32", dashArray: "2 3" },
  水域: { color: "#00838f", dashArray: undefined },
};

const DEFAULT_STYLE: CategoryStyle = { color: "#5d4037", dashArray: "4 3" };

/** 歴史地点だけを描画する Leaflet pane。現在地などの通常レイヤーとは分離する。 */
export const HISTORICAL_PANE = MAP_PANES.historicalPoints;

export function categoryStyle(category: string): CategoryStyle {
  return CATEGORY_STYLES[category] ?? DEFAULT_STYLE;
}

export interface HistoricalLayer {
  layer: L.LayerGroup;
  setOpacity(opacity: number): void;
}

export function createHistoricalLayer(
  places: PlaceFeature[],
  onSelect: (place: PlaceFeature) => void,
  pane: HTMLElement,
): HistoricalLayer {
  const group = L.layerGroup();
  for (const place of places) {
    const style = categoryStyle(place.category);
    const marker = L.circleMarker([place.lat, place.lon], {
      radius: 6,
      color: style.color,
      weight: 2,
      dashArray: style.dashArray,
      fillColor: style.color,
      fillOpacity: 0.5,
      opacity: 0.9,
      pane: HISTORICAL_PANE,
      interactive: true,
      // Canvas上の地点選択を地図の空白クリック処理へ伝播させない。
      bubblingMouseEvents: false,
      // スクリーンリーダー・キーボード用: マーカーにフォーカス可能な代替は
      // Leaflet の CircleMarker では限定的なため、情報カード側で補完する
    });
    marker.on("click", () => onSelect(place));
    marker.on("keypress", (e) => {
      const key = (e as unknown as { originalEvent?: KeyboardEvent })
        .originalEvent?.key;
      if (key === "Enter" || key === " ") onSelect(place);
    });
    group.addLayer(marker);
  }
  return {
    layer: group,
    setOpacity(opacity: number) {
      const clamped = Math.min(1, Math.max(0, opacity));
      pane.style.opacity = String(clamped);
    },
  };
}

export { addHistoricalImageLayer } from "./historical-raster";
