import { eraRegistry, type EraRegistry } from "../eras";
import { EDO_REGION_ID, EDO_REGION_PACK } from "./edo";
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

function validCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

function cloneEra(binding: RegionEraDefinition): Readonly<RegionEraDefinition> {
  return Object.freeze({
    ...binding,
    visualLayers: Object.freeze([...binding.visualLayers]),
    datasetIds: Object.freeze([...binding.datasetIds]),
    attributionIds: Object.freeze([...binding.attributionIds]),
  });
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
    packs: readonly RegionPack[] = [EDO_REGION_PACK],
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
