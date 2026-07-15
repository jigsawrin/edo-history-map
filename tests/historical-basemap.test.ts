import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import L from "leaflet";
import { vi } from "vitest";
import {
  createMapPanes,
  MAP_PANES,
  PANE_Z_INDEX,
} from "../src/leaflet-layers";

const ROOT = join(__dirname, "..");

describe("歴史基図統合の退行防止", () => {
  it("要求されたpaneを分離し、現在地を歴史レイヤーより上に置く", () => {
    expect(Object.values(MAP_PANES)).toEqual([
      "modern-base-pane",
      "historical-raster-pane",
      "historical-area-pane",
      "historical-line-pane",
      "historical-points-pane",
      "current-location-pane",
      "ui-overlay",
    ]);
    expect(PANE_Z_INDEX[MAP_PANES.currentLocation]).toBeGreaterThan(
      PANE_Z_INDEX[MAP_PANES.historicalPoints] ?? 0,
    );
  });

  it("歴史地点paneだけを操作可能にし、背景paneは地図操作を遮らない", () => {
    const elements = new Map<string, HTMLElement>();
    const map = {
      createPane: vi.fn((name: string) => {
        const pane = document.createElement("div");
        elements.set(name, pane);
        return pane;
      }),
    } as unknown as L.Map;
    createMapPanes(map);

    expect(elements.get(MAP_PANES.historicalPoints)?.style.pointerEvents).toBe(
      "auto",
    );
    for (const name of [
      MAP_PANES.modernBase,
      MAP_PANES.historicalRaster,
      MAP_PANES.historicalArea,
      MAP_PANES.historicalLine,
      MAP_PANES.currentLocation,
      MAP_PANES.uiOverlay,
    ]) {
      expect(elements.get(name)?.style.pointerEvents).toBe("none");
    }
  });

  it("mapオブジェクトを一度だけ作り、年代切替でsetViewしない", () => {
    const source = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
    expect(source.match(/L\.map\(/g)).toHaveLength(1);
    const applyEra = source.match(
      /function applyEra[\s\S]+?function applyHistoricalOpacity/,
    )?.[0];
    expect(applyEra).toBeTruthy();
    expect(applyEra).not.toContain("setView");
    expect(applyEra).not.toContain("clearLocation");
    expect(applyEra).not.toContain("replaceChildren");
  });

  it("CSPへ新しい外部接続先を追加しない", () => {
    const vite = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
    expect(vite).toContain("connect-src 'self'");
    expect(vite).toContain("https://cyberjapandata.gsi.go.jp");
    expect(vite.match(/https:\/\//g)).toHaveLength(1);
  });

  it("公開前監査が歴史画像の全権利条件と公開物混入を検査する", () => {
    const audit = readFileSync(
      join(ROOT, "scripts", "prepublish-audit.mjs"),
      "utf8",
    );
    for (const field of [
      "redistribution_allowed",
      "modification_allowed",
      "cropping_allowed",
      "georeferencing_allowed",
      "tiling_allowed",
      "sha256",
      "sha256_manifest",
      "era_id",
      "geographic_bounds",
    ]) {
      expect(audit).toContain(field);
    }
    expect(audit).toContain("未承認歴史画像の公開");
  });

  it("利用者向け文言に旧称が残らず、READMEとUIが実装内容を明示する", () => {
    const files = [
      "index.html",
      "README.md",
      "src/attribution.ts",
      "docs/HISTORICAL_BASEMAP.md",
      "DISCLAIMER.md",
    ];
    const combined = files
      .map((file) => readFileSync(join(ROOT, file), "utf8"))
      .join("\n");
    expect(combined).not.toContain("歴史復元地図");
    expect(combined).toContain("歴史背景＋江戸地名");
    expect(combined).toContain("本プロジェクト独自の装飾");
    expect(combined).toContain("海岸線");
    expect(combined).toContain("古地図原本");
  });
});
