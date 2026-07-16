import { datasetRegistry, type DatasetRegistry } from "../datasets";
import { SEARCH_ADAPTERS } from "./adapters";
import type {
  SearchableHistoricalPlace,
  SearchablePlaceDatasetId,
} from "./types";

export class PlaceSearchModelCache {
  readonly #registry: DatasetRegistry;
  readonly #cache = new Map<
    SearchablePlaceDatasetId,
    Promise<readonly SearchableHistoricalPlace[]>
  >();

  constructor(registry: DatasetRegistry = datasetRegistry) {
    this.#registry = registry;
  }

  load(
    datasetId: SearchablePlaceDatasetId,
  ): Promise<readonly SearchableHistoricalPlace[]> {
    const cached = this.#cache.get(datasetId);
    if (cached) return cached;
    const promise = this.#registry
      .load(datasetId)
      .then((value) => SEARCH_ADAPTERS[datasetId](value as never))
      .catch((error: unknown) => {
        this.#cache.delete(datasetId);
        throw error;
      });
    this.#cache.set(datasetId, promise);
    return promise;
  }
}

export const placeSearchModelCache = new PlaceSearchModelCache();
