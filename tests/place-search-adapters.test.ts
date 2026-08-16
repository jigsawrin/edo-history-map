import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEdoSearchRecords,
  createKyotoSearchRecords,
  createShigaSearchRecords,
  KYOTO_CATEGORY_LABELS,
  SEARCH_ADAPTERS,
} from "../src/place-search/adapters";
import { parsePlacesGeoJson } from "../src/validate";
import { parseKyotoBakumatsuGeoJson } from "../src/kyoto-bakumatsu-places";
import { parseShigaSengokuGeoJson } from "../src/shiga-sengoku-places";
import { searchHistoricalPlaces } from "../src/place-search/query";

const root = join(__dirname, "..");

describe("地域別地点検索アダプター", () => {
  it("EDO 8,788件を実在フィールドと座標を保って変換する", () => {
    const source = parsePlacesGeoJson(
      readFileSync(join(root, "public/data/edo-places.geojson"), "utf8"),
    );
    const before = JSON.stringify(source[0]);
    const records = createEdoSearchRecords(source);
    expect(records).toHaveLength(8788);
    expect(records[0]?.name).toBe(source[0]?.name);
    expect(records[0]?.secondaryText).toContain(source[0]?.category);
    expect(records[0]?.secondaryText).toContain(source[0]?.sheet);
    expect(records[0]?.latitude).toBe(source[0]?.lat);
    expect(records[0]?.longitude).toBe(source[0]?.lon);
    expect(new Set(records.map((record) => record.key)).size).toBe(8788);
    expect(JSON.stringify(source[0])).toBe(before);
  }, 60_000);

  it("approved本文を増上寺・浅草寺・日本橋のexact recordだけへ追加し別recordへ波及しない", () => {
    const source = parsePlacesGeoJson(
      readFileSync(join(root, "public/data/edo-places.geojson"), "utf8"),
    );
    const records = createEdoSearchRecords(source);
    const zojoji = records[7346];
    expect(source[7346]?.entryId).toBe("4-349");
    for (const query of ["徳川将軍家", "浄土宗", "五重塔"]) {
      const hits = searchHistoricalPlaces(records, query);
      expect(hits.some((hit) => hit.sourceRecord.sourceIndex === 7346)).toBe(true);
    }
    expect(zojoji?.normalizedSearchText).not.toContain("rightsBasisNote");
    expect(zojoji?.normalizedSearchText).not.toContain("reviewNote");
    expect(source[4847]?.entryId).toBe("21-497");
    for (const query of ["浅草観音", "観音霊地", "仲見世"]) {
      const hits = searchHistoricalPlaces(records, query);
      expect(hits.some((hit) => hit.sourceRecord.sourceIndex === 4847)).toBe(true);
    }
    expect(source[3652]?.entryId).toBe("2-159");
    for (const query of ["五街道", "一里塚", "魚河岸"]) {
      const hits = searchHistoricalPlaces(records, query);
      expect(hits.some((hit) => hit.sourceRecord.sourceIndex === 3652)).toBe(true);
      expect(hits.some((hit) => hit.sourceRecord.sourceIndex === 6727)).toBe(false);
    }
    expect(source[6727]?.entryId).toBe("3-263");
    expect(records[6727]?.normalizedDescription).toBe("");
    expect(records.filter((record) => record.normalizedDescription.length > 0)).toHaveLength(3);
  }, 60_000);

  it("京都36件を英語名・カテゴリ・年月・要約検索付きで変換する", () => {
    const source = parseKyotoBakumatsuGeoJson(
      readFileSync(
        join(root, "public/data/kyoto-bakumatsu-places.geojson"),
        "utf8",
      ),
    );
    const before = JSON.stringify(source[0]);
    const records = createKyotoSearchRecords(source);
    expect(records).toHaveLength(36);
    expect(records[0]?.secondaryText).toContain(source[0]?.dateDisplayJa);
    expect(records[0]?.categoryLabel).toBe(
      KYOTO_CATEGORY_LABELS[source[0]!.category],
    );
    expect(records[0]?.detailText).toMatch(/位置精度：[高中]/);
    expect(records[0]?.latitude).toBe(source[0]?.latitude);
    expect(records[0]?.longitude).toBe(source[0]?.longitude);
    expect(JSON.stringify(source[0])).toBe(before);
  });

  it("固定許可リストには地点3データセットだけを含む", () => {
    expect(Object.keys(SEARCH_ADAPTERS)).toEqual([
      "codh-edo-maps-places",
      "project-kyoto-bakumatsu-places",
      "project-shiga-sengoku-places",
    ]);
    expect(Object.keys(SEARCH_ADAPTERS)).not.toContain("codh-edo-machiya-areas");
    expect(Object.keys(SEARCH_ADAPTERS)).not.toContain("codh-edo-coastline");
  });

  it("滋賀36件を市町・カテゴリ・時期・要約検索付きで変換する", () => {
    const source = parseShigaSengokuGeoJson(readFileSync(join(root, "public/data/shiga-sengoku-places.geojson"), "utf8"));
    const records = createShigaSearchRecords(source);
    expect(records).toHaveLength(36);
    expect(records[0]?.regionId).toBe("shiga");
    expect(records[0]?.eraId).toBe("sengoku");
    expect(records[0]?.secondaryText).toContain(source[0]?.municipalityJa);
    expect(records[0]?.normalizedSearchText).toContain(source[0]?.municipalityJa);
  });
});
