import { normalizeSearchText } from "./normalize";
import type {
  SearchableHistoricalPlace,
  SearchResultPage,
} from "./types";

export const SEARCH_RESULTS_PER_PAGE = 50;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rank(place: SearchableHistoricalPlace, query: string): number {
  if (
    place.normalizedName === query ||
    place.normalizedAlternateName === query
  ) return 0;
  if (
    place.normalizedName.startsWith(query) ||
    place.normalizedAlternateName.startsWith(query)
  ) return 1;
  if (
    place.normalizedName.includes(query) ||
    place.normalizedAlternateName.includes(query)
  ) return 2;
  if (place.normalizedCategory.includes(query)) return 3;
  if (place.normalizedSecondary.includes(query)) return 4;
  if (place.normalizedDescription.includes(query)) return 5;
  return -1;
}

function stablePlaceOrder(
  left: SearchableHistoricalPlace,
  right: SearchableHistoricalPlace,
): number {
  return (
    compareCodeUnits(left.normalizedName, right.normalizedName) ||
    compareCodeUnits(left.key, right.key) ||
    left.sourceRecord.sourceIndex - right.sourceRecord.sourceIndex
  );
}

export function searchHistoricalPlaces(
  records: readonly SearchableHistoricalPlace[],
  input: string,
  categoryId = "",
): readonly SearchableHistoricalPlace[] {
  const query = normalizeSearchText(input);
  const ranked: { place: SearchableHistoricalPlace; rank: number }[] = [];
  for (const place of records) {
    if (categoryId && place.categoryId !== categoryId) continue;
    const placeRank = query ? rank(place, query) : 0;
    if (placeRank >= 0) ranked.push({ place, rank: placeRank });
  }
  ranked.sort(
    (left, right) =>
      left.rank - right.rank || stablePlaceOrder(left.place, right.place),
  );
  return ranked.map(({ place }) => place);
}

export function paginateSearchResults(
  matches: readonly SearchableHistoricalPlace[],
  requestedPage: number,
  perPage = SEARCH_RESULTS_PER_PAGE,
): SearchResultPage {
  const pageCount = Math.ceil(matches.length / perPage);
  const page = pageCount === 0
    ? 1
    : Math.min(pageCount, Math.max(1, Math.trunc(requestedPage) || 1));
  const start = (page - 1) * perPage;
  return Object.freeze({
    matches,
    items: Object.freeze(matches.slice(start, start + perPage)),
    page,
    pageCount,
    totalCount: matches.length,
  });
}
