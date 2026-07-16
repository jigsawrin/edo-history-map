import {
  ERA_BASE_MODES,
  HISTORICAL_VIEW_MODES,
  eraRegistry,
  isKnownVisualLayer,
  type EraRegistry,
} from "../eras";
import { EDO_REGION_ID, EDO_REGION_PACK } from "./edo";
import { KYOTO_REGION_PACK } from "./kyoto";
import { datasetRegistry, type DatasetRegistry } from "../datasets";
import { ATTRIBUTION_REGISTRY } from "../attribution-registry";
import type {
  RegionDefinition,
  RegionEraDefinition,
  RegionPack,
} from "./types";

const REGION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_REGION_ZOOM = 5;
const MAX_REGION_ZOOM = 18;
const MAX_REGION_METADATA_LENGTH = 300;
const MAX_UNCERTAINTY_NOTE_LENGTH = 1000;
const KYOTO_DATASET_ID = "project-kyoto-bakumatsu-places";
const EDO_DATASET_PREFIX = "codh-edo-";
const ERA_BASE_MODE_IDS = new Set<string>(ERA_BASE_MODES);
const HISTORICAL_VIEW_MODE_IDS = new Set<string>(HISTORICAL_VIEW_MODES);

function validCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function validFixedText(value: string, maxLength: number): boolean {
  return (
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !hasControlCharacters(value) &&
    !/[<>]/.test(value)
  );
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function validateRegionMetadata(region: Readonly<RegionDefinition>): void {
  const values = [region.pageTitle, region.metaDescription, region.tagline];
  const hasAny = values.some((value) => value !== undefined);
  if (region.id === "kyoto" && !values.every((value) => value !== undefined)) {
    throw new Error("京都地域メタデータがありません");
  }
  if (
    hasAny &&
    (!values.every((value) => typeof value === "string") ||
      !values.every((value) =>
        validFixedText(value as string, MAX_REGION_METADATA_LENGTH),
      ))
  ) {
    throw new Error("地域メタデータが不正です");
  }
}

function validateDatasetOwnership(regionId: string, datasetIds: readonly string[]): void {
  if (regionId === "kyoto" && datasetIds.some((id) => id.startsWith(EDO_DATASET_PREFIX))) {
    throw new Error("京都地域はEDO専用データを参照できません");
  }
  if (regionId === EDO_REGION_ID && datasetIds.includes(KYOTO_DATASET_ID)) {
    throw new Error("EDO地域は京都専用データを参照できません");
  }
}

function validateEraBinding(
  regionId: string,
  binding: Readonly<RegionEraDefinition>,
): void {
  if (!ERA_BASE_MODE_IDS.has(binding.baseMode)) {
    throw new Error(`不正な基図モードです: ${binding.baseMode}`);
  }
  if (
    !Array.isArray(binding.visualLayers) ||
    hasDuplicates(binding.visualLayers) ||
    binding.visualLayers.some((id) => !isKnownVisualLayer(id))
  ) {
    throw new Error("表示レイヤーIDが不正または重複しています");
  }
  if (!Array.isArray(binding.datasetIds) || hasDuplicates(binding.datasetIds)) {
    throw new Error("データセットIDが重複しています");
  }
  if (
    !Array.isArray(binding.attributionIds) ||
    hasDuplicates(binding.attributionIds)
  ) {
    throw new Error("出典IDが重複しています");
  }
  if (
    typeof binding.uncertaintyNote !== "string" ||
    binding.uncertaintyNote.length > MAX_UNCERTAINTY_NOTE_LENGTH ||
    hasControlCharacters(binding.uncertaintyNote)
  ) {
    throw new Error("年代注意文が不正です");
  }

  const modes = binding.allowedHistoricalViewModes;
  const defaultMode = binding.defaultHistoricalViewMode;
  if (modes !== undefined && !Array.isArray(modes)) {
    throw new Error("歴史表示モードが不正です");
  }
  if ((modes === undefined) !== (defaultMode === undefined)) {
    throw new Error("歴史表示モード定義が不完全です");
  }
  if (
    modes &&
    (modes.length === 0 ||
      hasDuplicates(modes) ||
      modes.some((mode) => !HISTORICAL_VIEW_MODE_IDS.has(mode)) ||
      !modes.includes(defaultMode as (typeof modes)[number]))
  ) {
    throw new Error("歴史表示モードが不正です");
  }
  if (regionId === "kyoto" && (!modes || defaultMode === undefined)) {
    throw new Error("京都地域の歴史表示モードがありません");
  }
  if (
    binding.baseMode === "historical-points" &&
    (!binding.visualLayers.includes("historical-points") ||
      binding.visualLayers.includes("reconstructed-background"))
  ) {
    throw new Error("地点専用基図モードの表示レイヤーが不正です");
  }
  validateDatasetOwnership(regionId, binding.datasetIds);
}

function cloneEra(binding: RegionEraDefinition): Readonly<RegionEraDefinition> {
  const clone: RegionEraDefinition = {
    ...binding,
    visualLayers: Object.freeze([...binding.visualLayers]),
    datasetIds: Object.freeze([...binding.datasetIds]),
    attributionIds: Object.freeze([...binding.attributionIds]),
  };
  if (binding.allowedHistoricalViewModes) {
    clone.allowedHistoricalViewModes = Object.freeze([
      ...binding.allowedHistoricalViewModes,
    ]);
  }
  return Object.freeze(clone);
}

function clonePack(pack: RegionPack): Readonly<RegionPack> {
  const region = pack.region;
  const localizedLabels = region.localizedLabels
    ? Object.freeze({ ...region.localizedLabels })
    : undefined;
  const clonedRegion: RegionDefinition = {
    ...region,
    center: Object.freeze([...region.center]) as readonly [number, number],
    bounds: Object.freeze({ ...region.bounds }),
    enabledEraIds: Object.freeze([...region.enabledEraIds]),
  };
  if (localizedLabels) clonedRegion.localizedLabels = localizedLabels;
  return Object.freeze({
    region: Object.freeze(clonedRegion),
    eras: Object.freeze(pack.eras.map(cloneEra)),
  });
}

export class RegionRegistry {
  readonly #packs: ReadonlyMap<string, Readonly<RegionPack>>;
  readonly defaultRegionId: string;

  constructor(
    packs: readonly RegionPack[] = [EDO_REGION_PACK, KYOTO_REGION_PACK],
    eras: EraRegistry = eraRegistry,
    defaultRegionId = EDO_REGION_ID,
    datasets: DatasetRegistry = datasetRegistry,
  ) {
    if (packs.length === 0) throw new Error("地域定義がありません");
    const entries = packs.map((sourcePack) => {
      const pack = clonePack(sourcePack);
      const { region } = pack;
      if (!REGION_ID_PATTERN.test(region.id) || !region.label) {
        throw new Error("地域IDまたはラベルが不正です");
      }
      validateRegionMetadata(region);
      const [lat, lon] = region.center;
      if (!validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
        throw new Error("地域の中心座標が不正です");
      }
      const { minLat, maxLat, minLon, maxLon } = region.bounds;
      if (
        !validCoordinate(minLat, -90, 90) ||
        !validCoordinate(maxLat, -90, 90) ||
        !validCoordinate(minLon, -180, 180) ||
        !validCoordinate(maxLon, -180, 180) ||
        minLat >= maxLat ||
        minLon >= maxLon
      ) {
        throw new Error("地域boundsが不正です");
      }
      if (lat < minLat || lat > maxLat || lon < minLon || lon > maxLon) {
        throw new Error("地域の中心座標がbounds外です");
      }
      if (
        !Number.isInteger(region.defaultZoom) ||
        region.defaultZoom < MIN_REGION_ZOOM ||
        region.defaultZoom > MAX_REGION_ZOOM
      ) {
        throw new Error("地域の初期ズームが不正です");
      }
      if (new Set(region.enabledEraIds).size !== region.enabledEraIds.length) {
        throw new Error("地域の年代IDが重複しています");
      }
      for (const eraId of region.enabledEraIds) {
        if (!eras.get(eraId)) throw new Error(`存在しない年代IDです: ${eraId}`);
      }
      if (!region.enabledEraIds.includes(region.defaultEraId)) {
        throw new Error("地域の初期年代が有効年代に含まれていません");
      }
      const bindings = new Map(pack.eras.map((binding) => [binding.eraId, binding]));
      if (bindings.size !== pack.eras.length) {
        throw new Error("地域・年代バインディングが重複しています");
      }
      for (const binding of pack.eras) {
        validateEraBinding(region.id, binding);
        if (!eras.get(binding.eraId)) {
          throw new Error(`存在しない年代IDです: ${binding.eraId}`);
        }
        for (const datasetId of binding.datasetIds) {
          if (!datasets.get(datasetId)) {
            throw new Error(`未承認データセットIDです: ${datasetId}`);
          }
        }
        if (
          binding.placeDatasetId !== null &&
          (!datasets.get(binding.placeDatasetId) ||
            !binding.datasetIds.includes(binding.placeDatasetId))
        ) {
          throw new Error("地点データセット参照が不正です");
        }
        for (const attributionId of binding.attributionIds) {
          if (!Object.hasOwn(ATTRIBUTION_REGISTRY, attributionId)) {
            throw new Error(`未登録の出典IDです: ${attributionId}`);
          }
        }
      }
      const kyotoBakumatsu = bindings.get("bakumatsu");
      if (
        region.id === "kyoto" &&
        (!kyotoBakumatsu ||
          kyotoBakumatsu.datasetIds.length !== 1 ||
          kyotoBakumatsu.datasetIds[0] !== KYOTO_DATASET_ID)
      ) {
        throw new Error("京都・幕末データセット参照が不正です");
      }
      for (const eraId of region.enabledEraIds) {
        if (!bindings.get(eraId)?.enabled) {
          throw new Error(`有効年代のバインディングがありません: ${eraId}`);
        }
      }
      return [region.id, pack] as const;
    });
    if (new Set(entries.map(([id]) => id)).size !== entries.length) {
      throw new Error("地域IDが重複しています");
    }
    this.#packs = new Map(entries);
    if (!this.get(defaultRegionId)) {
      throw new Error("既定地域が存在しないか無効です");
    }
    this.defaultRegionId = defaultRegionId;
  }

  get(id: string): Readonly<RegionPack> | null {
    const pack = this.#packs.get(id);
    return pack?.region.enabled ? pack : null;
  }

  enabled(): readonly Readonly<RegionPack>[] {
    return [...this.#packs.values()].filter((pack) => pack.region.enabled);
  }

  resolve(id: string | null | undefined): Readonly<RegionPack> {
    return this.get(id ?? "") ?? (this.get(this.defaultRegionId) as Readonly<RegionPack>);
  }

  getEraBinding(regionId: string, eraId: string): Readonly<RegionEraDefinition> | null {
    const pack = this.get(regionId);
    if (!pack || !pack.region.enabledEraIds.includes(eraId)) return null;
    return pack.eras.find((binding) => binding.eraId === eraId && binding.enabled) ?? null;
  }
}

export const regionRegistry = new RegionRegistry();
