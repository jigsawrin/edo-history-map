import L from "leaflet";
import type { PlaceFeature } from "./validate";
import { MAP_PANES } from "./leaflet-layers";
import { isEdoMapSourceHidden } from "./edo-map-projection";
import {
  createEdoMapPresentationResolver,
  resolveEdoMapPresentation,
  type EdoMapAggregateGroup,
} from "./edo-map-presentation-projection";
import {
  buildEdoNavigationGrid,
  EDO_NAVIGATION_MAX_ZOOM,
  EDO_NAVIGATION_MIN_ZOOM,
  navigationCellIntersectsPixelBounds,
} from "./edo-navigation-grid";

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
  navigationLayer: L.LayerGroup;
  normalLayer: L.LayerGroup;
  supplementalLayer: L.LayerGroup;
  temporaryLayer: L.LayerGroup;
  normalMarkerCount: number;
  supplementalMarkerCount: number;
  aggregateMarkerCount: number;
  presentationMarkerCount: number;
  navigationMarkerCounts: ReadonlyMap<number, number>;
  syncZoom(zoom: number): void;
  syncView(zoom: number, pixelBounds: L.Bounds): void;
  showTemporaryPlace(place: PlaceFeature, zoom: number): boolean;
  showTemporarySupplemental(place: PlaceFeature, zoom: number): boolean;
  clearTemporarySupplemental(): void;
}

export const SUPPLEMENTAL_MARKER_MIN_ZOOM = 16;

interface EdoNavigationMap {
  project(latlng: L.LatLngExpression, zoom: number): L.Point;
  unproject(point: L.PointExpression, zoom: number): L.LatLng;
  getPixelBounds(): L.Bounds;
  setView(center: L.LatLngExpression, zoom: number): unknown;
}

const SUPPLEMENTAL_EXACT_NAMES = new Set([
  "（辻番）",
  "（木戸）",
  "（坂道）",
]);

export function isSupplementalMarkerPlace(place: Pick<PlaceFeature, "name">): boolean {
  return SUPPLEMENTAL_EXACT_NAMES.has(place.name);
}

export function bindNavigationMarkerKeyboard(
  element: HTMLElement,
  navigate: () => void,
): void {
  element.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    navigate();
  });
}

export function createHistoricalLayer(
  places: PlaceFeature[],
  onSelect: (place: PlaceFeature) => void,
  pane: HTMLElement,
  isHidden: (sourceIndex: number, place: PlaceFeature) => boolean = isEdoMapSourceHidden,
  onSelectAggregate: (group: EdoMapAggregateGroup) => void = () => {},
  presentationValue?: unknown,
  navigationMap?: EdoNavigationMap,
): EdoHistoricalLayer {
  const navigationLayer = L.layerGroup();
  const normalLayer = L.layerGroup();
  const supplementalLayer = L.layerGroup();
  const temporaryLayer = L.layerGroup();
  const group = L.layerGroup(navigationMap ? [] : [normalLayer]);
  const supplementalMarkers = new Map<PlaceFeature, L.CircleMarker>();
  const visiblePlaces = new Set<PlaceFeature>();
  const navigationPoints: { id: string; latitude: number; longitude: number }[] = [];
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
  let temporaryPlace: PlaceFeature | null = null;
  let aggregateMarkerCount = 0;
  for (const [sourceIndex, place] of places.entries()) {
    if (hiddenIndexes.has(sourceIndex)) continue;
    visiblePlaces.add(place);
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
      navigationPoints.push({
        id: `aggregate:${aggregate.groupId}`,
        latitude: aggregate.latitude,
        longitude: aggregate.longitude,
      });
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
      navigationPoints.push({ id: `source:${sourceIndex}`, latitude: place.lat, longitude: place.lon });
    }
  }

  const navigationGrid = navigationMap
    ? buildEdoNavigationGrid(
        navigationPoints,
        (latitude, longitude, zoom) => navigationMap.project([latitude, longitude], zoom),
      )
    : null;
  const navigationMarkers = new Map<string, L.Marker>();
  const navigationKeyByMarker = new Map<L.Layer, string>();
  const navigationKeyboardElements = new WeakSet<HTMLElement>();
  const navigationMarkerCounts = new Map<number, number>();
  if (navigationMap && navigationGrid) {
    for (let zoom = EDO_NAVIGATION_MIN_ZOOM; zoom <= EDO_NAVIGATION_MAX_ZOOM; zoom += 1) {
      const cells = navigationGrid.cellsByZoom.get(zoom) ?? [];
      navigationMarkerCounts.set(zoom, cells.length);
      for (const cell of cells) {
        const label = `この範囲に${cell.memberCount}地点。拡大して個別地点を表示`;
        const content = document.createElement("span");
        content.className = "edo-navigation-marker";
        content.textContent = String(cell.memberCount);
        content.setAttribute("aria-hidden", "true");
        const center = navigationMap.unproject([cell.centerX, cell.centerY], zoom);
        const marker = L.marker(center, {
          pane: HISTORICAL_PANE,
          interactive: true,
          bubblingMouseEvents: false,
          title: label,
          alt: label,
          icon: L.divIcon({
            className: "edo-navigation-marker-shell",
            html: content,
            iconSize: [48, 48],
            iconAnchor: [24, 24],
          }),
        });
        const navigate = (): void => {
          navigationMap.setView(center, navigationGrid.firstSplittingZoom(cell));
        };
        marker.on("click", navigate);
        marker.on("add", () => {
          const element = marker.getElement();
          if (!element) return;
          element.setAttribute("aria-label", label);
          if (navigationKeyboardElements.has(element)) return;
          navigationKeyboardElements.add(element);
          bindNavigationMarkerKeyboard(element, navigate);
        });
        navigationMarkers.set(cell.key, marker);
        navigationKeyByMarker.set(marker, cell.key);
      }
    }
  }

  const clearTemporarySupplemental = (): void => {
    if (group.hasLayer(temporaryLayer)) group.removeLayer(temporaryLayer);
    if (temporaryMarker) temporaryLayer.removeLayer(temporaryMarker);
    temporaryMarker = null;
    temporaryPlace = null;
  };

  const createTemporaryMarker = (place: PlaceFeature): L.CircleMarker => {
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
      bubblingMouseEvents: false,
    });
    marker.on("click", () => onSelect(place));
    return marker;
  };

  let navigationVisible = false;
  let normalVisible = !navigationMap;
  const syncNavigationViewport = (zoom: number, pixelBounds: L.Bounds): void => {
    if (!navigationGrid || zoom < EDO_NAVIGATION_MIN_ZOOM || zoom > EDO_NAVIGATION_MAX_ZOOM) return;
    const cells = navigationGrid.cellsByZoom.get(zoom) ?? [];
    const visibleKeys = new Set(cells
      .filter((cell) => navigationCellIntersectsPixelBounds(cell, pixelBounds))
      .map((cell) => cell.key));
    for (const layer of navigationLayer.getLayers()) {
      const key = navigationKeyByMarker.get(layer);
      if (key && !visibleKeys.has(key)) navigationLayer.removeLayer(layer);
    }
    for (const key of visibleKeys) {
      const marker = navigationMarkers.get(key);
      if (marker && !navigationLayer.hasLayer(marker)) navigationLayer.addLayer(marker);
    }
  };

  const syncView = (zoom: number, pixelBounds: L.Bounds): void => {
    const shouldShowNavigation = Boolean(navigationMap) && zoom <= EDO_NAVIGATION_MAX_ZOOM;
    if (shouldShowNavigation) {
      if (normalVisible && group.hasLayer(normalLayer)) group.removeLayer(normalLayer);
      normalVisible = false;
      syncNavigationViewport(zoom, pixelBounds);
      if (!navigationVisible) group.addLayer(navigationLayer);
      navigationVisible = true;
    } else {
      if (navigationVisible && group.hasLayer(navigationLayer)) group.removeLayer(navigationLayer);
      navigationVisible = false;
      if (!normalVisible) group.addLayer(normalLayer);
      normalVisible = true;
      if (temporaryPlace && !isSupplementalMarkerPlace(temporaryPlace)) clearTemporarySupplemental();
    }

    const shouldShowSupplemental = zoom >= SUPPLEMENTAL_MARKER_MIN_ZOOM;
    if (shouldShowSupplemental !== supplementalVisible) {
      supplementalVisible = shouldShowSupplemental;
      if (shouldShowSupplemental) {
        if (group.hasLayer(temporaryLayer)) group.removeLayer(temporaryLayer);
        if (!group.hasLayer(supplementalLayer)) group.addLayer(supplementalLayer);
      } else {
        if (group.hasLayer(supplementalLayer)) group.removeLayer(supplementalLayer);
        if (temporaryMarker && temporaryPlace && isSupplementalMarkerPlace(temporaryPlace) && !group.hasLayer(temporaryLayer)) group.addLayer(temporaryLayer);
      }
    }
  };

  const syncZoom = (zoom: number): void => {
    syncView(zoom, navigationMap?.getPixelBounds() ?? L.bounds([0, 0], [0, 0]));
  };

  return {
    layer: group,
    navigationLayer,
    normalLayer,
    supplementalLayer,
    temporaryLayer,
    normalMarkerCount: normalLayer.getLayers().length,
    supplementalMarkerCount: supplementalLayer.getLayers().length,
    aggregateMarkerCount,
    presentationMarkerCount: normalLayer.getLayers().length + supplementalLayer.getLayers().length,
    navigationMarkerCounts,
    syncZoom,
    syncView,
    showTemporaryPlace(place, zoom) {
      clearTemporarySupplemental();
      if (!visiblePlaces.has(place)) return false;
      const isSupplemental = isSupplementalMarkerPlace(place);
      if ((!isSupplemental && zoom >= 15) || (isSupplemental && zoom >= 16)) return true;
      const marker = isSupplemental ? supplementalMarkers.get(place) : createTemporaryMarker(place);
      if (!marker) return false;
      temporaryMarker = marker;
      temporaryPlace = place;
      temporaryLayer.addLayer(marker);
      if (!group.hasLayer(temporaryLayer)) {
        group.addLayer(temporaryLayer);
      }
      return true;
    },
    showTemporarySupplemental(place, zoom) {
      if (!isSupplementalMarkerPlace(place)) return false;
      return this.showTemporaryPlace(place, zoom);
    },
    clearTemporarySupplemental,
    setOpacity(opacity: number) {
      const clamped = Math.min(1, Math.max(0, opacity));
      pane.style.opacity = String(clamped);
    },
  };
}

export { addHistoricalImageLayer } from "./historical-raster";
