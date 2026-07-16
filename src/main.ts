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
  const historyControls = byId<HTMLElement>("history-controls");
  const eraCaution = byId<HTMLElement>("era-caution");
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
  let historicalPointsLayer: TransitionLayer | null = null;
  let machiyaLayer: MachiyaAreaTransitionLayer | null = null;
  let coastlineLayer: CoastlineTransitionLayer | null = null;
  let activeAttributionIds: readonly string[] = ["gsi-tiles"];
  const visibleLeafletAttributions = new Set<string>();
  const loadCoordinator = new RegionLoadCoordinator();
  let regionToken = loadCoordinator.begin(currentRegion.region.id);

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

  function prefersReducedMotion(): boolean {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
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
    const view = historyViewSelect.value as HistoricalViewMode;
    historyControls.hidden = !isHistorical;
    machiyaControls.hidden =
      !isHistorical || (!supportsMachiya && !supportsCoastline);
    coastlineControls.hidden = !isHistorical || !supportsCoastline;
    machiyaAreaControls.hidden = !isHistorical || !supportsMachiya;
    pointsOpacityControl.hidden = !isHistorical || !supportsPoints;
    baseOpacityControl.hidden = !isHistorical;
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

  let pointsLayerPromise: Promise<TransitionLayer> | null = null;
  let machiyaLayerPromise: Promise<MachiyaAreaTransitionLayer> | null = null;
  let coastlineLayerPromise: Promise<CoastlineTransitionLayer> | null = null;

  function cachedPointsLayer(): Promise<TransitionLayer> {
    if (!pointsLayerPromise) {
      pointsLayerPromise = datasetRegistry
        .load("codh-edo-maps-places")
        .then((places) => {
          const historical: HistoricalLayer = createHistoricalLayer(
            places,
            (place) => renderPlaceCard(infoCard, place, map.getContainer()),
            panes.get(MAP_PANES.historicalPoints) as HTMLElement,
          );
          return createHistoricalPointsTransitionLayer(
            map,
            historical,
            panes.get(MAP_PANES.historicalPoints) as HTMLElement,
          );
        })
        .catch((error: unknown) => {
          pointsLayerPromise = null;
          throw error;
        });
    }
    return pointsLayerPromise;
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
      promise: Promise<T>,
      assign: (layer: T) => void,
      message: string,
    ): void => {
      if (!ids.has(id)) return;
      void promise
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
    load(
      "codh-edo-maps-places",
      cachedPointsLayer(),
      (layer) => {
        historicalPointsLayer = layer;
      },
      "歴史データを読み込めませんでした。現代地図はそのまま利用できます。再読み込みすると回復する場合があります。",
    );
    load(
      "codh-edo-machiya-areas",
      cachedMachiyaLayer(),
      (layer) => {
        machiyaLayer = layer;
      },
      "町家領域データを読み込めませんでした。現代地図・江戸地名・現在地など、その他の機能は引き続き利用できます。",
    );
    load(
      "codh-edo-coastline",
      cachedCoastlineLayer(),
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
    machiyaLayer = null;
    coastlineLayer = null;
    populateRegionEraSelect(eraSelect, pack);
    if (moveMap) {
      applyRegionMapView(map, pack);
      closeRegionInfoCard(infoCard, regionSelect);
      announceRegionChange(regionStatus, pack);
    }
    applyEra(false);
    loadRegionLayers(pack);
  }

  loadRegionLayers(currentRegion);

  regionSelect.addEventListener("change", () => {
    const next = regionRegistry.get(regionSelect.value);
    if (!next) {
      regionSelect.value = currentRegion.region.id;
      return;
    }
    activateRegion(next, true);
  });

  eraSelect.addEventListener("change", () => applyEra(true));
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
      () => renderNoData(infoCard, map.getContainer()),
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
