import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

import {
  INITIAL_CENTER,
  INITIAL_ZOOM,
  MIN_ZOOM,
  MAX_ZOOM,
  GSI_TILE_URLS,
  GSI_ATTRIBUTION,
  CODH_ATTRIBUTION,
  type BaseLayerKey,
} from "./config";
import { loadPlaces } from "./places";
import { createHistoricalLayer, type HistoricalLayer } from "./historical";
import { renderPlaceCard, renderNoData } from "./infocard";
import { getCurrentLocation } from "./geolocation";
import { renderAttribution, renderPrivacy } from "./attribution";
import { readAllowedParams } from "./urlparams";

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error("必要な画面要素が見つかりません");
  return el as T;
}

function showStatus(message: string): void {
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
  });
  map.attributionControl.setPrefix(false);

  // --- 基図(地理院タイル) ---
  const baseLayers: Record<BaseLayerKey, L.TileLayer> = {
    pale: L.tileLayer(GSI_TILE_URLS.pale, {
      attribution: GSI_ATTRIBUTION,
      maxZoom: MAX_ZOOM,
    }),
    std: L.tileLayer(GSI_TILE_URLS.std, {
      attribution: GSI_ATTRIBUTION,
      maxZoom: MAX_ZOOM,
    }),
  };
  const baseSelect = byId<HTMLSelectElement>("base-select");
  const initialBase = (params["base"] as BaseLayerKey) ?? "pale";
  baseSelect.value = initialBase;
  let currentBase: BaseLayerKey = initialBase;
  baseLayers[currentBase].addTo(map);
  baseSelect.addEventListener("change", () => {
    const next = baseSelect.value as BaseLayerKey;
    if (next === currentBase || !(next in baseLayers)) return;
    map.removeLayer(baseLayers[currentBase]);
    baseLayers[next].addTo(map);
    currentBase = next;
  });

  // --- 歴史レイヤー ---
  const eraSelect = byId<HTMLSelectElement>("era-select");
  const opacitySlider = byId<HTMLInputElement>("opacity-slider");
  const infoCard = byId<HTMLElement>("info-card");
  let historical: HistoricalLayer | null = null;

  function applyEra(): void {
    if (!historical) return;
    if (eraSelect.value === "edo-late") {
      historical.layer.addTo(map);
      map.attributionControl.addAttribution(CODH_ATTRIBUTION);
    } else {
      map.removeLayer(historical.layer);
      map.attributionControl.removeAttribution(CODH_ATTRIBUTION);
    }
  }

  function applyOpacity(): void {
    const value = Number(opacitySlider.value);
    if (!Number.isFinite(value)) return;
    historical?.setOpacity(value / 100);
    opacitySlider.setAttribute("aria-valuetext", `${value}パーセント`);
  }

  if (params["era"]) eraSelect.value = params["era"];

  loadPlaces()
    .then((places) => {
      historical = createHistoricalLayer(places, (place) => {
        renderPlaceCard(infoCard, place);
      });
      applyEra();
      applyOpacity();
    })
    .catch(() => {
      showStatus(
        "歴史データを読み込めませんでした。現代地図はそのまま利用できます。再読み込みすると回復する場合があります。",
      );
    });

  eraSelect.addEventListener("change", applyEra);
  opacitySlider.addEventListener("input", applyOpacity);

  // 何もない場所のクリック: データなし表示(マーカークリックはイベントが止まる)
  map.on("click", () => {
    if (!infoCard.hidden) return;
    if (eraSelect.value === "edo-late") renderNoData(infoCard);
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
          }).addTo(map);
          if (Number.isFinite(accuracy) && accuracy > 0 && accuracy < 5000) {
            accuracyCircle = L.circle([lat, lon], {
              radius: accuracy,
              color: "#0d47a1",
              weight: 1,
              fillOpacity: 0.08,
            }).addTo(map);
          }
          map.setView([lat, lon], Math.max(map.getZoom(), 15));
          showStatus(
            "現在地を表示しました。この座標は保存されません。マーカーはページを再読み込みすると消えます。",
          );
          break;
        }
        case "denied":
          showStatus(
            "位置情報の利用が許可されませんでした。地図の閲覧は引き続き利用できます。",
          );
          break;
        case "unsupported":
          showStatus(
            "このブラウザは位置情報に対応していません。地図の閲覧は引き続き利用できます。",
          );
          break;
        default:
          showStatus(
            "現在地を取得できませんでした。地図の閲覧は引き続き利用できます。",
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
}

document.addEventListener("DOMContentLoaded", main);
