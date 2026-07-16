import { describe, expect, it } from "vitest";
import {
  paginateSearchResults,
  SEARCH_RESULTS_PER_PAGE,
  searchHistoricalPlaces,
} from "../src/place-search/query";
import { normalizeSearchText } from "../src/place-search/normalize";
import type { SearchableHistoricalPlace } from "../src/place-search/types";
import type { PlaceFeature } from "../src/validate";

function place(
  name: string,
  overrides: Partial<SearchableHistoricalPlace> = {},
): SearchableHistoricalPlace {
  const record: PlaceFeature = {
    name,
    category: "施設",
    sheet: "切絵図",
    entryId: name,
    sourceUrl: null,
    lat: 35,
    lon: 139,
  };
  return {
    key: `edo:${name}`,
    datasetId: "codh-edo-maps-places",
    regionId: "edo",
    eraId: "edo-late",
    name,
    secondaryText: "施設／切絵図",
    detailText: "",
    categoryId: "施設",
    categoryLabel: "施設",
    latitude: 35,
    longitude: 139,
    normalizedName: normalizeSearchText(name),
    normalizedAlternateName: "",
    normalizedCategory: "施設",
    normalizedSecondary: "切絵図",
    normalizedDescription: "説明",
    normalizedSearchText: normalizeSearchText(`${name} 施設 切絵図 説明`),
    sourceRecord: {
      datasetId: "codh-edo-maps-places",
      record,
      sourceIndex: 0,
    },
    ...overrides,
  };
}

describe("地点検索と順位", () => {
  it("完全一致、前方一致、名前部分一致の順に返す", () => {
    const records = [place("東池田屋"), place("池田屋跡"), place("池田屋")];
    expect(searchHistoricalPlaces(records, "池田屋").map((item) => item.name)).toEqual([
      "池田屋",
      "池田屋跡",
      "東池田屋",
    ]);
  });

  it("名前、分類、補助情報、説明の順に返す", () => {
    const records = [
      place("説明一致", { normalizedDescription: "対象" }),
      place("補助一致", { normalizedSecondary: "対象" }),
      place("分類一致", { normalizedCategory: "対象" }),
      place("対象地点"),
    ];
    expect(searchHistoricalPlaces(records, "対象").map((item) => item.name)).toEqual([
      "対象地点",
      "分類一致",
      "補助一致",
      "説明一致",
    ]);
  });

  it("英語別名も地点名順位で検索する", () => {
    const record = place("池田屋", { normalizedAlternateName: "ikedaya" });
    expect(searchHistoricalPlaces([record], "IKEDAYA")).toEqual([record]);
  });

  it("空検索で全件を決定的な名前順に返す", () => {
    expect(searchHistoricalPlaces([place("い"), place("あ")], "").map((p) => p.name)).toEqual([
      "あ",
      "い",
    ]);
  });

  it("カテゴリで絞り込み、空結果も返す", () => {
    const records = [place("寺", { categoryId: "寺社" })];
    expect(searchHistoricalPlaces(records, "", "寺社")).toHaveLength(1);
    expect(searchHistoricalPlaces(records, "", "施設")).toHaveLength(0);
  });

  it("Unicode・HTML風・正規表現記号を安全な部分一致として扱う", () => {
    const records = [place("<寺.*[社]>")];
    expect(searchHistoricalPlaces(records, ".*[")).toHaveLength(1);
  });
});

describe("地点検索のページ分割", () => {
  it.each([
    [0, 0, 0],
    [1, 1, 1],
    [49, 49, 1],
    [50, 50, 1],
    [51, 50, 2],
    [8788, 50, 176],
  ])("%i件を最大50件で分割する", (count, firstLength, pageCount) => {
    const records = Array.from({ length: count }, (_, index) => place(String(index)));
    const page = paginateSearchResults(records, 1);
    expect(page.items).toHaveLength(firstLength);
    expect(page.pageCount).toBe(pageCount);
    expect(page.items.length).toBeLessThanOrEqual(SEARCH_RESULTS_PER_PAGE);
  });

  it("最終ページを正しく返す", () => {
    const records = Array.from({ length: 51 }, (_, index) => place(String(index)));
    const page = paginateSearchResults(records, 2);
    expect(page.items).toHaveLength(1);
    expect(page.page).toBe(2);
  });

  it("範囲外ページを安全に丸める", () => {
    const records = [place("a")];
    expect(paginateSearchResults(records, -5).page).toBe(1);
    expect(paginateSearchResults(records, 500).page).toBe(1);
  });
});
