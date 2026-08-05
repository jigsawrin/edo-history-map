import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAttribution } from "../src/attribution";
import {
  GSI_ADDITIONAL_SOURCE_IDS,
  GSI_ADDITIONAL_SOURCE_LINKS,
  GSI_LOW_ZOOM_MAX,
  GSI_LOW_ZOOM_MIN,
  resolveGsiAdditionalSources,
} from "../src/gsi-attribution";

describe("GSI低ズーム追加出所", () => {
  it("既存のGSIタイル設定・ズーム範囲・公開境界を変更しない", () => {
    const root = join(__dirname, "..");
    const config = readFileSync(join(root, "src", "config.ts"), "utf8");
    const main = readFileSync(join(root, "src", "main.ts"), "utf8");
    const layers = readFileSync(join(root, "src", "leaflet-layers.ts"), "utf8");
    const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
    expect(config).toContain("pale: \"https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png\"");
    expect(config).toContain("std: \"https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png\"");
    expect(config).toContain("export const MIN_ZOOM = 5");
    expect(config).toContain("export const MAX_ZOOM = 18");
    expect(config).toContain("export const GSI_ATTRIBUTION");
    expect(main).toContain("map.attributionControl.setPrefix(false)");
    expect(main).toContain("MAP_PANES.currentLocation");
    expect(main).toContain("regionRegistry");
    expect(main).toContain("VISUAL_LAYER_IDS.historicalPoints");
    expect(layers).toContain("GSI_TILE_URLS.pale");
    expect(layers).toContain("GSI_TILE_URLS.std");
    expect(vite).toContain("connect-src 'self'");
    expect(vite).toContain("https://cyberjapandata.gsi.go.jp");
  });

  it("pale/stdのズーム境界を固定し、9以上では追加しない", () => {
    expect(
      resolveGsiAdditionalSources({ base: "pale", zoom: 4, baseVisible: true }),
    ).toHaveLength(0);
    expect(
      resolveGsiAdditionalSources({ base: "pale", zoom: GSI_LOW_ZOOM_MIN, baseVisible: true }),
    ).toHaveLength(1);
    expect(
      resolveGsiAdditionalSources({ base: "pale", zoom: GSI_LOW_ZOOM_MAX, baseVisible: true }),
    ).toHaveLength(1);
    expect(
      resolveGsiAdditionalSources({ base: "pale", zoom: 9, baseVisible: true }),
    ).toHaveLength(0);

    const standardAttribution = resolveGsiAdditionalSources({
      base: "std",
      zoom: GSI_LOW_ZOOM_MIN,
      baseVisible: true,
    });
    expect(standardAttribution.map((source) => source.id)).toEqual([
      GSI_ADDITIONAL_SOURCE_IDS.stdGebco,
      GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard,
      GSI_ADDITIONAL_SOURCE_IDS.stdVmap0,
    ]);
    expect(
      resolveGsiAdditionalSources({ base: "std", zoom: 8, baseVisible: true }),
    ).toHaveLength(3);
    expect(
      resolveGsiAdditionalSources({ base: "std", zoom: 9, baseVisible: true }),
    ).toHaveLength(0);
  });

  it("基図非表示・透過0相当・未知の基図では追加しない", () => {
    expect(
      resolveGsiAdditionalSources({ base: "pale", zoom: 5, baseVisible: false }),
    ).toEqual([]);
    expect(
      resolveGsiAdditionalSources({ base: "std", zoom: 5, baseVisible: false }),
    ).toEqual([]);
    expect(
      resolveGsiAdditionalSources({
        base: "unknown" as never,
        zoom: 5,
        baseVisible: true,
      }),
    ).toEqual([]);
  });

  it("返却順とsource/linkのURLを決定的に保つ", () => {
    const pale = resolveGsiAdditionalSources({ base: "pale", zoom: 5, baseVisible: true });
    const standard = resolveGsiAdditionalSources({ base: "std", zoom: 5, baseVisible: true });
    const ids = [...pale, ...standard].map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of [...pale, ...standard]) {
      expect(source.text.trim()).not.toBe("");
      expect(GSI_ADDITIONAL_SOURCE_LINKS[source.id].href).toMatch(/^https:\/\//);
      expect(GSI_ADDITIONAL_SOURCE_LINKS[source.id].text.trim()).not.toBe("");
    }
  });

  it("通常出所と条件付き出所を安全なDOMテキスト/リンクとして描画する", () => {
    const container = document.createElement("div");
    renderAttribution(container, [
      "gsi-tiles",
      GSI_ADDITIONAL_SOURCE_IDS.stdGebco,
      GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard,
      GSI_ADDITIONAL_SOURCE_IDS.stdVmap0,
    ]);

    expect(container.textContent).toContain("GEBCO Digital Atlas");
    expect(container.textContent).toContain("VMAP0");
    expect(container.querySelectorAll("a").length).toBeGreaterThanOrEqual(4);
    for (const link of container.querySelectorAll("a")) {
      expect(link.target).toBe("_blank");
      expect(link.rel).toContain("noopener");
      expect(link.rel).toContain("noreferrer");
      expect(link.href).toMatch(/^https:\/\//);
    }
    expect(container.querySelectorAll("[tabindex='-1']")).toHaveLength(0);
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it("paleとstdの条件付きセクションを混同しない", () => {
    const pale = document.createElement("div");
    renderAttribution(pale, ["gsi-tiles", GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]);
    expect(pale.textContent).toContain("pale basemap");
    expect(pale.textContent).not.toContain("GEBCO Digital Atlas");

    const standard = document.createElement("div");
    renderAttribution(standard, ["gsi-tiles", GSI_ADDITIONAL_SOURCE_IDS.stdGebco]);
    expect(standard.textContent).toContain("standard basemap");
    expect(standard.textContent).toContain("GEBCO Digital Atlas");
    expect(standard.textContent).not.toContain("VMAP0 shoreline source");
  });
});
