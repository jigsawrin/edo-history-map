import { describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { CoastlineTransitionLayer } from "../src/coastline-layer";
import type { CoastlineCollection } from "../src/coastlines";
import { defaultCoastlineVisibilityForView, shouldShowCoastline } from "../src/coastline-visibility";
import { MAP_PANES, PANE_Z_INDEX } from "../src/leaflet-layers";

const DATA: CoastlineCollection = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[139.7, 35.6], [139.8, 35.7]] },
    properties: { id: "edo-coastline-0001", sourceRecordNumber: 1, sourceObjectId: "1929", category: "coastline", eraId: "edo-late", positionConfidence: "estimated", sourceId: "codh-edo-coastline" },
  }],
};

function makeLayer() {
  const pane = document.createElement("div");
  const map = { hasLayer: vi.fn(() => false), removeLayer: vi.fn() } as unknown as L.Map;
  return { pane, layer: new CoastlineTransitionLayer(map, DATA, pane) };
}

describe("江戸末期海岸線Leafletレイヤー", () => {
  it("専用paneのCanvasへ非interactiveで配置し、町家・地名・現在地より下に置く", () => {
    const { layer } = makeLayer();
    const line = layer.layer.getLayers()[0] as L.Polyline;
    expect(line.options.pane).toBe(MAP_PANES.historicalWaterLine);
    expect(line.options.interactive).toBe(false);
    expect(line.options.bubblingMouseEvents).toBe(false);
    expect(line.options.renderer).toBeInstanceOf(L.Canvas);
    expect(PANE_Z_INDEX[MAP_PANES.historicalWaterLine]).toBeLessThan(PANE_Z_INDEX[MAP_PANES.historicalArea] ?? 0);
    expect(PANE_Z_INDEX[MAP_PANES.historicalWaterLine]).toBeLessThan(PANE_Z_INDEX[MAP_PANES.historicalPoints] ?? 0);
    expect(PANE_Z_INDEX[MAP_PANES.historicalWaterLine]).toBeLessThan(PANE_Z_INDEX[MAP_PANES.currentLocation] ?? 0);
  });

  it("海岸線の利用者不透明度を専用paneだけへ合成する", () => {
    const { pane, layer } = makeLayer();
    layer.setUserOpacity(0.8);
    layer.setOpacity(0.5);
    expect(pane.style.opacity).toBe("0.4");
    layer.setTransition(0);
    expect(pane.style.transition).toBe("none");
  });

  it("現代では非表示、歴史・比較モードは既定ON、pointsは既定OFFにする", () => {
    expect(defaultCoastlineVisibilityForView("reconstructed")).toBe(true);
    expect(defaultCoastlineVisibilityForView("historical-map")).toBe(true);
    expect(defaultCoastlineVisibilityForView("compare")).toBe(true);
    expect(defaultCoastlineVisibilityForView("points")).toBe(false);
    expect(shouldShowCoastline({ isHistorical: false, layerAvailable: true, registryEnabled: true, selected: true })).toBe(false);
    expect(shouldShowCoastline({ isHistorical: true, layerAvailable: true, registryEnabled: true, selected: true })).toBe(true);
  });
});
