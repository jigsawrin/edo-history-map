import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAttribution } from "../src/attribution";
import {
  GSI_ADDITIONAL_CONDITIONS_SECTION_ID,
  GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS,
  GSI_ADDITIONAL_SOURCE_IDS,
  GSI_ADDITIONAL_SOURCE_LINKS,
  GSI_ADDITIONAL_SOURCE_TEXTS,
  GSI_LOW_ZOOM_MAX,
  GSI_LOW_ZOOM_MIN,
  resolveGsiAdditionalSources,
} from "../src/gsi-attribution";

describe("GSI低ズーム追加出所", () => {
  it("公式source textをそのまま固定し、GEBCO URL末尾へ句点を付けない", () => {
    expect(GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.stdGebco]).toBe(
      "The bathymetric contours are derived from those contained within the GEBCO Digital Atlas, published by the BODC on behalf of IOC and IHO (2003) (https://www.gebco.net)",
    );
    expect(
      GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard],
    ).toBe("海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）");
    expect(GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]).toBe(
      'Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.',
    );
    expect(
      GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.stdVmap0],
    ).toBe(GSI_ADDITIONAL_SOURCE_TEXTS[GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]);
  });

  it("通常のLeaflet帰属に追加3種の固定短縮表示を使う", () => {
    const attributions = Object.values(GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS).join("\n");
    expect(attributions).toContain("GSI low-zoom VMAP0 shoreline source");
    expect(attributions).toContain("GEBCO Digital Atlas bathymetric contours");
    expect(attributions).toContain("Japan Coast Guard permit (GSI low-zoom source)");
  });

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

  it("gsi-tilesのdialogに通常出所・歴史情報・全条件を常設する", () => {
    const container = document.createElement("div");
    renderAttribution(container, ["gsi-tiles"]);
    expect(container.textContent).toContain("地理院タイル");
    expect(container.textContent).toContain("独自の歴史情報");
    expect(container.textContent).toContain("GSI low-zoom source conditions");
    expect(container.textContent).not.toContain("GEBCO Digital Atlas");
    expect(container.textContent).not.toContain("VMAP0");
    expect(container.textContent).toContain("リアルタイム");
    expect(container.querySelector("a[href='https://maps.gsi.go.jp/development/ichiran.html']")).not.toBeNull();
    expect(container.querySelector("a[href='https://maps.gsi.go.jp/development/siyou.html']")).not.toBeNull();
    expect(
      [...container.querySelectorAll("h3")].some((heading) =>
        heading.textContent?.includes("GSI low-zoom"),
      ),
    ).toBe(true);
    expect(GSI_ADDITIONAL_CONDITIONS_SECTION_ID).toBe("gsi-low-zoom-conditions");
  });

  it("paleとstdの条件付きセクションを混同しない", () => {
    const pale = document.createElement("div");
    renderAttribution(pale, ["gsi-tiles", GSI_ADDITIONAL_SOURCE_IDS.paleVmap0]);
    expect(pale.textContent).toContain("pale basemap");
    expect(pale.textContent).toContain("VMAP0");
    expect(pale.textContent).not.toContain("GEBCO Digital Atlas");

    const standard = document.createElement("div");
    renderAttribution(standard, [
      "gsi-tiles",
      GSI_ADDITIONAL_SOURCE_IDS.stdGebco,
      GSI_ADDITIONAL_SOURCE_IDS.stdJapanCoastGuard,
      GSI_ADDITIONAL_SOURCE_IDS.stdVmap0,
    ]);
    expect(standard.textContent).toContain("standard basemap");
    expect(standard.textContent).toContain("GEBCO Digital Atlas");
    expect(standard.textContent).toContain("VMAP0");
  });

  it("Leaflet attribution CSSはdesktop/mobileとも折返しとsafe-areaを持つ", () => {
    const css = readFileSync(join(__dirname, "..", "src", "style.css"), "utf8");
    expect(css).toContain(".leaflet-control-attribution");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("white-space: normal");
    expect(css).toContain("max-width: calc(100vw - 1rem)");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });
});
