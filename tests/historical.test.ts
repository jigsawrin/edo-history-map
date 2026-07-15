import { describe, it, expect } from "vitest";
import {
  categoryStyle,
  createHistoricalLayer,
  addHistoricalImageLayer,
} from "../src/historical";
import type { PlaceFeature } from "../src/validate";

function place(overrides: Partial<PlaceFeature> = {}): PlaceFeature {
  return {
    name: "桜田御門",
    category: "施設",
    sheet: "御江戸大名小路絵図",
    entryId: "1-001",
    sourceUrl: null,
    lat: 35.68,
    lon: 139.75,
    ...overrides,
  };
}

describe("categoryStyle", () => {
  it("分類ごとに異なるスタイルを返す(色だけに依存しない: 破線の有無も差別化)", () => {
    const facility = categoryStyle("施設");
    const estate = categoryStyle("屋敷地");
    expect(facility.color).not.toBe(estate.color);
    expect(facility.dashArray).not.toBe(estate.dashArray);
  });

  it("未知の分類にはデフォルトスタイルを返す", () => {
    const unknown = categoryStyle("未知の分類");
    expect(unknown.color).toBeTruthy();
  });
});

describe("createHistoricalLayer", () => {
  it("地点からレイヤーグループを作成できる", () => {
    const layer = createHistoricalLayer([place(), place({ name: "他" })], () => {});
    expect(layer.layer.getLayers()).toHaveLength(2);
  });

  it("透明度を 0〜1 に丸めて適用できる(例外なし)", () => {
    const layer = createHistoricalLayer([place()], () => {});
    expect(() => {
      layer.setOpacity(0.5);
      layer.setOpacity(-1);
      layer.setOpacity(2);
      layer.setOpacity(0);
    }).not.toThrow();
  });
});

describe("addHistoricalImageLayer (古地図画像レイヤー)", () => {
  it("権利確認済み画像が存在しないため常に無効(null)", () => {
    expect(addHistoricalImageLayer()).toBeNull();
  });
});
