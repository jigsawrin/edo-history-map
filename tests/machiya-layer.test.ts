import { describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { MachiyaAreaTransitionLayer } from "../src/machiya-layer";
import { MAP_PANES, PANE_Z_INDEX } from "../src/leaflet-layers";
import type { MachiyaAreaCollection } from "../src/machiya-areas";
import {
  defaultMachiyaVisibilityForView,
  shouldShowMachiyaArea,
} from "../src/machiya-visibility";

const DATA: MachiyaAreaCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [139.7, 35.68],
            [139.71, 35.68],
            [139.71, 35.69],
            [139.7, 35.68],
          ],
        ],
      },
      properties: {
        id: "machiya-01",
        sourceSheetId: "1",
        sourceSheetName: "自作fixture",
        category: "machiya-area",
        eraId: "edo-late",
        positionConfidence: "estimated",
        sourceId: "codh-edo-machiya-areas",
      },
    },
  ],
};

describe("町家領域Leafletレイヤー", () => {
  it("historical-area-paneのCanvasへ非interactiveで配置する", () => {
    const pane = document.createElement("div");
    const map = {
      hasLayer: vi.fn(() => false),
      removeLayer: vi.fn(),
    } as unknown as L.Map;
    const layer = new MachiyaAreaTransitionLayer(map, DATA, pane);
    const polygon = layer.layer.getLayers()[0] as L.Polygon;
    expect(polygon.options.pane).toBe(MAP_PANES.historicalArea);
    expect(polygon.options.interactive).toBe(false);
    expect(polygon.options.bubblingMouseEvents).toBe(false);
    expect(polygon.options.renderer).toBeInstanceOf(L.Canvas);
    expect(PANE_Z_INDEX[MAP_PANES.historicalArea]).toBeLessThan(
      PANE_Z_INDEX[MAP_PANES.historicalPoints] ?? 0,
    );
    expect(PANE_Z_INDEX[MAP_PANES.historicalArea]).toBeLessThan(
      PANE_Z_INDEX[MAP_PANES.currentLocation] ?? 0,
    );
  });

  it("利用者不透明度とクロスフェード不透明度を合成する", () => {
    const pane = document.createElement("div");
    const map = {
      hasLayer: vi.fn(() => false),
      removeLayer: vi.fn(),
    } as unknown as L.Map;
    const layer = new MachiyaAreaTransitionLayer(map, DATA, pane);
    layer.setUserOpacity(0.4);
    layer.setOpacity(0.5);
    expect(pane.style.opacity).toBe("0.2");
    layer.setTransition(0);
    expect(pane.style.transition).toBe("none");
  });

  it("現代では非表示、歴史3モードでは既定ON、pointsモードでは既定OFFにする", () => {
    expect(defaultMachiyaVisibilityForView("reconstructed")).toBe(true);
    expect(defaultMachiyaVisibilityForView("historical-map")).toBe(true);
    expect(defaultMachiyaVisibilityForView("compare")).toBe(true);
    expect(defaultMachiyaVisibilityForView("points")).toBe(false);
    expect(
      shouldShowMachiyaArea({
        isHistorical: false,
        layerAvailable: true,
        registryEnabled: true,
        selected: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMachiyaArea({
        isHistorical: true,
        layerAvailable: true,
        registryEnabled: true,
        selected: true,
      }),
    ).toBe(true);
    expect(
      shouldShowMachiyaArea({
        isHistorical: true,
        layerAvailable: true,
        registryEnabled: true,
        selected: false,
      }),
    ).toBe(false);
  });
});
