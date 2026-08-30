import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import L from "leaflet";
import { addHistoricalImageLayer, categoryStyle, createHistoricalLayer, HISTORICAL_PANE, isMaximumDetailPlace } from "../src/historical";
import { createEdoMapSourceHiddenPredicate } from "../src/edo-map-projection";
import { parsePlacesGeoJson, type PlaceFeature } from "../src/validate";

function place(overrides: Partial<PlaceFeature> = {}): PlaceFeature {
  return { name: "桜田御門", category: "施設", sheet: "御江戸大名小路絵図", entryId: "1-001", sourceUrl: null, lat: 35.68, lon: 139.75, ...overrides };
}

function navigationMap() {
  return {
    project: (latlng: L.LatLngExpression, zoom: number) => L.CRS.EPSG3857.latLngToPoint(L.latLng(latlng), zoom),
    unproject: (point: L.PointExpression, zoom: number) => L.CRS.EPSG3857.pointToLatLng(L.point(point), zoom),
    getPixelBounds: () => L.bounds([-1e9, -1e9], [1e9, 1e9]),
    setView: vi.fn(),
  };
}

function fixedTokyoBounds(map: ReturnType<typeof navigationMap>, zoom: number): L.Bounds {
  const center = map.project([35.685, 139.755], zoom);
  return L.bounds([center.x - 632.5, center.y - 348], [center.x + 632.5, center.y + 348]);
}

describe("categoryStyle", () => {
  it("分類ごとに色と線種を変える", () => {
    expect(categoryStyle("施設")).not.toEqual(categoryStyle("屋敷地"));
    expect(categoryStyle("未知の分類").color).toBeTruthy();
  });
});

describe("createHistoricalLayer", () => {
  it("approved hidden sources are removed before marker creation", () => {
    const first = place({ entryId: "first" });
    const hidden = place({ entryId: "hidden" });
    const onSelect = vi.fn();
    const layer = createHistoricalLayer([first, hidden], onSelect, document.createElement("div"), (index) => index === 1);
    expect(layer.presentationMarkerCount).toBe(1);
    (layer.normalLayer.getLayers()[0] as L.CircleMarker).fire("click");
    expect(onSelect).toHaveBeenCalledWith(first, 0);
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
    const onSelect = vi.fn();
    const layer = createHistoricalLayer(
      [first, hidden], onSelect, document.createElement("div"), createEdoMapSourceHiddenPredicate(projection),
    );
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
    const layer = createHistoricalLayer(
      sources, onSelect, document.createElement("div"), createEdoMapSourceHiddenPredicate(projection, sources),
    );
    expect(sources).toHaveLength(8788);
    expect(layer.presentationMarkerCount).toBe(8234);
    for (const marker of layer.normalLayer.getLayers()) {
      (marker as L.Layer).fire("click");
      if (onSelect.mock.calls.length > 0) break;
    }
    expect(sources).toContain(onSelect.mock.calls[0]![0]);
    expect(onSelect).not.toHaveBeenCalledWith(hiddenSource);
    expect(sources[0]).toBe(hiddenSource);
  }, 30_000);

  it("shows no Edo presentation markers at z5-z11", () => {
    const map = navigationMap();
    const layer = createHistoricalLayer([place()], () => {}, document.createElement("div"), undefined, undefined, undefined, map);
    for (let zoom = 5; zoom <= 11; zoom += 1) {
      layer.syncView(zoom, map.getPixelBounds());
      expect(layer.progressiveLayer.getLayers()).toHaveLength(0);
      expect(layer.layer.hasLayer(layer.progressiveLayer)).toBe(false);
    }
  });

  it("reveals bracketed labels only at maximum zoom", () => {
    const map = navigationMap();
    const bracketed = place({ name: "（木戸）" });
    const layer = createHistoricalLayer([bracketed], () => {}, document.createElement("div"), undefined, undefined, undefined, map);
    layer.syncView(17, map.getPixelBounds());
    expect(layer.progressiveLayer.getLayers()).toHaveLength(0);
    layer.syncView(18, map.getPixelBounds());
    expect(layer.progressiveLayer.getLayers()).toHaveLength(1);
    expect(layer.progressiveMarkerCounts.get(17)?.bracketed).toBe(0);
    expect(layer.progressiveMarkerCounts.get(18)?.bracketed).toBe(1);
  });

  it("temporarily shows a searched bracketed source below maximum zoom and cleans it at normal visibility", () => {
    const map = navigationMap();
    const bracketed = place({ name: "（木戸）" });
    const layer = createHistoricalLayer([bracketed], () => {}, document.createElement("div"), undefined, undefined, undefined, map);
    layer.syncView(15, map.getPixelBounds());
    expect(layer.showTemporaryPlace(bracketed, 15)).toBe(true);
    const temporary = layer.temporaryLayer.getLayers()[0];
    expect(temporary).not.toBe(layer.maximumDetailLayer.getLayers()[0]);
    layer.syncView(18, map.getPixelBounds());
    expect(layer.temporaryLayer.getLayers()).toHaveLength(0);
    expect(layer.progressiveLayer.getLayers()).toHaveLength(1);
  });

  it("replaces repeated temporary selections without stale or duplicate layers", () => {
    const first = place({ name: "（辻番）", entryId: "first-temporary" });
    const second = place({ name: "（木戸）", entryId: "second-temporary", lat: 35.69 });
    const layer = createHistoricalLayer([first, second], () => {}, document.createElement("div"));
    expect(layer.showTemporaryPlace(first, 15)).toBe(true);
    const firstMarker = layer.temporaryLayer.getLayers()[0];
    expect(layer.showTemporaryPlace(second, 15)).toBe(true);
    expect(layer.temporaryLayer.getLayers()).toHaveLength(1);
    expect(layer.temporaryLayer.getLayers()[0]).not.toBe(firstMarker);
    expect(layer.layer.hasLayer(layer.temporaryLayer)).toBe(true);
    expect(layer.showTemporaryPlace(second, 15)).toBe(true);
    expect(layer.temporaryLayer.getLayers()).toHaveLength(1);
  });

  it("clears the temporary selection layer explicitly", () => {
    const temporary = place({ name: "（木戸）" });
    const layer = createHistoricalLayer([temporary], () => {}, document.createElement("div"));
    expect(layer.showTemporaryPlace(temporary, 15)).toBe(true);
    layer.clearTemporaryPlace();
    expect(layer.layer.hasLayer(layer.temporaryLayer)).toBe(false);
    expect(layer.temporaryLayer.getLayers()).toHaveLength(0);
  });

  it("keeps same-name ungrouped records as separate markers at maximum zoom", () => {
    const map = navigationMap();
    const first = place({ entryId: "first", lat: 35.68, lon: 139.75 });
    const second = place({ entryId: "second", lat: 35.69, lon: 139.76 });
    const layer = createHistoricalLayer([first, second], () => {}, document.createElement("div"), undefined, undefined, undefined, map);
    layer.syncView(18, map.getPixelBounds());
    expect(layer.presentationMarkerCount).toBe(2);
    expect(layer.progressiveLayer.getLayers()).toHaveLength(2);
  });

  it("preserves established aggregates as one ordinary marker even at maximum zoom", () => {
    const sources = parsePlacesGeoJson(readFileSync(join(__dirname, "../public/data/edo-places.geojson"), "utf8"));
    const map = navigationMap();
    const onAggregate = vi.fn();
    const layer = createHistoricalLayer(sources, () => {}, document.createElement("div"), undefined, onAggregate, undefined, map);
    expect(layer.aggregateMarkerCount).toBe(528);
    expect(layer.presentationMarkerCount).toBe(8234);
    expect(layer.normalMarkerCount).toBe(7095);
    expect(layer.maximumDetailMarkerCount).toBe(1139);
    const firstAggregate = layer.normalLayer.getLayers()[0];
    expect(firstAggregate).toBeInstanceOf(L.CircleMarker);
    (firstAggregate as L.CircleMarker).fire("click");
    expect(onAggregate.mock.calls[0]![0].members.map((member: { sourceIndex: number }) => member.sourceIndex)).toEqual([0, 8105]);
    layer.syncView(18, map.getPixelBounds());
    expect(layer.progressiveLayer.getLayers()).toHaveLength(8234);
  }, 30_000);

  it("keeps aggregate member raw identity available through a temporary search marker", () => {
    const sources = parsePlacesGeoJson(readFileSync(join(__dirname, "../public/data/edo-places.geojson"), "utf8"));
    const map = navigationMap();
    const layer = createHistoricalLayer(sources, () => {}, document.createElement("div"), undefined, undefined, undefined, map);
    const member = sources[8105]!;
    layer.syncView(11, map.getPixelBounds());
    expect(layer.showTemporaryPlace(member, 11)).toBe(true);
    const temporary = layer.temporaryLayer.getLayers()[0] as L.CircleMarker;
    expect(temporary.getLatLng()).toEqual(L.latLng(member.lat, member.lon));
  }, 30_000);

  it("measures the fixed Tokyo viewport without count markers", () => {
    const sources = parsePlacesGeoJson(readFileSync(join(__dirname, "../public/data/edo-places.geojson"), "utf8"));
    const map = navigationMap();
    const layer = createHistoricalLayer(sources, () => {}, document.createElement("div"), undefined, undefined, undefined, map);
    for (const zoom of [11, 12, 13, 14, 15, 16, 17, 18]) layer.syncView(zoom, fixedTokyoBounds(map, zoom));
    expect(layer.progressiveMarkerCounts.get(11)).toEqual({ eligible: 0, visible: 0, aggregates: 0, bracketed: 0 });
    for (const zoom of [12, 13, 14, 15, 16, 17]) expect(layer.progressiveMarkerCounts.get(zoom)?.bracketed).toBe(0);
    expect(layer.progressiveMarkerCounts.get(18)!.bracketed).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify([...layer.progressiveMarkerCounts])).not.toMatch(/hiddenSourceCount|\+N/u);
  }, 30_000);

  it("keeps click behavior, category style, and pane placement", () => {
    const onSelect = vi.fn();
    const layer = createHistoricalLayer([place({ category: "屋敷地" })], onSelect, document.createElement("div"));
    const marker = layer.normalLayer.getLayers()[0] as L.CircleMarker;
    expect(marker.options.pane).toBe(HISTORICAL_PANE);
    expect(marker.options.color).toBe(categoryStyle("屋敷地").color);
    marker.fire("click");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("applies opacity once to the historical pane", () => {
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

  it("classifies all full-width bracketed labels as maximum detail", () => {
    expect(isMaximumDetailPlace(place({ name: "（石碑）" }))).toBe(true);
    expect(isMaximumDetailPlace(place({ name: "大木戸" }))).toBe(false);
  });
});

describe("addHistoricalImageLayer", () => {
  it("returns null when no rights-approved raster exists", () => {
    expect(addHistoricalImageLayer()).toBeNull();
  });
});
