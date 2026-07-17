import type { DatasetValueMap } from "../datasets";
import type {
  KyotoBakumatsuPlace,
  KyotoPlaceCategory,
} from "../kyoto-bakumatsu-places";
import type { PlaceFeature } from "../validate";
import presentation from "../kyoto-place-presentation.json";
import shigaPresentation from "../shiga-place-presentation.json";
import type { ShigaPlaceCategory, ShigaSengokuPlace } from "../shiga-sengoku-places";
import { normalizeSearchText } from "./normalize";
import type {
  SearchableHistoricalPlace,
  SearchablePlaceDatasetId,
} from "./types";

export const KYOTO_CATEGORY_LABELS: Readonly<Record<KyotoPlaceCategory, string>> =
  presentation.categoryLabels;
export const SHIGA_CATEGORY_LABELS: Readonly<Record<ShigaPlaceCategory, string>> =
  shigaPresentation.categoryLabels;

function combinedNormalizedText(parts: readonly string[]): string {
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

export function createEdoSearchRecords(
  places: readonly PlaceFeature[],
): readonly SearchableHistoricalPlace[] {
  const entryIdCounts = new Map<string, number>();
  for (const place of places) {
    entryIdCounts.set(place.entryId, (entryIdCounts.get(place.entryId) ?? 0) + 1);
  }
  return Object.freeze(
    places.map((record, sourceIndex) => {
      const secondaryText = [record.category, record.sheet]
        .filter(Boolean)
        .join("／");
      const normalizedName = normalizeSearchText(record.name);
      const normalizedCategory = normalizeSearchText(record.category);
      const normalizedSecondary = normalizeSearchText(record.sheet);
      return Object.freeze({
        key:
          record.entryId && entryIdCounts.get(record.entryId) === 1
            ? `edo:${record.entryId}`
            : `edo:${record.entryId}:${record.name}:${record.sheet}:${sourceIndex}`,
        datasetId: "codh-edo-maps-places" as const,
        regionId: "edo" as const,
        eraId: "edo-late" as const,
        name: record.name,
        secondaryText,
        detailText: "",
        categoryId: record.category,
        categoryLabel: record.category,
        latitude: record.lat,
        longitude: record.lon,
        normalizedName,
        normalizedAlternateName: "",
        normalizedCategory,
        normalizedSecondary,
        normalizedDescription: "",
        normalizedSearchText: combinedNormalizedText([
          record.name,
          record.category,
          record.sheet,
        ]),
        sourceRecord: Object.freeze({
          datasetId: "codh-edo-maps-places" as const,
          record,
          sourceIndex,
        }),
      });
    }),
  );
}

export function createKyotoSearchRecords(
  places: readonly KyotoBakumatsuPlace[],
): readonly SearchableHistoricalPlace[] {
  return Object.freeze(
    places.map((record, sourceIndex) => {
      const categoryLabel = KYOTO_CATEGORY_LABELS[record.category];
      const secondaryText = `${categoryLabel}／${record.dateDisplayJa}`;
      const normalizedName = normalizeSearchText(record.nameJa);
      const normalizedAlternateName = normalizeSearchText(record.nameEn ?? "");
      const normalizedCategory = normalizeSearchText(categoryLabel);
      const normalizedSecondary = normalizeSearchText(record.dateDisplayJa);
      const normalizedDescription = normalizeSearchText(record.summaryJa);
      return Object.freeze({
        key: `kyoto:${record.id}`,
        datasetId: "project-kyoto-bakumatsu-places" as const,
        regionId: "kyoto" as const,
        eraId: "bakumatsu" as const,
        name: record.nameJa,
        secondaryText,
        detailText: `位置精度：${presentation.coordinateConfidenceLabels[record.coordinateConfidence]}`,
        categoryId: record.category,
        categoryLabel,
        latitude: record.latitude,
        longitude: record.longitude,
        normalizedName,
        normalizedAlternateName,
        normalizedCategory,
        normalizedSecondary,
        normalizedDescription,
        normalizedSearchText: combinedNormalizedText([
          record.nameJa,
          record.nameEn ?? "",
          categoryLabel,
          record.dateDisplayJa,
          record.summaryJa,
        ]),
        sourceRecord: Object.freeze({
          datasetId: "project-kyoto-bakumatsu-places" as const,
          record,
          sourceIndex,
        }),
      });
    }),
  );
}

export function createShigaSearchRecords(
  places: readonly ShigaSengokuPlace[],
): readonly SearchableHistoricalPlace[] {
  return Object.freeze(places.map((record, sourceIndex) => {
    const categoryLabel = SHIGA_CATEGORY_LABELS[record.category];
    const normalizedName = normalizeSearchText(record.nameJa);
    const normalizedAlternateName = normalizeSearchText(record.nameEn ?? "");
    const normalizedCategory = normalizeSearchText(categoryLabel);
    const normalizedSecondary = normalizeSearchText(`${record.municipalityJa} ${record.dateDisplayJa}`);
    const normalizedDescription = normalizeSearchText(record.summaryJa);
    return Object.freeze({
      key: `shiga:${record.id}`,
      datasetId: "project-shiga-sengoku-places" as const,
      regionId: "shiga" as const,
      eraId: "sengoku" as const,
      name: record.nameJa,
      secondaryText: `${categoryLabel}／${record.municipalityJa}／${record.dateDisplayJa}`,
      detailText: `位置精度：${shigaPresentation.coordinateConfidenceLabels[record.coordinateConfidence]}`,
      categoryId: record.category,
      categoryLabel,
      latitude: record.latitude,
      longitude: record.longitude,
      normalizedName, normalizedAlternateName, normalizedCategory, normalizedSecondary, normalizedDescription,
      normalizedSearchText: combinedNormalizedText([record.nameJa, record.nameEn ?? "", categoryLabel, record.municipalityJa, record.dateDisplayJa, record.summaryJa]),
      sourceRecord: Object.freeze({ datasetId: "project-shiga-sengoku-places" as const, record, sourceIndex }),
    });
  }));
}

export const SEARCH_ADAPTERS: Readonly<{
  [Id in SearchablePlaceDatasetId]: (
    value: DatasetValueMap[Id],
  ) => readonly SearchableHistoricalPlace[];
}> = Object.freeze({
  "codh-edo-maps-places": createEdoSearchRecords,
  "project-kyoto-bakumatsu-places": createKyotoSearchRecords,
  "project-shiga-sengoku-places": createShigaSearchRecords,
});
