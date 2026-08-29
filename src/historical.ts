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
  EDO_PROGRESSIVE_REVEAL_MIN_ZOOM,
  selectEdoProgressiveReveal,
  type EdoDisplayCandidate,
} from "./edo-progressive-reveal";

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
  progressiveLayer: L.LayerGroup;
  normalLayer: L.LayerGroup;
  maximumDetailLayer: L.LayerGroup;
  temporaryLayer: L.LayerGroup;
  normalMarkerCount: number;
  maximumDetailMarkerCount: number;
  aggregateMarkerCount: number;
  presentationMarkerCount: number;
  progressiveMarkerCounts: ReadonlyMap<number, EdoProgressiveMarkerCount>;
  syncZoom(zoom: number): void;
  syncView(zoom: number, pixelBounds: L.Bounds): void;
  showTemporaryPlace(place: PlaceFeature, zoom: number): boolean;
  clearTemporaryPlace(): void;
}

export interface EdoProgressiveMarkerCount {
  readonly eligible: number;
  readonly visible: number;
  readonly aggregates: number;
  readonly bracketed: number;
}

interface EdoProgressiveMap {
  project(latlng: L.LatLngExpression, zoom: number): L.Point;
  getPixelBounds(): L.Bounds;
}

export function isMaximumDetailPlace(place: Pick<PlaceFeature, "name">): boolean {
  return place.name.startsWith("（");
}

export function createHistoricalLayer(
  places: PlaceFeature[],
  onSelect: (place: PlaceFeature, sourceIndex: number) => void,
  pane: HTMLElement,
  isHidden: (sourceIndex: number, place: PlaceFeature) => boolean = isEdoMapSourceHidden,
  onSelectAggregate: (group: EdoMapAggregateGroup) => void = () => {},
  presentationValue?: unknown,
  progressiveMap?: EdoProgressiveMap,
): EdoHistoricalLayer {
  const progressiveLayer = L.layerGroup();
  const normalLayer = L.layerGroup();
  const maximumDetailLayer = L.layerGroup();
  const temporaryLayer = L.layerGroup();
  const group = L.layerGroup(progressiveMap ? [] : [normalLayer, maximumDetailLayer]);
  const visiblePlaces = new Set<PlaceFeature>();
  const sourceIndexByPlace = new Map(places.map((place, sourceIndex) => [place, sourceIndex]));
  const displayCandidates: EdoDisplayCandidate[] = [];
  const displayMarkerById = new Map<string, L.Layer>();
  const displayIdBySourceIndex = new Map<number, string>();
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
      const marker = L.circleMarker([aggregate.latitude, aggregate.longitude], {
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
      marker.on("click", () => onSelectAggregate(aggregate));
      marker.on("keypress", (event) => {
        const key = (event as unknown as { originalEvent?: KeyboardEvent }).originalEvent?.key;
        if (key === "Enter" || key === " ") onSelectAggregate(aggregate);
      });
      normalLayer.addLayer(marker);
      const displayId = `aggregate:${aggregate.groupId}`;
      displayCandidates.push({
        id: displayId,
        sourceName: aggregate.name,
        category: aggregate.category,
        latitude: aggregate.latitude,
        longitude: aggregate.longitude,
        sourceIndexes: aggregate.members.map((member) => member.sourceIndex),
        aggregate: true,
      });
      for (const member of aggregate.members) displayIdBySourceIndex.set(member.sourceIndex, displayId);
      displayMarkerById.set(displayId, marker);
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
    marker.on("click", () => onSelect(place, sourceIndex));
    marker.on("keypress", (e) => {
      const key = (e as unknown as { originalEvent?: KeyboardEvent })
        .originalEvent?.key;
      if (key === "Enter" || key === " ") onSelect(place, sourceIndex);
    });
    if (isMaximumDetailPlace(place)) {
      maximumDetailLayer.addLayer(marker);
    } else {
      normalLayer.addLayer(marker);
    }
    const displayId = `source:${sourceIndex}`;
    displayCandidates.push({
      id: displayId,
      sourceName: place.name,
      category: place.category,
      latitude: place.lat,
      longitude: place.lon,
      sourceIndexes: [sourceIndex],
    });
    displayIdBySourceIndex.set(sourceIndex, displayId);
    displayMarkerById.set(displayId, marker);
  }

  const clearTemporaryPlace = (): void => {
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
    marker.on("click", () => onSelect(place, sourceIndexByPlace.get(place) ?? -1));
    return marker;
  };

  const progressiveMarkerCounts = new Map<number, EdoProgressiveMarkerCount>();
  const visibleDisplayIds = new Set<string>();
  const syncView = (zoom: number, pixelBounds: L.Bounds): void => {
    if (!progressiveMap) return;
    progressiveLayer.clearLayers();
    visibleDisplayIds.clear();
    const min = pixelBounds.min;
    const max = pixelBounds.max;
    if (!min || !max) return;
    const selection = selectEdoProgressiveReveal(
      displayCandidates,
      zoom,
      (latitude, longitude, cellZoom) => progressiveMap.project([latitude, longitude], cellZoom),
    );
    const inViewport = (candidate: EdoDisplayCandidate): boolean => {
      const point = progressiveMap.project([candidate.latitude, candidate.longitude], zoom);
      return point.x >= min.x && point.x <= max.x && point.y >= min.y && point.y <= max.y;
    };
    const eligible = selection.eligible.filter(inViewport);
    const visible = selection.visible.filter(inViewport);
    for (const candidate of visible) {
      const marker = displayMarkerById.get(candidate.id);
      if (!marker) continue;
      progressiveLayer.addLayer(marker);
      visibleDisplayIds.add(candidate.id);
    }
    progressiveMarkerCounts.set(zoom, {
      eligible: eligible.length,
      visible: visible.length,
      aggregates: visible.filter((candidate) => candidate.aggregate).length,
      bracketed: visible.filter((candidate) => candidate.sourceName.startsWith("（")).length,
    });
    if (zoom >= EDO_PROGRESSIVE_REVEAL_MIN_ZOOM && !group.hasLayer(progressiveLayer)) group.addLayer(progressiveLayer);
    if (zoom < EDO_PROGRESSIVE_REVEAL_MIN_ZOOM && group.hasLayer(progressiveLayer)) group.removeLayer(progressiveLayer);
    if (temporaryPlace) {
      const sourceIndex = sourceIndexByPlace.get(temporaryPlace);
      const displayId = sourceIndex === undefined ? undefined : displayIdBySourceIndex.get(sourceIndex);
      if (displayId && visibleDisplayIds.has(displayId)) clearTemporaryPlace();
    }
  };

  const syncZoom = (zoom: number): void => {
    syncView(zoom, progressiveMap?.getPixelBounds() ?? L.bounds([0, 0], [0, 0]));
  };

  return {
    layer: group,
    progressiveLayer,
    normalLayer,
    maximumDetailLayer,
    temporaryLayer,
    normalMarkerCount: normalLayer.getLayers().length,
    maximumDetailMarkerCount: maximumDetailLayer.getLayers().length,
    aggregateMarkerCount,
    presentationMarkerCount: normalLayer.getLayers().length + maximumDetailLayer.getLayers().length,
    progressiveMarkerCounts,
    syncZoom,
    syncView,
    showTemporaryPlace(place) {
      clearTemporaryPlace();
      if (!visiblePlaces.has(place)) return false;
      const sourceIndex = sourceIndexByPlace.get(place);
      const displayId = sourceIndex === undefined ? undefined : displayIdBySourceIndex.get(sourceIndex);
      if (displayId && visibleDisplayIds.has(displayId)) return true;
      const marker = createTemporaryMarker(place);
      temporaryMarker = marker;
      temporaryPlace = place;
      temporaryLayer.addLayer(marker);
      if (!group.hasLayer(temporaryLayer)) {
        group.addLayer(temporaryLayer);
      }
      return true;
    },
    clearTemporaryPlace,
    setOpacity(opacity: number) {
      const clamped = Math.min(1, Math.max(0, opacity));
      pane.style.opacity = String(clamped);
    },
  };
}

export { addHistoricalImageLayer } from "./historical-raster";
