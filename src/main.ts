import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

import {
  MIN_ZOOM,
  MAX_ZOOM,
  GSI_TILE_URLS,
  type BaseLayerKey,
} from "./config";
import { createHistoricalLayer, type HistoricalLayer } from "./historical";
import { renderPlaceCard, renderNoData } from "./infocard";
import { renderKyotoNoData, renderKyotoPlaceCard } from "./kyoto-infocard";
import { createKyotoBakumatsuLayer } from "./kyoto-layer";
import { renderShigaNoData, renderShigaPlaceCard } from "./shiga-infocard";
import { createShigaSengokuLayer } from "./shiga-layer";
import { getCurrentLocation } from "./geolocation";
import { renderAttribution, renderPrivacy } from "./attribution";
import { readAllowedParams } from "./urlparams";
import { handleHistoricalBackgroundClick } from "./map-click";
import { MachiyaAreaTransitionLayer } from "./machiya-layer";
import { CoastlineTransitionLayer } from "./coastline-layer";
import {
  defaultCoastlineVisibilityForView,
  shouldShowCoastline,
} from "./coastline-visibility";
import {
  defaultMachiyaVisibilityForView,
  shouldShowMachiyaArea,
  type HistoricalViewMode,
} from "./machiya-visibility";
import {
  isVisualLayerEnabled,
  VISUAL_LAYER_IDS,
} from "./eras";
import { ATTRIBUTION_REGISTRY } from "./attribution-registry";
import { datasetRegistry, type ApprovedDatasetId } from "./datasets";
import { regionRegistry } from "./regions/registry";
import type { RegionPack } from "./regions/types";
import { PlaceSearchController } from "./place-search/controller";
import { HistoricalThemeController } from "./historical-theme-controller";
import type { HistoricalThemePlaceReference } from "./historical-theme-registry";
import { HistoricalTimelineController } from "./historical-timeline-controller";
import type { HistoricalTimelinePlaceReference } from "./historical-timeline-registry";
import kyotoThemePlaces from "../data-curation/kyoto-bakumatsu-places.json";
import shigaThemePlaces from "../data-curation/shiga-sengoku-places.json";
import { placeSearchModelCache } from "./place-search/model-cache";
import type {
  HistoricalPlaceSource,
  SearchableHistoricalPlace,
  SearchablePlaceDatasetId,
} from "./place-search/types";
import {
  activeRegionFromParam,
  announceRegionChange,
  applyRegionMapView,
  closeRegionInfoCard,
  populateRegionEraSelect,
  populateRegionSelect,
  RegionLoadCoordinator,
} from "./region-controller";
import {
  eraTransitionDuration,
  LayerTransitionController,
  type TransitionLayer,
} from "./layer-transition";
import {
  createHistoricalPointsTransitionLayer,
  createMapPanes,
  createReconstructedBackground,
  LeafletTransitionLayer,
  MAP_PANES,
  ModernBaseTransitionLayer,
} from "./leaflet-layers";

const ERA_TRANSITION_MS = 220;

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error("必要な画面要素が見つかりません");
  return el as T;
}

function showStatus(message: string, returnFocus?: HTMLElement): void {
  const card = byId<HTMLElement>("info-card");
  card.replaceChildren();
  card.hidden = false;
  const p = document.createElement("p");
  p.textContent = message;
  card.append(p);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "閉じる";
  close.addEventListener("click", () => {
    card.hidden = true;
    card.replaceChildren();
    returnFocus?.focus();
  });
  card.append(close);
}

function main(): void {
  const params = readAllowedParams(window.location.search);
  let currentRegion = activeRegionFromParam(params["region"]);

  const map = L.map("map", {
    center: [...currentRegion.region.center] as [number, number],
    zoom: currentRegion.region.defaultZoom,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    keyboard: true,
    zoomControl: true,
    preferCanvas: true,
  });
  map.attributionControl.setPrefix(false);

  const panes = createMapPanes(map);

  // --- 基図(地理院タイル) ---
  const baseSelect = byId<HTMLSelectElement>("base-select");
  const initialBase = (params["base"] as BaseLayerKey) ?? "pale";
  baseSelect.value = initialBase;
  const modernBase = new ModernBaseTransitionLayer(
    map,
    panes.get(MAP_PANES.modernBase) as HTMLElement,
    initialBase,
  );
  baseSelect.addEventListener("change", () => {
    const next = baseSelect.value as BaseLayerKey;
    if (!Object.hasOwn(GSI_TILE_URLS, next)) return;
    modernBase.setBase(next);
  });

  // --- 歴史レイヤー ---
  const regionSelect = byId<HTMLSelectElement>("region-select");
  const regionControl = byId<HTMLElement>("region-control");
  const regionStatus = byId<HTMLElement>("region-status");
  populateRegionSelect(regionSelect, regionControl);
  regionSelect.value = currentRegion.region.id;
  const eraSelect = byId<HTMLSelectElement>("era-select");
  const requestedEra = params["era"] === "none" ? "modern" : params["era"];
  populateRegionEraSelect(
    eraSelect,
    currentRegion,
    undefined,
    requestedEra,
  );
  const historyViewSelect = byId<HTMLSelectElement>("history-view-select");
  const historyViewControl = byId<HTMLElement>("history-view-control");
  const historyControls = byId<HTMLElement>("history-controls");
  const eraCaution = byId<HTMLElement>("era-caution");
  const regionTagline = byId<HTMLElement>("region-tagline");
  const opacityLabel = byId<HTMLElement>("opacity-label");
  const footerCaution = byId<HTMLElement>("footer-caution");
  const edoLegend = byId<HTMLElement>("edo-legend");
  const kyotoLegend = byId<HTMLElement>("kyoto-legend");
  const shigaLegend = byId<HTMLElement>("shiga-legend");
  const opacitySlider = byId<HTMLInputElement>("opacity-slider");
  const baseOpacitySlider = byId<HTMLInputElement>("base-opacity-slider");
  const machiyaControls = byId<HTMLFieldSetElement>("machiya-controls");
  const machiyaVisible = byId<HTMLInputElement>("machiya-visible");
  const machiyaOpacitySlider = byId<HTMLInputElement>(
    "machiya-opacity-slider",
  );
  const coastlineVisible = byId<HTMLInputElement>("coastline-visible");
  const coastlineOpacitySlider = byId<HTMLInputElement>(
    "coastline-opacity-slider",
  );
  const coastlineControls = byId<HTMLElement>("coastline-controls");
  const machiyaAreaControls = byId<HTMLElement>("machiya-area-controls");
  const pointsOpacityControl = byId<HTMLElement>("points-opacity-control");
  const baseOpacityControl = byId<HTMLElement>("base-opacity-control");
  const infoCard = byId<HTMLElement>("info-card");
  const placeSearchContainer = byId<HTMLElement>("place-search-control");
  const placeSearchOpen = byId<HTMLButtonElement>("place-search-open");
  const placeSearchPanel = byId<HTMLElement>("place-search-panel");
  const placeSearchHeading = byId<HTMLElement>("place-search-heading");
  const placeSearchForm = byId<HTMLFormElement>("place-search-form");
  const placeSearchInputLabel = byId<HTMLElement>("place-search-input-label");
  const placeSearchInput = byId<HTMLInputElement>("place-search-input");
  const placeCategoryFilter = byId<HTMLSelectElement>("place-category-filter");
  const placeSearchStatus = byId<HTMLElement>("place-search-status");
  const placeSearchResults = byId<HTMLOListElement>("place-search-results");
  const placeSearchPagination = byId<HTMLElement>("place-search-pagination");
  const placeSearchPrevious = byId<HTMLButtonElement>("place-search-previous");
  const placeSearchPageStatus = byId<HTMLElement>("place-search-page-status");
  const placeSearchNext = byId<HTMLButtonElement>("place-search-next");
  const placeSearchClose = byId<HTMLButtonElement>("place-search-close");
  const historicalThemeOpen = byId<HTMLButtonElement>("historical-theme-open");
  const historicalThemePanel = byId<HTMLElement>("historical-theme-panel");
  const historicalThemeInput = byId<HTMLInputElement>("historical-theme-input");
  const historicalThemeType = byId<HTMLSelectElement>("historical-theme-type");
  const historicalThemeList = byId<HTMLOListElement>("historical-theme-list");
  const historicalThemeDetail = byId<HTMLElement>("historical-theme-detail");
  const historicalThemeStatus = byId<HTMLElement>("historical-theme-status");
  const historicalThemeClose = byId<HTMLButtonElement>("historical-theme-close");
  const historicalTimelineOpen = byId<HTMLButtonElement>("historical-timeline-open");
  const historicalTimelinePanel = byId<HTMLElement>("historical-timeline-panel");
  const historicalTimelineInput = byId<HTMLInputElement>("historical-timeline-input");
  const historicalTimelineTrack = byId<HTMLSelectElement>("historical-timeline-track");
  const historicalTimelineType = byId<HTMLSelectElement>("historical-timeline-type");
  const historicalTimelineList = byId<HTMLOListElement>("historical-timeline-list");
  const historicalTimelineDetail = byId<HTMLElement>("historical-timeline-detail");
  const historicalTimelineStatus = byId<HTMLElement>("historical-timeline-status");
  const historicalTimelineClose = byId<HTMLButtonElement>("historical-timeline-close");
  let historicalPointsLayer: TransitionLayer | null = null;
  let machiyaLayer: MachiyaAreaTransitionLayer | null = null;
  let coastlineLayer: CoastlineTransitionLayer | null = null;
  let activeAttributionIds: readonly string[] = ["gsi-tiles"];
  const visibleLeafletAttributions = new Set<string>();
  const loadCoordinator = new RegionLoadCoordinator();
  let regionToken = loadCoordinator.begin(currentRegion.region.id);
  let curatedSelectionGeneration = 0;

  const reconstructedLayer = createReconstructedBackground();
  const reconstructedTransition = new LeafletTransitionLayer(
    VISUAL_LAYER_IDS.reconstructedBackground,
    map,
    reconstructedLayer,
    panes.get(MAP_PANES.historicalRaster) as HTMLElement,
    (opacity) => {
      const pane = panes.get(MAP_PANES.historicalRaster);
      if (pane) pane.style.opacity = String(opacity);
    },
  );
  const transitions = new LayerTransitionController();

  function applyRegionPresentation(pack: Readonly<RegionPack>): void {
    const presentation = pack.region.presentation;
    const isEdo = pack.region.id === "edo";
    const isKyoto = pack.region.id === "kyoto";
    const isShiga = pack.region.id === "shiga";
    document.title = presentation.pageTitle;
    const description = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    if (description) {
      description.content = presentation.metaDescription;
    }
    regionTagline.textContent = presentation.tagline;
    opacityLabel.textContent = presentation.pointOpacityLabel;
    historyViewSelect.setAttribute(
      "aria-label",
      presentation.historicalViewLabel,
    );
    edoLegend.hidden = !isEdo;
    kyotoLegend.hidden = !isKyoto;
    shigaLegend.hidden = !isShiga;
    footerCaution.textContent = presentation.footerCaution;
  }

  function prefersReducedMotion(): boolean {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  const placeSearchController = new PlaceSearchController({
    elements: {
      container: placeSearchContainer,
      openButton: placeSearchOpen,
      panel: placeSearchPanel,
      heading: placeSearchHeading,
      form: placeSearchForm,
      inputLabel: placeSearchInputLabel,
      input: placeSearchInput,
      category: placeCategoryFilter,
      status: placeSearchStatus,
      results: placeSearchResults,
      pagination: placeSearchPagination,
      previous: placeSearchPrevious,
      pageStatus: placeSearchPageStatus,
      next: placeSearchNext,
      closeButton: placeSearchClose,
    },
    onSelect: (place, trigger) =>
      selectHistoricalPlace({
        datasetId: place.datasetId,
        record: place.sourceRecord,
        searchable: place,
        source: "search",
        returnFocus: trigger,
      }),
    onVisibilityChange: (open) => {
      window.requestAnimationFrame(() => {
        if (open && window.matchMedia("(max-width: 600px)").matches) {
          placeSearchPanel.scrollIntoView({ block: "start", behavior: "auto" });
        }
        map.invalidateSize({ pan: false });
      });
    },
  });

  const kyotoThemePlaceMap = new Map(kyotoThemePlaces.map((place) => [place.id, place]));
  const shigaThemePlaceMap = new Map(shigaThemePlaces.map((place) => [place.id, place]));
  const historicalThemeController = new HistoricalThemeController({
    elements: {
      openButton: historicalThemeOpen,
      panel: historicalThemePanel,
      input: historicalThemeInput,
      type: historicalThemeType,
      list: historicalThemeList,
      detail: historicalThemeDetail,
      status: historicalThemeStatus,
      closeButton: historicalThemeClose,
    },
    resolvePlace: (reference) => {
      const place = reference.datasetId === "project-kyoto-bakumatsu-places"
        ? kyotoThemePlaceMap.get(reference.placeId)
        : shigaThemePlaceMap.get(reference.placeId);
      if (!place) throw new Error("テーマの関連地点が見つかりません");
      return {
        name: place.nameJa,
        regionEraLabel: reference.datasetId === "project-kyoto-bakumatsu-places" ? "京都・幕末" : "滋賀・戦国",
        coordinateConfidence: place.coordinateConfidence === "high" ? "高" : place.coordinateConfidence === "medium" ? "中" : "低",
        locationCaution: place.locationNoteJa,
      };
    },
    onSelectPlace: (reference, trigger) => navigateToCuratedHistoricalPlace(reference, trigger, "theme"),
    onVisibilityChange: (open) => {
      if (open && placeSearchController.isOpen()) placeSearchController.close(false);
      if (open && historicalTimelineController.isOpen()) historicalTimelineController.close(false);
      window.requestAnimationFrame(() => {
        if (open && window.matchMedia("(max-width: 600px)").matches) historicalThemePanel.scrollIntoView({ block: "start", behavior: "auto" });
        map.invalidateSize({ pan: false });
      });
    },
    onClose: () => { curatedSelectionGeneration += 1; },
  });

  const historicalTimelineController = new HistoricalTimelineController({
    elements: {
      openButton: historicalTimelineOpen,
      panel: historicalTimelinePanel,
      input: historicalTimelineInput,
      track: historicalTimelineTrack,
      type: historicalTimelineType,
      list: historicalTimelineList,
      detail: historicalTimelineDetail,
      status: historicalTimelineStatus,
      closeButton: historicalTimelineClose,
    },
    resolvePlace: (reference) => {
      const place = reference.datasetId === "project-kyoto-bakumatsu-places"
        ? kyotoThemePlaceMap.get(reference.placeId)
        : shigaThemePlaceMap.get(reference.placeId);
      if (!place) throw new Error("年表の関連地点が見つかりません");
      return {
        name: place.nameJa,
        coordinateConfidence: place.coordinateConfidence === "high" ? "高" : place.coordinateConfidence === "medium" ? "中" : "低",
        locationCaution: place.locationNoteJa,
      };
    },
    onSelectPlace: (reference, trigger) => navigateToCuratedHistoricalPlace(reference, trigger, "timeline"),
    onVisibilityChange: (open) => {
      if (open && placeSearchController.isOpen()) placeSearchController.close(false);
      if (open && historicalThemeController.isOpen()) historicalThemeController.close(false);
      window.requestAnimationFrame(() => {
        if (open && window.matchMedia("(max-width: 600px)").matches) historicalTimelinePanel.scrollIntoView({ block: "start", behavior: "auto" });
        map.invalidateSize({ pan: false });
      });
    },
    onClose: () => { curatedSelectionGeneration += 1; },
  });

  function searchableDatasetId(
    value: string | null,
  ): SearchablePlaceDatasetId | null {
    if (
      value === "codh-edo-maps-places" ||
      value === "project-kyoto-bakumatsu-places" ||
      value === "project-shiga-sengoku-places"
    ) {
      return value;
    }
    return null;
  }

  function syncPlaceSearch(
    placeDatasetId: string | null,
    focusFallback: HTMLElement = eraSelect,
  ): void {
    const datasetId = searchableDatasetId(placeDatasetId);
    if (!datasetId) {
      placeSearchController.setContext(null, focusFallback);
      return;
    }
    const presentation = currentRegion.region.presentation;
    placeSearchController.setContext(
      {
        datasetId,
        regionId: datasetId === "codh-edo-maps-places" ? "edo" : datasetId === "project-kyoto-bakumatsu-places" ? "kyoto" : "shiga",
        eraId: datasetId === "codh-edo-maps-places" ? "edo-late" : datasetId === "project-kyoto-bakumatsu-places" ? "bakumatsu" : "sengoku",
        copy: {
          searchButtonLabel: presentation.searchButtonLabel,
          searchHeading: presentation.searchHeading,
          searchInputLabel: presentation.searchInputLabel,
          searchEmptyMessage: presentation.searchEmptyMessage,
          searchResultNoun: presentation.searchResultNoun,
        },
      },
      focusFallback,
    );
  }

  function percentage(slider: HTMLInputElement): number {
    const value = Number(slider.value);
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  }

  function syncAttributions(ids: readonly string[]): void {
    activeAttributionIds = [...ids];
    const next = new Set(
      ids.filter((id) => id !== "gsi-tiles").map((id) => {
        const attribution =
          ATTRIBUTION_REGISTRY[id as keyof typeof ATTRIBUTION_REGISTRY];
        if (!attribution) throw new Error("未登録の出典IDです");
        return attribution;
      }),
    );
    for (const attribution of visibleLeafletAttributions) {
      if (!next.has(attribution)) {
        map.attributionControl.removeAttribution(attribution);
        visibleLeafletAttributions.delete(attribution);
      }
    }
    for (const attribution of next) {
      if (!visibleLeafletAttributions.has(attribution)) {
        map.attributionControl.addAttribution(attribution);
        visibleLeafletAttributions.add(attribution);
      }
    }
  }

  function applyEra(animate = true): void {
    const era =
      regionRegistry.getEraBinding(currentRegion.region.id, eraSelect.value) ??
      regionRegistry.getEraBinding(currentRegion.region.id, "modern");
    if (!era) return;
    syncPlaceSearch(era.placeDatasetId);
    const targets: { layer: TransitionLayer; opacity: number }[] = [];
    const isHistorical = era.baseMode !== "modern";
    const supportsPoints = era.visualLayers.includes(
      VISUAL_LAYER_IDS.historicalPoints,
    );
    const supportsMachiya = era.visualLayers.includes(
      VISUAL_LAYER_IDS.historicalCommonerAreas,
    );
    const supportsCoastline = era.visualLayers.includes(
      VISUAL_LAYER_IDS.historicalCoastline,
    );
    const allowedViews = era.allowedHistoricalViewModes ?? [
      "reconstructed",
      "compare",
      "points",
    ];
    if (!allowedViews.includes(historyViewSelect.value as HistoricalViewMode)) {
      historyViewSelect.value = era.defaultHistoricalViewMode ?? "reconstructed";
    }
    const view = historyViewSelect.value as HistoricalViewMode;
    historyControls.hidden = !isHistorical;
    historyViewControl.hidden = !isHistorical || allowedViews.length === 1;
    historyViewSelect.disabled = !isHistorical || allowedViews.length === 1;
    machiyaControls.hidden =
      !isHistorical || (!supportsMachiya && !supportsCoastline);
    coastlineControls.hidden = !isHistorical || !supportsCoastline;
    machiyaAreaControls.hidden = !isHistorical || !supportsMachiya;
    pointsOpacityControl.hidden = !isHistorical || !supportsPoints;
    baseOpacityControl.hidden =
      !isHistorical || !allowedViews.includes("compare");
    machiyaVisible.disabled =
      !isHistorical || !supportsMachiya || machiyaLayer === null;
    machiyaOpacitySlider.disabled =
      !isHistorical ||
      !supportsMachiya ||
      machiyaLayer === null ||
      !machiyaVisible.checked;
    coastlineVisible.disabled =
      !isHistorical || !supportsCoastline || coastlineLayer === null;
    coastlineOpacitySlider.disabled =
      !isHistorical ||
      !supportsCoastline ||
      coastlineLayer === null ||
      !coastlineVisible.checked;
    baseOpacitySlider.disabled = !isHistorical || view !== "compare";
    eraCaution.hidden = !isHistorical;
    eraCaution.textContent = era.uncertaintyNote;

    if (!isHistorical) {
      targets.push({ layer: modernBase, opacity: 1 });
    } else {
      if (
        view !== "points" &&
        era.visualLayers.includes(VISUAL_LAYER_IDS.reconstructedBackground) &&
        isVisualLayerEnabled(VISUAL_LAYER_IDS.reconstructedBackground)
      ) {
        targets.push({
          layer: reconstructedTransition,
          opacity: view === "compare" ? 0.78 : 1,
        });
      }
      if (view === "compare") {
        targets.push({
          layer: modernBase,
          opacity: percentage(baseOpacitySlider) / 100,
        });
      } else if (view === "points") {
        targets.push({ layer: modernBase, opacity: 1 });
      }
      if (
        coastlineLayer &&
        shouldShowCoastline({
          isHistorical,
          layerAvailable: true,
          registryEnabled:
            era.visualLayers.includes(VISUAL_LAYER_IDS.historicalCoastline) &&
            isVisualLayerEnabled(VISUAL_LAYER_IDS.historicalCoastline),
          selected: coastlineVisible.checked,
        })
      ) {
        targets.push({ layer: coastlineLayer, opacity: 1 });
      }
      if (
        machiyaLayer &&
        shouldShowMachiyaArea({
          isHistorical,
          layerAvailable: true,
          registryEnabled:
            era.visualLayers.includes(
              VISUAL_LAYER_IDS.historicalCommonerAreas,
            ) && isVisualLayerEnabled(VISUAL_LAYER_IDS.historicalCommonerAreas),
          selected: machiyaVisible.checked,
        })
      ) {
        targets.push({ layer: machiyaLayer, opacity: 1 });
      }
      if (
        historicalPointsLayer &&
        era.visualLayers.includes(VISUAL_LAYER_IDS.historicalPoints) &&
        isVisualLayerEnabled(VISUAL_LAYER_IDS.historicalPoints)
      ) {
        targets.push({
          layer: historicalPointsLayer,
          opacity: percentage(opacitySlider) / 100,
        });
      }
    }

    const duration = animate
      ? eraTransitionDuration(prefersReducedMotion(), ERA_TRANSITION_MS)
      : 0;
    transitions.switchTo(targets, duration);
    const visibleIds = era.attributionIds.filter((id) => {
      if (id === "codh-edo-maps-places") return historicalPointsLayer !== null;
      if (id === "project-kyoto-bakumatsu-places") {
        return historicalPointsLayer !== null;
      }
      if (id === "project-shiga-sengoku-places") {
        return historicalPointsLayer !== null;
      }
      if (id === "codh-edo-machiya-areas") {
        return machiyaLayer !== null && machiyaVisible.checked;
      }
      if (id === "codh-edo-coastline") {
        return coastlineLayer !== null && coastlineVisible.checked;
      }
      return true;
    });
    syncAttributions(visibleIds);
  }

  function applyHistoricalOpacity(): void {
    const value = percentage(opacitySlider);
    opacitySlider.setAttribute("aria-valuetext", `${value}パーセント`);
    applyEra(false);
  }

  function applyBaseOpacity(): void {
    const value = percentage(baseOpacitySlider);
    baseOpacitySlider.setAttribute("aria-valuetext", `${value}パーセント`);
    applyEra(false);
  }

  function applyMachiyaOpacity(): void {
    const value = percentage(machiyaOpacitySlider);
    machiyaOpacitySlider.setAttribute(
      "aria-valuetext",
      `${value}パーセント`,
    );
    machiyaLayer?.setUserOpacity(value / 100);
    applyEra(false);
  }

  function applyCoastlineOpacity(): void {
    const value = percentage(coastlineOpacitySlider);
    coastlineOpacitySlider.setAttribute(
      "aria-valuetext",
      `${value}パーセント`,
    );
    coastlineLayer?.setUserOpacity(value / 100);
    applyEra(false);
  }

  type PointDatasetId =
    | "codh-edo-maps-places"
    | "project-kyoto-bakumatsu-places"
    | "project-shiga-sengoku-places";
  const pointLayerPromises = new Map<
    PointDatasetId,
    Promise<TransitionLayer>
  >();
  let activeHistoricalPointsDatasetId: PointDatasetId | null = null;
  let machiyaLayerPromise: Promise<MachiyaAreaTransitionLayer> | null = null;
  let coastlineLayerPromise: Promise<CoastlineTransitionLayer> | null = null;

  const LAYER_FACTORIES: Readonly<
    Record<PointDatasetId, () => Promise<HistoricalLayer>>
  > = Object.freeze({
    "codh-edo-maps-places": async () =>
      createHistoricalLayer(
        await datasetRegistry.load("codh-edo-maps-places"),
        (place) => {
          void selectHistoricalPlace({
            datasetId: "codh-edo-maps-places",
            record: {
              datasetId: "codh-edo-maps-places",
              record: place,
              sourceIndex: -1,
            },
            source: "map",
            returnFocus: map.getContainer(),
          });
        },
        panes.get(MAP_PANES.historicalPoints) as HTMLElement,
      ),
    "project-kyoto-bakumatsu-places": async () =>
      createKyotoBakumatsuLayer(
        await datasetRegistry.load("project-kyoto-bakumatsu-places"),
        (place) => {
          void selectHistoricalPlace({
            datasetId: "project-kyoto-bakumatsu-places",
            record: {
              datasetId: "project-kyoto-bakumatsu-places",
              record: place,
              sourceIndex: -1,
            },
            source: "map",
            returnFocus: map.getContainer(),
          });
        },
        panes.get(MAP_PANES.historicalPoints) as HTMLElement,
      ),
    "project-shiga-sengoku-places": async () =>
      createShigaSengokuLayer(
        await datasetRegistry.load("project-shiga-sengoku-places"),
        (place) => {
          void selectHistoricalPlace({
            datasetId: "project-shiga-sengoku-places",
            record: { datasetId: "project-shiga-sengoku-places", record: place, sourceIndex: -1 },
            source: "map",
            returnFocus: map.getContainer(),
          });
        },
        panes.get(MAP_PANES.historicalPoints) as HTMLElement,
      ),
  });

  function cachedPointsLayer(id: PointDatasetId): Promise<TransitionLayer> {
    const cached = pointLayerPromises.get(id);
    if (cached) return cached;
    const promise = LAYER_FACTORIES[id]()
      .then((historical) =>
        createHistoricalPointsTransitionLayer(
          map,
          historical,
          panes.get(MAP_PANES.historicalPoints) as HTMLElement,
        ),
      )
      .catch((error: unknown) => {
        pointLayerPromises.delete(id);
        throw error;
      });
    pointLayerPromises.set(id, promise);
    return promise;
  }

  interface HistoricalPlaceSelection {
    readonly datasetId: PointDatasetId;
    readonly record: HistoricalPlaceSource;
    readonly searchable?: SearchableHistoricalPlace;
    readonly source: "map" | "search" | "theme" | "timeline";
    readonly returnFocus: HTMLElement;
    readonly curatedGeneration?: number;
  }

  async function selectHistoricalPlace(
    selection: HistoricalPlaceSelection,
  ): Promise<void> {
    const binding = regionRegistry.getEraBinding(
      currentRegion.region.id,
      eraSelect.value,
    );
    if (
      binding?.placeDatasetId !== selection.datasetId ||
      selection.record.datasetId !== selection.datasetId
    ) {
      return;
    }
    const token = regionToken;
    if (selection.source === "search" || selection.source === "theme" || selection.source === "timeline") {
      const layer = await cachedPointsLayer(selection.datasetId);
      const latestBinding = regionRegistry.getEraBinding(
        currentRegion.region.id,
        eraSelect.value,
      );
      if (
        !loadCoordinator.isCurrent(token) ||
        (selection.curatedGeneration !== undefined && selection.curatedGeneration !== curatedSelectionGeneration) ||
        latestBinding?.placeDatasetId !== selection.datasetId
      ) {
        return;
      }
      historicalPointsLayer = layer;
      activeHistoricalPointsDatasetId = selection.datasetId;
      applyEra(false);
      const latitude = selection.searchable?.latitude;
      const longitude = selection.searchable?.longitude;
      if (latitude === undefined || longitude === undefined) return;
      map.panTo([latitude, longitude], {
        animate: !prefersReducedMotion(),
      });
    } else if (
      activeHistoricalPointsDatasetId !== null &&
      activeHistoricalPointsDatasetId !== selection.datasetId
    ) {
      return;
    }

    if (selection.curatedGeneration !== undefined && selection.curatedGeneration !== curatedSelectionGeneration) return;

    if (selection.record.datasetId === "codh-edo-maps-places") {
      renderPlaceCard(
        infoCard,
        selection.record.record,
        selection.returnFocus,
      );
    } else if (selection.record.datasetId === "project-kyoto-bakumatsu-places") {
      renderKyotoPlaceCard(
        infoCard,
        selection.record.record,
        selection.returnFocus,
      );
    } else {
      renderShigaPlaceCard(infoCard, selection.record.record, selection.returnFocus);
    }

    if (selection.source === "theme" || selection.source === "timeline") {
      const heading = infoCard.querySelector<HTMLElement>("h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
    }

    const searchable =
      selection.searchable ??
      (await placeSearchModelCache
        .load(selection.datasetId)
        .then((records) =>
          records.find(
            (place) => place.sourceRecord.record === selection.record.record,
          ),
        )
        .catch(() => undefined));
    if (
      searchable &&
      loadCoordinator.isCurrent(token) &&
      searchable.datasetId ===
        regionRegistry.getEraBinding(currentRegion.region.id, eraSelect.value)
          ?.placeDatasetId
    ) {
      placeSearchController.selectFromMap(searchable);
    }
  }

  async function navigateToCuratedHistoricalPlace(
    reference: HistoricalThemePlaceReference | HistoricalTimelinePlaceReference,
    trigger: HTMLButtonElement,
    source: "theme" | "timeline",
  ): Promise<void> {
    const generation = ++curatedSelectionGeneration;
    const controller = source === "theme" ? historicalThemeController : historicalTimelineController;
    const opener = source === "theme" ? historicalThemeOpen : historicalTimelineOpen;
    const destination = reference.datasetId === "project-kyoto-bakumatsu-places"
      ? { regionId: "kyoto", eraId: "bakumatsu" }
      : { regionId: "shiga", eraId: "sengoku" };
    const pack = regionRegistry.get(destination.regionId);
    if (!pack) {
      controller.announce("対象地域を利用できません。別の地点を選んでください。");
      return;
    }
    if (currentRegion.region.id !== destination.regionId) {
      regionSelect.value = destination.regionId;
      activateRegion(pack, true);
    }
    if (eraSelect.value !== destination.eraId) {
      eraSelect.value = destination.eraId;
      applyEra(false);
    }
    try {
      const records = await placeSearchModelCache.load(reference.datasetId);
      if (generation !== curatedSelectionGeneration) return;
      const expectedKey = `${reference.datasetId === "project-kyoto-bakumatsu-places" ? "kyoto" : "shiga"}:${reference.placeId}`;
      const searchable = records.find((record) => record.key === expectedKey);
      if (!searchable) throw new Error("関連地点が見つかりません");
      await selectHistoricalPlace({
        datasetId: reference.datasetId,
        record: searchable.sourceRecord,
        searchable,
        source,
        returnFocus: window.matchMedia("(max-width: 600px)").matches ? opener : trigger,
        curatedGeneration: generation,
      });
      if (generation !== curatedSelectionGeneration) return;
      controller.announce(`${destination.regionId === "kyoto" ? "京都・幕末" : "滋賀・戦国"}へ切り替え、${searchable.name}を表示しました。`);
      if (window.matchMedia("(max-width: 600px)").matches) controller.close(false);
    } catch {
      if (generation !== curatedSelectionGeneration) return;
      controller.announce("関連地点を読み込めませんでした。再読み込みすると回復する場合があります。");
    }
  }

  function cachedMachiyaLayer(): Promise<MachiyaAreaTransitionLayer> {
    if (!machiyaLayerPromise) {
      machiyaLayerPromise = datasetRegistry
        .load("codh-edo-machiya-areas")
        .then((areas) => {
          const layer = new MachiyaAreaTransitionLayer(
            map,
            areas,
            panes.get(MAP_PANES.historicalArea) as HTMLElement,
          );
          layer.setUserOpacity(percentage(machiyaOpacitySlider) / 100);
          return layer;
        })
        .catch((error: unknown) => {
          machiyaLayerPromise = null;
          throw error;
        });
    }
    return machiyaLayerPromise;
  }

  function cachedCoastlineLayer(): Promise<CoastlineTransitionLayer> {
    if (!coastlineLayerPromise) {
      coastlineLayerPromise = datasetRegistry
        .load("codh-edo-coastline")
        .then((coastlines) => {
          const layer = new CoastlineTransitionLayer(
            map,
            coastlines,
            panes.get(MAP_PANES.historicalWaterLine) as HTMLElement,
          );
          layer.setUserOpacity(percentage(coastlineOpacitySlider) / 100);
          return layer;
        })
        .catch((error: unknown) => {
          coastlineLayerPromise = null;
          throw error;
        });
    }
    return coastlineLayerPromise;
  }

  function regionDatasetIds(pack: Readonly<RegionPack>): Set<string> {
    return new Set(
      pack.eras
        .filter((binding) => binding.enabled)
        .flatMap((binding) => binding.datasetIds),
    );
  }

  function loadRegionLayers(pack: Readonly<RegionPack>): void {
    const token = regionToken;
    const ids = regionDatasetIds(pack);
    const load = <T extends TransitionLayer>(
      id: ApprovedDatasetId,
      getPromise: () => Promise<T>,
      assign: (layer: T) => void,
      message: string,
    ): void => {
      if (!ids.has(id)) return;
      void getPromise()
        .then((layer) => {
          if (!loadCoordinator.isCurrent(token)) return;
          assign(layer);
          applyEra(false);
        })
        .catch(() => {
          if (!loadCoordinator.isCurrent(token)) return;
          showStatus(message, map.getContainer());
          applyEra(false);
        });
    };
    for (const pointDatasetId of Object.keys(
      LAYER_FACTORIES,
    ) as PointDatasetId[]) {
      load(
        pointDatasetId,
        () => cachedPointsLayer(pointDatasetId),
        (layer) => {
          historicalPointsLayer = layer;
          activeHistoricalPointsDatasetId = pointDatasetId;
        },
        pointDatasetId === "project-kyoto-bakumatsu-places"
          ? "京都・幕末地点を読み込めませんでした。現代地図はそのまま利用できます。再読み込みすると回復する場合があります。"
          : pointDatasetId === "project-shiga-sengoku-places"
            ? "滋賀・戦国地点を読み込めませんでした。現代地図はそのまま利用できます。再読み込みすると回復する場合があります。"
            : "歴史データを読み込めませんでした。現代地図はそのまま利用できます。再読み込みすると回復する場合があります。",
      );
    }
    load(
      "codh-edo-machiya-areas",
      cachedMachiyaLayer,
      (layer) => {
        machiyaLayer = layer;
      },
      "町家領域データを読み込めませんでした。現代地図・江戸地名・現在地など、その他の機能は引き続き利用できます。",
    );
    load(
      "codh-edo-coastline",
      cachedCoastlineLayer,
      (layer) => {
        coastlineLayer = layer;
      },
      "江戸末期海岸線データを読み込めませんでした。現代地図・江戸地名・町家領域・現在地など、その他の機能は引き続き利用できます。",
    );
  }

  function activateRegion(pack: Readonly<RegionPack>, moveMap: boolean): void {
    transitions.switchTo([], 0);
    syncAttributions(["gsi-tiles"]);
    currentRegion = pack;
    regionToken = loadCoordinator.begin(pack.region.id);
    historicalPointsLayer = null;
    activeHistoricalPointsDatasetId = null;
    machiyaLayer = null;
    coastlineLayer = null;
    populateRegionEraSelect(eraSelect, pack);
    applyRegionPresentation(pack);
    applyEra(false);
    if (moveMap) {
      map.invalidateSize({ pan: false });
      applyRegionMapView(map, pack);
      closeRegionInfoCard(infoCard, regionSelect);
      announceRegionChange(regionStatus, pack);
    }
    loadRegionLayers(pack);
  }

  applyRegionPresentation(currentRegion);
  loadRegionLayers(currentRegion);

  regionSelect.addEventListener("change", () => {
    curatedSelectionGeneration += 1;
    const next = regionRegistry.get(regionSelect.value);
    if (!next) {
      regionSelect.value = currentRegion.region.id;
      return;
    }
    activateRegion(next, true);
  });

  eraSelect.addEventListener("change", () => {
    curatedSelectionGeneration += 1;
    applyEra(true);
  });
  historyViewSelect.addEventListener("change", () => {
    machiyaVisible.checked = defaultMachiyaVisibilityForView(
      historyViewSelect.value as HistoricalViewMode,
    );
    coastlineVisible.checked = defaultCoastlineVisibilityForView(
      historyViewSelect.value as HistoricalViewMode,
    );
    applyEra(true);
  });
  opacitySlider.addEventListener("input", applyHistoricalOpacity);
  baseOpacitySlider.addEventListener("input", applyBaseOpacity);
  machiyaVisible.addEventListener("change", () => applyEra(true));
  machiyaOpacitySlider.addEventListener("input", applyMachiyaOpacity);
  coastlineVisible.addEventListener("change", () => applyEra(true));
  coastlineOpacitySlider.addEventListener("input", applyCoastlineOpacity);
  applyHistoricalOpacity();
  applyBaseOpacity();
  applyMachiyaOpacity();
  applyCoastlineOpacity();

  // 何もない場所のクリック: データなし表示(マーカークリックはイベントが止まる)
  map.on("click", () => {
    const binding = regionRegistry.getEraBinding(
      currentRegion.region.id,
      eraSelect.value,
    );
    handleHistoricalBackgroundClick(
      infoCard,
      Boolean(binding?.placeDatasetId),
      () => {
        if (currentRegion.region.id === "kyoto") {
          renderKyotoNoData(
            infoCard,
            map.getContainer(),
            currentRegion.region.presentation.noDataMessage,
          );
        } else if (currentRegion.region.id === "shiga") {
          renderShigaNoData(
            infoCard,
            map.getContainer(),
            currentRegion.region.presentation.noDataMessage,
          );
        } else {
          renderNoData(
            infoCard,
            map.getContainer(),
            currentRegion.region.presentation.noDataMessage,
          );
        }
      },
    );
  });

  // --- 現在地 ---
  const geoDialog = byId<HTMLDialogElement>("geo-dialog");
  const locateButton = byId<HTMLButtonElement>("locate-button");
  let locationMarker: L.CircleMarker | null = null;
  let accuracyCircle: L.Circle | null = null;

  function clearLocation(): void {
    if (locationMarker) {
      map.removeLayer(locationMarker);
      locationMarker = null;
    }
    if (accuracyCircle) {
      map.removeLayer(accuracyCircle);
      accuracyCircle = null;
    }
  }

  locateButton.addEventListener("click", () => {
    geoDialog.showModal();
  });
  byId<HTMLButtonElement>("geo-cancel").addEventListener("click", () => {
    geoDialog.close();
  });
  byId<HTMLButtonElement>("geo-accept").addEventListener("click", () => {
    geoDialog.close();
    void getCurrentLocation().then((outcome) => {
      switch (outcome.status) {
        case "ok": {
          clearLocation();
          const { lat, lon, accuracy } = outcome.position;
          locationMarker = L.circleMarker([lat, lon], {
            radius: 8,
            color: "#0d47a1",
            fillColor: "#2196f3",
            fillOpacity: 0.9,
            pane: MAP_PANES.currentLocation,
          }).addTo(map);
          if (Number.isFinite(accuracy) && accuracy > 0 && accuracy < 5000) {
            accuracyCircle = L.circle([lat, lon], {
              radius: accuracy,
              color: "#0d47a1",
              weight: 1,
              fillOpacity: 0.08,
              pane: MAP_PANES.currentLocation,
            }).addTo(map);
          }
          map.setView([lat, lon], Math.max(map.getZoom(), 15));
          showStatus(
            "現在地を表示しました。この座標は保存されません。マーカーはページを再読み込みすると消えます。",
            map.getContainer(),
          );
          break;
        }
        case "denied":
          showStatus(
            "位置情報の利用が許可されませんでした。地図の閲覧は引き続き利用できます。",
            map.getContainer(),
          );
          break;
        case "unsupported":
          showStatus(
            "このブラウザは位置情報に対応していません。地図の閲覧は引き続き利用できます。",
            map.getContainer(),
          );
          break;
        default:
          showStatus(
            "現在地を取得できませんでした。地図の閲覧は引き続き利用できます。",
            map.getContainer(),
          );
      }
    });
  });

  // --- 出典・プライバシー ---
  const attrDialog = byId<HTMLDialogElement>("attribution-dialog");
  byId<HTMLButtonElement>("attribution-button").addEventListener(
    "click",
    () => {
      renderAttribution(
        byId<HTMLElement>("attribution-content"),
        activeAttributionIds,
      );
      attrDialog.showModal();
    },
  );
  byId<HTMLButtonElement>("attribution-close").addEventListener("click", () =>
    attrDialog.close(),
  );

  const privacyDialog = byId<HTMLDialogElement>("privacy-dialog");
  byId<HTMLButtonElement>("privacy-button").addEventListener("click", () => {
    renderPrivacy(byId<HTMLElement>("privacy-content"));
    privacyDialog.showModal();
  });
  byId<HTMLButtonElement>("privacy-close").addEventListener("click", () =>
    privacyDialog.close(),
  );

  window.addEventListener("beforeunload", () => transitions.dispose(), {
    once: true,
  });
}

document.addEventListener("DOMContentLoaded", main);
