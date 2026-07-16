import {
  eraRegistry,
  formatEraLabel,
  populateEraSelect,
  type EraRegistry,
} from "./eras";
import type { RegionPack } from "./regions/types";
import { RegionRegistry, regionRegistry } from "./regions/registry";

export interface RegionChangeToken {
  readonly generation: number;
  readonly regionId: string;
}

/** 非同期読み込み結果が現在の地域変更世代に属するかを判定する。 */
export class RegionLoadCoordinator {
  #generation = 0;
  #regionId = "";

  begin(regionId: string): RegionChangeToken {
    this.#generation += 1;
    this.#regionId = regionId;
    return Object.freeze({ generation: this.#generation, regionId });
  }

  isCurrent(token: RegionChangeToken): boolean {
    return (
      token.generation === this.#generation && token.regionId === this.#regionId
    );
  }
}

function locale(): "ja" | "en" {
  return document.documentElement.lang.startsWith("en") ? "en" : "ja";
}

export function populateRegionSelect(
  select: HTMLSelectElement,
  container: HTMLElement,
  registry: RegionRegistry = regionRegistry,
): void {
  const enabled = registry.enabled();
  const options = enabled.map((pack) => {
    const option = document.createElement("option");
    option.value = pack.region.id;
    option.textContent =
      pack.region.localizedLabels?.[locale()] ?? pack.region.label;
    return option;
  });
  select.replaceChildren(...options);
  container.hidden = enabled.length < 2;
  if (container.hidden) select.tabIndex = -1;
  else select.removeAttribute("tabindex");
}

export function populateRegionEraSelect(
  select: HTMLSelectElement,
  pack: Readonly<RegionPack>,
  catalog: EraRegistry = eraRegistry,
  preferredEraId?: string,
): string {
  populateEraSelect(select, pack.region.enabledEraIds, catalog, locale());
  const selected =
    preferredEraId && pack.region.enabledEraIds.includes(preferredEraId)
      ? preferredEraId
      : pack.region.defaultEraId;
  select.value = selected;
  return selected;
}

export function activeRegionFromParam(
  requestedId: string | undefined,
  registry: RegionRegistry = regionRegistry,
): Readonly<RegionPack> {
  return registry.resolve(requestedId);
}

export function announceRegionChange(
  liveRegion: HTMLElement,
  pack: Readonly<RegionPack>,
  catalog: EraRegistry = eraRegistry,
): void {
  const era = catalog.get(pack.region.defaultEraId);
  const eraLabel = era ? formatEraLabel(era, locale()) : "既定年代";
  liveRegion.textContent = `地域を${pack.region.label}へ変更しました。年代は${eraLabel}です。`;
}

export function closeRegionInfoCard(
  card: HTMLElement,
  returnFocus?: HTMLElement,
): void {
  card.hidden = true;
  card.replaceChildren();
  returnFocus?.focus();
}

export interface RegionMapView {
  setView(center: [number, number], zoom: number): unknown;
}

export function applyRegionMapView(
  map: RegionMapView,
  pack: Readonly<RegionPack>,
): void {
  map.setView([...pack.region.center], pack.region.defaultZoom);
}

export function layerControlAvailability(
  pack: Readonly<RegionPack>,
  eraId: string,
  layerId: string,
  registry: RegionRegistry = regionRegistry,
): boolean {
  return (
    registry
      .getEraBinding(pack.region.id, eraId)
      ?.visualLayers.includes(layerId) === true
  );
}
