import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

import {
  INITIAL_CENTER,
  INITIAL_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  GSI_TILE_URLS,
  CODH_ATTRIBUTION,
  type BaseLayerKey,
} from "./config";
import { loadPlaces } from "./places";
import { createHistoricalLayer, type HistoricalLayer } from "./historical";
import { renderPlaceCard, renderNoData } from "./infocard";
import { getCurrentLocation } from "./geolocation";
import { renderAttribution, renderPrivacy } from "./attribution";
import { readAllowedParams } from "./urlparams";
import {
  eraRegistry,
  isVisualLayerEnabled,
  populateEraSelect,
  VISUAL_LAYER_IDS,
} from "./eras";
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

type HistoricalViewMode = "reconstructed" | "compare" | "points";

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

  const map = L.map("map", {
    center: INITIAL_CENTER,
    zoom: INITIAL_ZOOM,
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
  const eraSelect = byId<HTMLSelectElement>("era-select");
  populateEraSelect(eraSelect);
  const requestedEra = params["era"] === "none" ? "modern" : params["era"];
  eraSelect.value = eraRegistry.get(requestedEra ?? "")?.id ?? "edo-late";
  const historyViewSelect = byId<HTMLSelectElement>("history-view-select");
  const historyControls = byId<HTMLElement>("history-controls");
  const eraCaution = byId<HTMLElement>("era-caution");
  const opacitySlider = byId<HTMLInputElement>("opacity-slider");
  const baseOpacitySlider = byId<HTMLInputElement>("base-opacity-slider");
  const infoCard = byId<HTMLElement>("info-card");
  let historical: HistoricalLayer | null = null;
  let historicalPointsLayer: TransitionLayer | null = null;
  let codhAttributionVisible = false;

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

  function syncCodhAttribution(show: boolean): void {
    if (show === codhAttributionVisible) return;
    if (show) map.attributionControl.addAttribution(CODH_ATTRIBUTION);
    else map.attributionControl.removeAttribution(CODH_ATTRIBUTION);
    codhAttributionVisible = show;
  }

  function applyEra(animate = true): void {
    const era = eraRegistry.get(eraSelect.value) ?? eraRegistry.get("modern");
    if (!era) return;
    const targets: { layer: TransitionLayer; opacity: number }[] = [];
    const isHistorical = era.baseMode !== "modern";
    const view = historyViewSelect.value as HistoricalViewMode;
    historyControls.hidden = !isHistorical;
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
    syncCodhAttribution(
      isHistorical &&
        historicalPointsLayer !== null &&
        era.attributionIds.includes("codh-edo-maps-places"),
    );
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

  loadPlaces()
    .then((places) => {
      historical = createHistoricalLayer(
        places,
        (place) => {
          renderPlaceCard(infoCard, place, map.getContainer());
        },
        panes.get(MAP_PANES.historicalPoints) as HTMLElement,
      );
      historicalPointsLayer = createHistoricalPointsTransitionLayer(
        map,
        historical,
        panes.get(MAP_PANES.historicalPoints) as HTMLElement,
      );
      applyEra(false);
    })
    .catch(() => {
      showStatus(
        "歴史データを読み込めませんでした。現代地図はそのまま利用できます。再読み込みすると回復する場合があります。",
        map.getContainer(),
      );
    });

  eraSelect.addEventListener("change", () => applyEra(true));
  historyViewSelect.addEventListener("change", () => applyEra(true));
  opacitySlider.addEventListener("input", applyHistoricalOpacity);
  baseOpacitySlider.addEventListener("input", applyBaseOpacity);
  applyHistoricalOpacity();
  applyBaseOpacity();

  // 何もない場所のクリック: データなし表示(マーカークリックはイベントが止まる)
  map.on("click", () => {
    if (!infoCard.hidden) return;
    if (eraRegistry.get(eraSelect.value)?.placeDatasetId) {
      renderNoData(infoCard, map.getContainer());
    }
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
      renderAttribution(byId<HTMLElement>("attribution-content"));
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
