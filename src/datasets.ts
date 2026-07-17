import { loadCoastlines, type CoastlineCollection } from "./coastlines";
import {
  loadMachiyaAreas,
  type MachiyaAreaCollection,
} from "./machiya-areas";
import { loadPlaces } from "./places";
import type { PlaceFeature } from "./validate";
import {
  loadKyotoBakumatsuPlaces,
  type KyotoBakumatsuPlace,
} from "./kyoto-bakumatsu-places";
import {
  loadShigaSengokuPlaces,
  type ShigaSengokuPlace,
} from "./shiga-sengoku-places";
import manifestData from "./dataset-manifest.json";

export type ApprovedDatasetId =
  | "codh-edo-maps-places"
  | "codh-edo-machiya-areas"
  | "codh-edo-coastline"
  | "project-kyoto-bakumatsu-places"
  | "project-shiga-sengoku-places";

export interface DatasetValueMap {
  "codh-edo-maps-places": PlaceFeature[];
  "codh-edo-machiya-areas": MachiyaAreaCollection;
  "codh-edo-coastline": CoastlineCollection;
  "project-kyoto-bakumatsu-places": readonly KyotoBakumatsuPlace[];
  "project-shiga-sengoku-places": readonly ShigaSengokuPlace[];
}

export interface DatasetDefinition<Id extends ApprovedDatasetId = ApprovedDatasetId> {
  id: Id;
  kind: "places" | "polygon" | "line";
  path: string;
  publicSha256: string;
  sourceId: Id;
  load: (baseUrl?: string) => Promise<DatasetValueMap[Id]>;
}

const LOADERS: Readonly<
  Record<ApprovedDatasetId, DatasetDefinition["load"]>
> = Object.freeze({
  "codh-edo-maps-places": loadPlaces,
  "codh-edo-machiya-areas": loadMachiyaAreas,
  "codh-edo-coastline": loadCoastlines,
  "project-kyoto-bakumatsu-places": loadKyotoBakumatsuPlaces,
  "project-shiga-sengoku-places": loadShigaSengokuPlaces,
});

export const DATASET_DEFINITIONS: readonly DatasetDefinition[] = Object.freeze(
  manifestData.map((item) => {
    const id = item.id as ApprovedDatasetId;
    return Object.freeze({
      ...item,
      id,
      sourceId: item.sourceId as ApprovedDatasetId,
      kind: item.kind as DatasetDefinition["kind"],
      load: LOADERS[id],
    });
  }),
);

const APPROVED_DATASET_IDS = new Set<ApprovedDatasetId>([
  "codh-edo-maps-places",
  "codh-edo-machiya-areas",
  "codh-edo-coastline",
  "project-kyoto-bakumatsu-places",
  "project-shiga-sengoku-places",
]);

function isSafeLocalDataPath(path: string): boolean {
  return (
    /^data\/[a-z0-9][a-z0-9.-]*\.geojson$/.test(path) &&
    !path.includes("..") &&
    !path.includes(":") &&
    !path.startsWith("/")
  );
}

export class DatasetRegistry {
  readonly #definitions: ReadonlyMap<ApprovedDatasetId, DatasetDefinition>;
  readonly #cache = new Map<ApprovedDatasetId, Promise<unknown>>();

  constructor(definitions: readonly DatasetDefinition[] = DATASET_DEFINITIONS) {
    const entries = definitions.map((definition) => {
      if (
        !APPROVED_DATASET_IDS.has(definition.id) ||
        definition.id !== definition.sourceId ||
        !isSafeLocalDataPath(definition.path) ||
        !/^[0-9a-f]{64}$/.test(definition.publicSha256) ||
        typeof definition.load !== "function"
      ) {
        throw new Error("データセット定義が不正です");
      }
      return [definition.id, Object.freeze({ ...definition })] as const;
    });
    if (new Set(entries.map(([id]) => id)).size !== entries.length) {
      throw new Error("データセットIDが重複しています");
    }
    this.#definitions = new Map(entries);
  }

  get(id: string): Readonly<DatasetDefinition> | null {
    return this.#definitions.get(id as ApprovedDatasetId) ?? null;
  }

  all(): readonly Readonly<DatasetDefinition>[] {
    return [...this.#definitions.values()];
  }

  load<Id extends ApprovedDatasetId>(
    id: Id,
    baseUrl?: string,
  ): Promise<DatasetValueMap[Id]> {
    const definition = this.#definitions.get(id);
    if (!definition) return Promise.reject(new Error("未承認データセットです"));
    const cached = this.#cache.get(id);
    if (cached) return cached as Promise<DatasetValueMap[Id]>;
    const promise = definition
      .load(baseUrl)
      .catch((error: unknown) => {
        this.#cache.delete(id);
        throw error;
      });
    this.#cache.set(id, promise);
    return promise as Promise<DatasetValueMap[Id]>;
  }
}

export const datasetRegistry = new DatasetRegistry();
