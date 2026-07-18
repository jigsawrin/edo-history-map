import { describe, expect, it } from "vitest";
import { historicalThemeRegistry } from "../src/historical-theme-registry";
import { searchHistoricalThemes } from "../src/historical-theme-search";

describe("歴史テーマ検索", () => {
  it("日本語タイトルと英字別名を既存正規化で検索する", () => {
    expect(searchHistoricalThemes(historicalThemeRegistry, "坂本龍馬")[0]?.id).toBe("person-sakamoto-ryoma");
    expect(searchHistoricalThemes(historicalThemeRegistry, "RYOMA")[0]?.id).toBe("person-sakamoto-ryoma");
  });

  it("種別で絞り込み、空入力は日本語タイトル順で返す", () => {
    const people = searchHistoricalThemes(historicalThemeRegistry, "", "person");
    expect(people).toHaveLength(10);
    expect(people.every((theme) => theme.type === "person")).toBe(true);
    expect(people.map((theme) => theme.titleJa)).toEqual([...people.map((theme) => theme.titleJa)].sort());
  });

  it("正規表現風入力を文字列として安全に扱う", () => {
    expect(() => searchHistoricalThemes(historicalThemeRegistry, ".*[<script>")).not.toThrow();
    expect(searchHistoricalThemes(historicalThemeRegistry, ".*[<script>")).toHaveLength(0);
  });
});
