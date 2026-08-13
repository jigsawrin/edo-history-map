import L from "leaflet";
import type { PlaceFeature } from "./validate";
import { MAP_PANES } from "./leaflet-layers";
import { isEdoMapSourceHidden } from "./edo-map-projection";
import {
  createEdoMapPresentationResolver,
  resolveEdoMapPresentation,
  type EdoMapAggregateGroup,
} from "./edo-map-presentation-projection";

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

export interface EdoHistoricalLayer extends HistoricalLayer {
  normalLayer: L.LayerGroup;
  supplementalLayer: L.LayerGroup;
  temporaryLayer: L.LayerGroup;
  normalMarkerCount: number;
  supplementalMarkerCount: number;
  aggregateMarkerCount: number;
  presentationMarkerCount: number;
  syncZoom(zoom: number): void;
  showTemporarySupplemental(place: PlaceFeature, zoom: number): boolean;
  clearTemporarySupplemental(): void;
}

export const SUPPLEMENTAL_MARKER_MIN_ZOOM = 16;

const SUPPLEMENTAL_EXACT_NAMES = new Set([
  "（辻番）",
  "（木戸）",
  "（坂道）",
]);

export function isSupplementalMarkerPlace(place: Pick<PlaceFeature, "name">): boolean {
  return SUPPLEMENTAL_EXACT_NAMES.has(place.name);
}

export function createHistoricalLayer(
  places: PlaceFeature[],
  onSelect: (place: PlaceFeature) => void,
  pane: HTMLElement,
  isHidden: (sourceIndex: number, place: PlaceFeature) => boolean = isEdoMapSourceHidden,
  onSelectAggregate: (group: EdoMapAggregateGroup) => void = () => {},
  presentationValue?: unknown,
): EdoHistoricalLayer {
  const normalLayer = L.layerGroup();
  const supplementalLayer = L.layerGroup();
  const temporaryLayer = L.layerGroup();
  const group = L.layerGroup([normalLayer]);
  const supplementalMarkers = new Map<PlaceFeature, L.CircleMarker>();
  const presentation = presentationValue === undefined
    ? (places.length === 8788
        ? resolveEdoMapPresentation(places)
        : { projection: { groups: [] as readonly EdoMapAggregateGroup[] }, groupForSourceIndex: () => null })
    : createEdoMapPresentationResolver(presentationValue, places);
  const hiddenIndexes = new Set(
    places.flatMap((place, sourceIndex) => isHidden(sourceIndex, place) ? [sourceIndex] : []),
  );
  const aggregatableGroupIds = new Set(
    presentation.projection.groups
      .filter((aggregate) => aggregate.members.every((member) => !hiddenIndexes.has(member.sourceIndex)))
      .map((aggregate) => aggregate.groupId),
  );
  let supplementalVisible = false;
  let temporaryMarker: L.CircleMarker | null = null;
  let aggregateMarkerCount = 0;
  for (const [sourceIndex, place] of places.entries()) {
    if (hiddenIndexes.has(sourceIndex)) continue;
    const aggregate = presentation.groupForSourceIndex(sourceIndex);
    if (aggregate && aggregatableGroupIds.has(aggregate.groupId)) {
      if (sourceIndex !== aggregate.members[0]?.sourceIndex) continue;
      const style = categoryStyle(aggregate.category);
      const size = aggregate.memberCount === 2 ? 28 : aggregate.memberCount === 3 ? 32 : 36;
      const accessibleName = `${aggregate.name}、原資料${aggregate.memberCount}件`;
      const markerContent = document.createElement("span");
      markerContent.className = "edo-aggregate-marker";
      markerContent.textContent = String(aggregate.memberCount);
      markerContent.setAttribute("aria-hidden", "true");
      markerContent.style.setProperty("--edo-marker-color", style.color);
      const marker = L.marker([aggregate.latitude, aggregate.longitude], {
        pane: HISTORICAL_PANE,
        interactive: true,
        bubblingMouseEvents: false,
        title: accessibleName,
        alt: accessibleName,
        icon: L.divIcon({
          className: "edo-aggregate-marker-shell",
          html: markerContent,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      });
      marker.on("click", () => onSelectAggregate(aggregate));
      marker.on("add", () => marker.getElement()?.setAttribute("aria-label", accessibleName));
      marker.on("keypress", (event) => {
        const key = (event as unknown as { originalEvent?: KeyboardEvent }).originalEvent?.key;
        if (key === "Enter" || key === " ") onSelectAggregate(aggregate);
      });
      normalLayer.addLayer(marker);
      aggregateMarkerCount += 1;
      continue;
    }
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
    if (isSupplementalMarkerPlace(place)) {
      supplementalLayer.addLayer(marker);
      supplementalMarkers.set(place, marker);
    } else {
      normalLayer.addLayer(marker);
    }
  }

  const clearTemporarySupplemental = (): void => {
    if (group.hasLayer(temporaryLayer)) group.removeLayer(temporaryLayer);
    if (temporaryMarker) temporaryLayer.removeLayer(temporaryMarker);
    temporaryMarker = null;
  };

  const syncZoom = (zoom: number): void => {
    const shouldShowSupplemental = zoom >= SUPPLEMENTAL_MARKER_MIN_ZOOM;
    if (shouldShowSupplemental === supplementalVisible) return;
    supplementalVisible = shouldShowSupplemental;
    if (shouldShowSupplemental) {
      if (group.hasLayer(temporaryLayer)) group.removeLayer(temporaryLayer);
      if (!group.hasLayer(supplementalLayer)) group.addLayer(supplementalLayer);
      return;
    }
    if (group.hasLayer(supplementalLayer)) group.removeLayer(supplementalLayer);
    if (temporaryMarker && !group.hasLayer(temporaryLayer)) group.addLayer(temporaryLayer);
  };

  return {
    layer: group,
    normalLayer,
    supplementalLayer,
    temporaryLayer,
    normalMarkerCount: normalLayer.getLayers().length,
    supplementalMarkerCount: supplementalLayer.getLayers().length,
    aggregateMarkerCount,
    presentationMarkerCount: normalLayer.getLayers().length + supplementalLayer.getLayers().length,
    syncZoom,
    showTemporarySupplemental(place, zoom) {
      clearTemporarySupplemental();
      const marker = supplementalMarkers.get(place);
      if (!marker) return false;
      temporaryMarker = marker;
      temporaryLayer.addLayer(marker);
      if (zoom < SUPPLEMENTAL_MARKER_MIN_ZOOM && !group.hasLayer(temporaryLayer)) {
        group.addLayer(temporaryLayer);
      }
      return true;
    },
    clearTemporarySupplemental,
    setOpacity(opacity: number) {
      const clamped = Math.min(1, Math.max(0, opacity));
      pane.style.opacity = String(clamped);
    },
  };
}

export { addHistoricalImageLayer } from "./historical-raster";
