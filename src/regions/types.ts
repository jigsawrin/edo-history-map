import type { EraBaseMode, HistoricalViewMode } from "../eras";

export type LocaleId = "ja" | "en";
export type RegionId = string;

export interface RegionBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface RegionDefinition {
  id: RegionId;
  label: string;
  localizedLabels?: Partial<Record<LocaleId, string>>;
  center: readonly [number, number];
  defaultZoom: number;
  bounds: RegionBounds;
  defaultEraId: string;
  enabledEraIds: readonly string[];
  enabled: boolean;
  presentation: RegionPresentation;
}

export interface RegionPresentation {
  pageTitle: string;
  metaDescription: string;
  tagline: string;
  pointOpacityLabel: string;
  historicalViewLabel: string;
  footerCaution: string;
  pointLegendLabel: string;
  noDataMessage: string;
  searchButtonLabel: string;
  searchHeading: string;
  searchInputLabel: string;
  searchEmptyMessage: string;
  searchResultNoun: string;
}

export interface RegionEraDefinition {
  eraId: string;
  enabled: boolean;
  baseMode: EraBaseMode;
  visualLayers: readonly string[];
  datasetIds: readonly string[];
  placeDatasetId: string | null;
  attributionIds: readonly string[];
  uncertaintyNote: string;
  allowedHistoricalViewModes?: readonly HistoricalViewMode[];
  defaultHistoricalViewMode?: HistoricalViewMode;
}

export interface RegionPack {
  region: RegionDefinition;
  eras: readonly RegionEraDefinition[];
}
