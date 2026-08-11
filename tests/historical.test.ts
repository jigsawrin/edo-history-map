import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import L from "leaflet";
import {
  categoryStyle,
  createHistoricalLayer,
  addHistoricalImageLayer,
  HISTORICAL_PANE,
} from "../src/historical";
import { parsePlacesGeoJson, type PlaceFeature } from "../src/validate";
import { createEdoMapSourceHiddenPredicate } from "../src/edo-map-projection";

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
  it("skips an approved hidden source before marker creation and preserves raw identity", () => {
    const first = place({ entryId: "first" });
    const hidden = place({ entryId: "hidden" });
    const onSelect = vi.fn();
    const layer = createHistoricalLayer([first, hidden], onSelect, document.createElement("div"), (index) => index === 1);
    expect(layer.layer.getLayers()).toHaveLength(1);
    (layer.layer.getLayers()[0] as L.CircleMarker).fire("click");
    expect(onSelect).toHaveBeenCalledWith(first);
    expect(onSelect.mock.calls[0]![0]).toBe(first);
    expect(onSelect).not.toHaveBeenCalledWith(hidden);
  });

  it("applies a source-bound production projection before marker and listener creation", () => {
    const first = place({ entryId: "first" });
    const hidden = place({ entryId: "hidden" });
    const projection = {
      schemaVersion: 1,
      sourceDataSha256: "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4",
      sourceFeatureCount: 8788,
      applicableSourceCount: 2,
      visibleMarkerCount: 1,
      overrides: [{ sourceRecordId: "hidden", sourceIndex: 1, featureSha256: "a".repeat(64), hidden: true }],
    };
    const isHidden = createEdoMapSourceHiddenPredicate(projection);
    const onSelect = vi.fn();
    const layer = createHistoricalLayer([first, hidden], onSelect, document.createElement("div"), isHidden);
    expect(layer.layer.getLayers()).toHaveLength(1);
    (layer.layer.getLayers()[0] as L.CircleMarker).fire("click");
    expect(onSelect.mock.calls[0]![0]).toBe(first);
    expect(onSelect).not.toHaveBeenCalledWith(hidden);
  });

  it("keeps 8,788 raw sources while an approved hide yields 8,787 markers", () => {
    const sources = parsePlacesGeoJson(readFileSync(join(__dirname, "../public/data/edo-places.geojson"), "utf8"));
    const hiddenSource = sources[0]!;
    const projection = {
      schemaVersion: 1,
      sourceDataSha256: "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4",
      sourceFeatureCount: 8788,
      applicableSourceCount: 8788,
      visibleMarkerCount: 8787,
      overrides: [{ sourceRecordId: hiddenSource.entryId, sourceIndex: 0, featureSha256: "a".repeat(64), hidden: true }],
    };
    const onSelect = vi.fn();
    const layer = createHistoricalLayer(sources, onSelect, document.createElement("div"), createEdoMapSourceHiddenPredicate(projection, sources));
    expect(sources).toHaveLength(8788);
    expect(layer.layer.getLayers()).toHaveLength(8787);
    const firstVisible = sources[1]!;
    (layer.layer.getLayers()[0] as L.CircleMarker).fire("click");
    expect(onSelect.mock.calls[0]![0]).toBe(firstVisible);
    expect(sources[0]).toBe(hiddenSource);
  }, 30_000);
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
