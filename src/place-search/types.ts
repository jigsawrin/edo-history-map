import type { KyotoBakumatsuPlace } from "../kyoto-bakumatsu-places";
import type { PlaceFeature } from "../validate";

export const SEARCHABLE_PLACE_DATASET_IDS = Object.freeze([
  "codh-edo-maps-places",
  "project-kyoto-bakumatsu-places",
] as const);

export type SearchablePlaceDatasetId =
  (typeof SEARCHABLE_PLACE_DATASET_IDS)[number];

export type HistoricalPlaceSource =
  | Readonly<{
      datasetId: "codh-edo-maps-places";
      record: PlaceFeature;
      sourceIndex: number;
    }>
  | Readonly<{
      datasetId: "project-kyoto-bakumatsu-places";
      record: KyotoBakumatsuPlace;
      sourceIndex: number;
    }>;

export interface SearchableHistoricalPlace {
  readonly key: string;
  readonly datasetId: SearchablePlaceDatasetId;
  readonly regionId: "edo" | "kyoto";
  readonly eraId: "edo-late" | "bakumatsu";
  readonly name: string;
  readonly secondaryText: string;
  readonly detailText: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly normalizedName: string;
  readonly normalizedAlternateName: string;
  readonly normalizedCategory: string;
  readonly normalizedSecondary: string;
  readonly normalizedDescription: string;
  readonly normalizedSearchText: string;
  readonly sourceRecord: HistoricalPlaceSource;
}

export interface PlaceSearchCopy {
  readonly searchButtonLabel: string;
  readonly searchHeading: string;
  readonly searchInputLabel: string;
  readonly searchEmptyMessage: string;
  readonly searchResultNoun: string;
}

export interface SearchCategory {
  readonly id: string;
  readonly label: string;
}

export interface SearchResultPage {
  readonly matches: readonly SearchableHistoricalPlace[];
  readonly items: readonly SearchableHistoricalPlace[];
  readonly page: number;
  readonly pageCount: number;
  readonly totalCount: number;
}
