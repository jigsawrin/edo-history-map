import { describe, expect, it, vi } from "vitest";
import {
  fitHistoricalRasterExtent,
  historicalRasterControlState,
  historicalRasterViewportStatus,
} from "../src/historical-raster-ui";
import { rasterDefinition } from "./fixtures/historical-raster-definition";

describe("古地図の複数シートUI状態", () => {
  const first = rasterDefinition({ id: "project-sheet-a", priority: 10 });
  const second = rasterDefinition({ id: "project-sheet-b", priority: 20 });

  it("approvedラスタ0件では操作を一切表示しない", () => {
    expect(historicalRasterControlState([], "", undefined)).toEqual({
      showControls: false,
      showSheetSelect: false,
      selected: null,
    });
  });

  it("1件では操作を表示しシートselectを隠す", () => {
    expect(historicalRasterControlState([first], "", first.id)).toMatchObject({
      showControls: true,
      showSheetSelect: false,
      selected: first,
    });
  });

  it("複数件ではシートselectを表示し利用者選択を優先する", () => {
    expect(historicalRasterControlState([first, second], second.id, first.id)).toMatchObject({
      showControls: true,
      showSheetSelect: true,
      selected: second,
    });
  });

  it("現在範囲がシート外なら案内し、交差時は案内を消す", () => {
    expect(historicalRasterViewportStatus({ south: 34, west: 134, north: 35, east: 135 }, first.bounds)).toContain("対象範囲外");
    expect(historicalRasterViewportStatus({ south: 35.6, west: 139.6, north: 35.8, east: 139.9 }, first.bounds)).toBe("");
  });

  it("利用者操作時だけ固定boundsへfitし自動アニメーションしない", () => {
    const fitBounds = vi.fn();
    fitHistoricalRasterExtent({ fitBounds }, first);
    expect(fitBounds).toHaveBeenCalledWith(
      [[...first.bounds[0]], [...first.bounds[1]]],
      { animate: false },
    );
  });
});
