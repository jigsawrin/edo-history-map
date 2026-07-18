import { describe, expect, it } from "vitest";
import { HISTORICAL_RASTER_UI_TEXT, TAITO_DAIMYO_KOJI_LOCALIZATION, resolveLocalizedText, validateLocalizedText } from "../src/historical-raster-localization";

describe("古地図固定ローカライズ", () => {
  it("日本語を正本として8件の日英文言と対象地図5件を固定する", () => {
    expect(Object.keys(HISTORICAL_RASTER_UI_TEXT)).toHaveLength(8);
    expect(Object.values(HISTORICAL_RASTER_UI_TEXT).every((value) => value.ja && value.en)).toBe(true);
    expect(Object.keys(TAITO_DAIMYO_KOJI_LOCALIZATION)).toHaveLength(5);
    expect(resolveLocalizedText(HISTORICAL_RASTER_UI_TEXT.historicalMap, "ja")).toBe("古地図");
    expect(resolveLocalizedText(HISTORICAL_RASTER_UI_TEXT.historicalMap, "en")).toBe("Historical map");
  });
  it("英訳未登録時は日本語へfallbackし、空・control文字・HTMLを拒否する", () => {
    expect(resolveLocalizedText({ ja: "日本語" }, "en")).toBe("日本語");
    for (const value of [{ ja: "" }, { ja: "日本語", en: "" }, { ja: "<b>地図</b>" }, { ja: "地図\u0000" }]) expect(() => validateLocalizedText(value)).toThrow();
  });
});
