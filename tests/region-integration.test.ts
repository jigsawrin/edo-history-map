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
    )?.[0];
    expect(activate).toContain("transitions.switchTo([], 0)");
    expect(activate).toContain('syncAttributions(["gsi-tiles"])');
    expect(activate).toContain("closeRegionInfoCard(infoCard, regionSelect)");
    expect(activate).not.toContain("clearLocation");
    expect(activate).not.toContain("locationMarker");
    expect(activate).not.toContain("accuracyCircle");
  });

  it("専用検証loaderを保ち、innerHTML・evalを導入しない", () => {
    const datasets = readFileSync(join(ROOT, "src/datasets.ts"), "utf8");
    expect(datasets).toContain("loadPlaces");
    expect(datasets).toContain("loadMachiyaAreas");
    expect(datasets).toContain("loadCoastlines");
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
});
