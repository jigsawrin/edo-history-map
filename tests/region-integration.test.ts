import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderAttribution } from "../src/attribution";

const ROOT = join(__dirname, "..");

describe("地域パック統合の退行防止", () => {
  it("mainはL.mapを一度だけ作り、地域変更時だけsetViewする", () => {
    const source = readFileSync(join(ROOT, "src/main.ts"), "utf8");
    expect(source.match(/L\.map\(/g)).toHaveLength(1);
    const applyEra = source.match(
      /function applyEra[\s\S]+?function applyHistoricalOpacity/,
    )?.[0];
    expect(applyEra).not.toContain("setView");
    expect(source).toContain("applyRegionMapView(map, pack)");
  });

  it("地域変更は旧レイヤーと出典を除去し情報カードを閉じる", () => {
    const source = readFileSync(join(ROOT, "src/main.ts"), "utf8");
    const activate = source.match(
      /function activateRegion[\s\S]+?loadRegionLayers\(currentRegion\)/,
    )?.[0] ?? "";
    expect(activate).toContain("transitions.switchTo([], 0)");
    expect(activate).toContain('syncAttributions(["gsi-tiles"])');
    expect(activate).toContain("closeRegionInfoCard(infoCard, regionSelect)");
    expect(activate).toContain("map.invalidateSize({ pan: false })");
    expect(activate.indexOf("applyEra(false)")).toBeLessThan(
      activate.indexOf("applyRegionMapView(map, pack)"),
    );
    expect(activate).not.toContain("clearLocation");
    expect(activate).not.toContain("locationMarker");
    expect(activate).not.toContain("accuracyCircle");
  });

  it("専用検証loaderを保ち、innerHTML・evalを導入しない", () => {
    const datasets = readFileSync(join(ROOT, "src/datasets.ts"), "utf8");
    expect(datasets).toContain("loadPlaces");
    expect(datasets).toContain("loadMachiyaAreas");
    expect(datasets).toContain("loadCoastlines");
    expect(datasets).toContain("loadKyotoBakumatsuPlaces");
    const sources = ["src", "index.html"]
      .flatMap((entry) =>
        entry === "src"
          ? [
              "main.ts",
              "datasets.ts",
              "region-controller.ts",
              "regions/registry.ts",
              "attribution.ts",
            ].map((file) => join(ROOT, "src", file))
          : [join(ROOT, entry)],
      )
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(sources).not.toMatch(/\.innerHTML\s*=/);
    expect(sources).not.toMatch(/\beval\s*\(/);
    expect(sources).not.toMatch(/\blocalStorage\s*\./);
    expect(sources).not.toMatch(/\bindexedDB\s*\./);
    expect(sources).not.toContain("serviceWorker.register");
  });

  it("承認済みデータセットだけを固定レイヤーファクトリへ解決する", () => {
    const source = readFileSync(join(ROOT, "src/main.ts"), "utf8");
    const factories = source.match(
      /const LAYER_FACTORIES[\s\S]+?function cachedPointsLayer/,
    )?.[0];
    expect(factories).toContain('"codh-edo-maps-places"');
    expect(factories).toContain('"project-kyoto-bakumatsu-places"');
    expect(factories).toContain("createKyotoBakumatsuLayer");
    expect(factories).not.toContain("import(");
  });

  it("選択地域に属さないデータセットはPromise作成前に除外する", () => {
    const source = readFileSync(join(ROOT, "src/main.ts"), "utf8");
    const guard = source.indexOf("if (!ids.has(id)) return;");
    const invocation = source.indexOf("void getPromise()", guard);

    expect(guard).toBeGreaterThan(-1);
    expect(invocation).toBeGreaterThan(guard);
    expect(source).toContain("() => cachedPointsLayer(pointDatasetId)");
  });

  it("地域変更時に地域別メタデータ・文言・凡例を同期する", () => {
    const source = readFileSync(join(ROOT, "src/main.ts"), "utf8");
    const presentation = source.match(
      /function applyRegionPresentation[\s\S]+?function prefersReducedMotion/,
    )?.[0];
    expect(presentation).toContain("document.title");
    expect(presentation).toContain("metaDescription");
    expect(presentation).toContain("regionTagline.textContent");
    expect(presentation).toContain("幕末地点不透明度");
    expect(presentation).toContain("kyotoLegend.hidden");
    expect(source).toContain("applyRegionPresentation(pack)");
  });

  it("現代の出典画面には地理院だけを表示する", () => {
    const container = document.createElement("div");
    renderAttribution(container, ["gsi-tiles"]);
    expect(container.textContent).toContain("地理院タイル");
    expect(container.textContent).not.toContain("江戸マップ地名データセット");
    expect(container.textContent).not.toContain("町家領域データセット");
    expect(container.textContent).not.toContain("江戸末期海岸線");
  });

  it("江戸後期の出典画面には承認済み3データを表示する", () => {
    const container = document.createElement("div");
    renderAttribution(container, [
      "gsi-tiles",
      "codh-edo-maps-places",
      "codh-edo-machiya-areas",
      "codh-edo-coastline",
    ]);
    expect(container.textContent).toContain("江戸マップ地名データセット");
    expect(container.textContent).toContain("町家領域データセット");
    expect(container.textContent).toContain("江戸末期海岸線");
  });

  it("京都・幕末の出典画面には独自編集・位置精度・調査日を表示する", () => {
    const container = document.createElement("div");
    renderAttribution(container, [
      "gsi-tiles",
      "project-kyoto-bakumatsu-places",
    ]);
    expect(container.textContent).toContain("独自編集");
    expect(container.textContent).toContain("位置精度");
    expect(container.textContent).toContain("2026年7月16日");
    expect(container.textContent).toContain("画像は転載していません");
    const link = container.querySelector("a[href*='city.kyoto.lg.jp']");
    expect(link?.getAttribute("rel")).toContain("noopener");
    expect(container.textContent).not.toContain("江戸末期海岸線データ");
  });
});
