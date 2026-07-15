import { describe, it, expect, vi } from "vitest";
import L from "leaflet";
import {
  categoryStyle,
  createHistoricalLayer,
  addHistoricalImageLayer,
  HISTORICAL_PANE,
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
    const pane = document.createElement("div");
    const layer = createHistoricalLayer(
      [place(), place({ name: "他" })],
      () => {},
      pane,
    );
    expect(layer.layer.getLayers()).toHaveLength(2);
  });

  it("Canvas用paneへ配置してもクリック選択と分類スタイルを維持する", () => {
    const onSelect = vi.fn();
    const layer = createHistoricalLayer(
      [place({ category: "屋敷地" })],
      onSelect,
      document.createElement("div"),
    );
    const marker = layer.layer.getLayers()[0] as L.CircleMarker;
    expect(marker.options.pane).toBe(HISTORICAL_PANE);
    expect(marker.options.interactive).toBe(true);
    expect(marker.options.bubblingMouseEvents).toBe(false);
    expect(marker.options.color).toBe(categoryStyle("屋敷地").color);
    expect(marker.options.dashArray).toBe(categoryStyle("屋敷地").dashArray);
    marker.fire("click");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("透明度は全markerのsetStyleを呼ばずpaneへ1回で適用する", () => {
    const pane = document.createElement("div");
    const layer = createHistoricalLayer([place()], () => {}, pane);
    const marker = layer.layer.getLayers()[0] as L.CircleMarker;
    const setStyle = vi.spyOn(marker, "setStyle");

    layer.setOpacity(0.5);
    expect(pane.style.opacity).toBe("0.5");
    expect(setStyle).not.toHaveBeenCalled();
    layer.setOpacity(-1);
    expect(pane.style.opacity).toBe("0");
    layer.setOpacity(2);
    expect(pane.style.opacity).toBe("1");
  });
});

describe("addHistoricalImageLayer (古地図画像レイヤー)", () => {
  it("権利確認済み画像が存在しないため常に無効(null)", () => {
    expect(addHistoricalImageLayer()).toBeNull();
  });
});
