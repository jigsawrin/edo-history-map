import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const main = readFileSync(join(root, "src/main.ts"), "utf8");
const audit = readFileSync(join(root, "scripts/prepublish-audit.mjs"), "utf8");

describe("地点検索と地図の統合", () => {
  it("マーカーと検索結果が共通選択経路を利用する", () => {
    expect(main).toContain("async function selectHistoricalPlace");
    expect(main.match(/selectHistoricalPlace\(\{/g)?.length).toBeGreaterThanOrEqual(3);
    expect(main).toContain('source: "map"');
    expect(main).toContain('source: "search"');
    expect(main).toContain("renderPlaceCard(");
    expect(main).toContain("renderKyotoPlaceCard(");
  });

  it("検索選択はpanToを使い、現在ズームを強制変更しない", () => {
    const selection = main.slice(
      main.indexOf("async function selectHistoricalPlace"),
      main.indexOf("function cachedMachiyaLayer"),
    );
    expect(selection).toContain("map.panTo");
    expect(selection).toContain("prefersReducedMotion()");
    expect(selection).not.toContain("map.setView");
    expect(selection).not.toContain("map.setZoom");
    expect(selection).not.toContain("clearLocation");
  });

  it("現在binding・読み込み世代・地点datasetを選択前後に検証する", () => {
    expect(main).toContain("binding?.placeDatasetId !== selection.datasetId");
    expect(main).toContain("loadCoordinator.isCurrent(token)");
    expect(main).toContain("activeHistoricalPointsDatasetId");
  });

  it("検索モデルと地点レイヤーは既存キャッシュを共有し重複生成しない", () => {
    expect(main).toContain("placeSearchModelCache");
    expect(main).toContain("cachedPointsLayer(selection.datasetId)");
    expect(main).toContain("pointLayerPromises");
  });
});

describe("地点検索の公開前監査", () => {
  it("UI、50件上限、固定アダプター、保存・送信禁止を検査する", () => {
    for (const marker of [
      "place-search-open",
      "place-search-results",
      "maxlength=",
      "SEARCH_RESULTS_PER_PAGE = 50",
      "codh-edo-maps-places",
      "project-kyoto-bakumatsu-places",
      "検索語の外部送信",
      "検索状態の永続保存",
    ]) {
      expect(audit).toContain(marker);
    }
  });
});
