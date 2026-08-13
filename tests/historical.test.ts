import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import L from "leaflet";
import {
  categoryStyle,
  createHistoricalLayer,
  isSupplementalMarkerPlace,
  SUPPLEMENTAL_MARKER_MIN_ZOOM,
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
    expect(layer.normalLayer.getLayers()).toHaveLength(1);
    (layer.normalLayer.getLayers()[0] as L.CircleMarker).fire("click");
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
    expect(layer.normalLayer.getLayers()).toHaveLength(1);
    (layer.normalLayer.getLayers()[0] as L.CircleMarker).fire("click");
    expect(onSelect.mock.calls[0]![0]).toBe(first);
    expect(onSelect).not.toHaveBeenCalledWith(hidden);
  });

  it("keeps 8,788 raw sources while applying an approved hide before presentation grouping", () => {
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
    expect(layer.presentationMarkerCount).toBe(8234);
    const firstIndividualMarker = layer.normalLayer.getLayers().find((item) => item instanceof L.CircleMarker) as L.CircleMarker;
    firstIndividualMarker.fire("click");
    expect(sources).toContain(onSelect.mock.calls[0]![0]);
    expect(onSelect).not.toHaveBeenCalledWith(hiddenSource);
    expect(sources[0]).toBe(hiddenSource);
  }, 30_000);

  it("presents 528 aggregate markers while leaving all 1,057 supplemental markers unchanged", () => {
    const sources = parsePlacesGeoJson(readFileSync(join(__dirname, "../public/data/edo-places.geojson"), "utf8"));
    const onAggregate = vi.fn();
    const layer = createHistoricalLayer(sources, () => {}, document.createElement("div"), undefined, onAggregate);
    expect(sources).toHaveLength(8788);
    expect(layer.normalMarkerCount).toBe(7177);
    expect(layer.supplementalMarkerCount).toBe(1057);
    expect(layer.aggregateMarkerCount).toBe(528);
    expect(layer.presentationMarkerCount).toBe(8234);
    const firstAggregate = layer.normalLayer.getLayers()[0] as L.Marker;
    expect(firstAggregate.options.title).toBe("桜田御門、原資料2件");
    expect(firstAggregate.options.alt).toBe("桜田御門、原資料2件");
    const markerContent = (firstAggregate.options.icon as L.DivIcon).options.html;
    expect(markerContent).toBeInstanceOf(HTMLElement);
    expect((markerContent as HTMLElement).className).toBe("edo-aggregate-marker");
    expect((markerContent as HTMLElement).textContent).toBe("2");
    expect((markerContent as HTMLElement).getAttribute("aria-hidden")).toBe("true");
    expect((markerContent as HTMLElement).style.getPropertyValue("--edo-marker-color")).toBe("#7b1fa2");
    firstAggregate.fire("click");
    expect(onAggregate).toHaveBeenCalledOnce();
    expect(onAggregate.mock.calls[0]![0].members.map((member: { sourceIndex: number }) => member.sourceIndex)).toEqual([0, 8105]);
  }, 30_000);
  it("地点からレイヤーグループを作成できる", () => {
    const pane = document.createElement("div");
    const layer = createHistoricalLayer(
      [place(), place({ name: "他" })],
      () => {},
      pane,
    );
    expect(layer.normalLayer.getLayers()).toHaveLength(2);
  });

  it("Canvas用paneへ配置してもクリック選択と分類スタイルを維持する", () => {
    const onSelect = vi.fn();
    const layer = createHistoricalLayer(
      [place({ category: "屋敷地" })],
      onSelect,
      document.createElement("div"),
    );
    const marker = layer.normalLayer.getLayers()[0] as L.CircleMarker;
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
    const marker = layer.normalLayer.getLayers()[0] as L.CircleMarker;
    const setStyle = vi.spyOn(marker, "setStyle");

    layer.setOpacity(0.5);
    expect(pane.style.opacity).toBe("0.5");
    expect(setStyle).not.toHaveBeenCalled();
    layer.setOpacity(-1);
    expect(pane.style.opacity).toBe("0");
    layer.setOpacity(2);
    expect(pane.style.opacity).toBe("1");
  });

  it("classifies only the three exact supplemental names", () => {
    expect(isSupplementalMarkerPlace(place({ name: "（辻番）" }))).toBe(true);
    expect(isSupplementalMarkerPlace(place({ name: "（木戸）" }))).toBe(true);
    expect(isSupplementalMarkerPlace(place({ name: "（坂道）" }))).toBe(true);
    expect(isSupplementalMarkerPlace(place({ name: "辻番屋敷" }))).toBe(false);
    expect(isSupplementalMarkerPlace(place({ name: "大木戸" }))).toBe(false);
    expect(isSupplementalMarkerPlace(place({ name: "榎坂" }))).toBe(false);
  });

  it("reuses supplemental markers and changes nested groups only when crossing z16", () => {
    const supplemental = place({ name: "（辻番）", entryId: "supplemental" });
    const layer = createHistoricalLayer([place(), supplemental], () => {}, document.createElement("div"));
    const marker = layer.supplementalLayer.getLayers()[0];
    const addLayer = vi.spyOn(layer.layer, "addLayer");
    const removeLayer = vi.spyOn(layer.layer, "removeLayer");

    layer.syncZoom(15);
    expect(layer.layer.hasLayer(layer.supplementalLayer)).toBe(false);
    expect(addLayer).not.toHaveBeenCalled();
    layer.syncZoom(SUPPLEMENTAL_MARKER_MIN_ZOOM);
    expect(layer.layer.hasLayer(layer.supplementalLayer)).toBe(true);
    expect(layer.supplementalLayer.getLayers()[0]).toBe(marker);
    expect(addLayer).toHaveBeenCalledTimes(1);
    layer.syncZoom(17);
    expect(addLayer).toHaveBeenCalledTimes(1);
    layer.syncZoom(15);
    expect(layer.layer.hasLayer(layer.supplementalLayer)).toBe(false);
    expect(removeLayer).toHaveBeenCalledTimes(1);
  });

  it("shows only the selected supplemental marker below z16 without stale or duplicate layers", () => {
    const first = place({ name: "（辻番）", entryId: "first-supplemental" });
    const second = place({ name: "（木戸）", entryId: "second-supplemental" });
    const layer = createHistoricalLayer([place(), first, second], () => {}, document.createElement("div"));
    const firstMarker = layer.supplementalLayer.getLayers()[0];
    const secondMarker = layer.supplementalLayer.getLayers()[1];

    expect(layer.showTemporarySupplemental(first, 15)).toBe(true);
    expect(layer.temporaryLayer.getLayers()).toEqual([firstMarker]);
    expect(layer.layer.hasLayer(layer.temporaryLayer)).toBe(true);
    expect(layer.showTemporarySupplemental(second, 15)).toBe(true);
    expect(layer.temporaryLayer.getLayers()).toEqual([secondMarker]);
    layer.syncZoom(16);
    expect(layer.layer.hasLayer(layer.temporaryLayer)).toBe(false);
    expect(layer.layer.hasLayer(layer.supplementalLayer)).toBe(true);
    expect(layer.supplementalLayer.getLayers()).toEqual([firstMarker, secondMarker]);
    layer.syncZoom(15);
    expect(layer.layer.hasLayer(layer.supplementalLayer)).toBe(false);
    expect(layer.layer.hasLayer(layer.temporaryLayer)).toBe(true);
    expect(layer.temporaryLayer.getLayers()).toEqual([secondMarker]);
    layer.clearTemporarySupplemental();
    expect(layer.layer.hasLayer(layer.temporaryLayer)).toBe(false);
    expect(layer.temporaryLayer.getLayers()).toHaveLength(0);
  });
});

describe("addHistoricalImageLayer (古地図画像レイヤー)", () => {
  it("権利確認済み画像が存在しないため常に無効(null)", () => {
    expect(addHistoricalImageLayer()).toBeNull();
  });
});
