import { describe, expect, it } from "vitest";
import {
  historicalThemeById,
  historicalThemeRegistry,
  parseHistoricalThemes,
  themesForPlace,
} from "../src/historical-theme-registry";

describe("歴史テーマレジストリ", () => {
  it("21テーマ、87関係、5地域横断を決定的順序で保持する", () => {
    expect(historicalThemeRegistry).toHaveLength(21);
    expect(historicalThemeRegistry.flatMap((theme) => theme.relatedPlaces)).toHaveLength(87);
    expect(historicalThemeRegistry.filter((theme) => new Set(theme.relatedPlaces.map((place) => place.datasetId)).size > 1)).toHaveLength(5);
    expect(historicalThemeRegistry.map((theme) => theme.id)).toEqual(
      [...historicalThemeRegistry.map((theme) => theme.id)].sort(),
    );
  });

  it("人物10、事件3、勢力3、概念5で、江戸データとの関係を持たない", () => {
    expect(Object.fromEntries(["person", "event", "group", "concept"].map((type) => [
      type,
      historicalThemeRegistry.filter((theme) => theme.type === type).length,
    ]))).toEqual({ person: 10, event: 3, group: 3, concept: 5 });
    expect(historicalThemeRegistry.flatMap((theme) => theme.relatedPlaces).every(
      (place) => place.datasetId !== ("codh-edo-maps-places" as string),
    )).toBe(true);
  });

  it("テーマID検索と地点からの逆引きを行う", () => {
    expect(historicalThemeById("person-sakamoto-ryoma")?.titleJa).toBe("坂本龍馬");
    expect(themesForPlace("project-kyoto-bakumatsu-places", "hu040").map((theme) => theme.id)).toContain("person-sakamoto-ryoma");
  });

  it.each([
    ["存在しない地点", (data: Record<string, unknown>[]) => {
      const theme = data[0] as { relatedPlaces: Array<Record<string, unknown>> };
      theme.relatedPlaces[0]!.placeId = "missing-place";
    }],
    ["地点に属さない出典", (data: Record<string, unknown>[]) => {
      const theme = data[0] as { relatedPlaces: Array<Record<string, unknown>> };
      theme.relatedPlaces[0]!.sourceIds = ["shiga-gsi-map-search"];
    }],
    ["HTML文字列", (data: Record<string, unknown>[]) => { data[0]!.summaryJa = "<script>alert(1)</script>"; }],
  ])("%sを拒否する", (_label, mutate) => {
    const data = structuredClone(historicalThemeRegistry) as unknown as Record<string, unknown>[];
    mutate(data);
    expect(() => parseHistoricalThemes(data)).toThrow();
  });
});
