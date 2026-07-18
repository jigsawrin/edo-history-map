import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(join(__dirname, "../src/main.ts"), "utf8");
const navigation = main.slice(main.indexOf("async function navigateToCuratedHistoricalPlace"), main.indexOf("function cachedMachiyaLayer"));

describe("テーマ・年表の共通地点移動", () => {
  it("テーマと年表が同じ共通関数を利用する", () => {
    expect(main).toContain('navigateToCuratedHistoricalPlace(reference, trigger, "theme")');
    expect(main).toContain('navigateToCuratedHistoricalPlace(reference, trigger, "timeline")');
    expect(main.match(/async function navigateToCuratedHistoricalPlace/gu)).toHaveLength(1);
  });

  it("固定dataset IDから京都・幕末と滋賀・戦国だけへ切り替える", () => {
    expect(navigation).toContain('reference.datasetId === "project-kyoto-bakumatsu-places"');
    expect(navigation).toContain('{ regionId: "kyoto", eraId: "bakumatsu" }');
    expect(navigation).toContain('{ regionId: "shiga", eraId: "sengoku" }');
    expect(navigation).not.toContain("codh-edo-maps-places");
  });

  it("現代表示を含め地域・年代を明示変更して既存検索モデルを読む", () => {
    expect(navigation).toContain("activateRegion(pack, true)");
    expect(navigation).toContain("eraSelect.value = destination.eraId");
    expect(navigation).toContain("applyEra(false)");
    expect(navigation).toContain("placeSearchModelCache.load(reference.datasetId)");
  });

  it("高速選択と手動地域・年代変更で古い非同期結果を拒否する", () => {
    expect(navigation).toContain("++curatedSelectionGeneration");
    expect(navigation.match(/generation !== curatedSelectionGeneration/gu)?.length).toBeGreaterThanOrEqual(3);
    expect(main).toContain("regionSelect.addEventListener");
    expect(main).toContain("eraSelect.addEventListener");
    expect(main.match(/curatedSelectionGeneration \+= 1/gu)?.length).toBeGreaterThanOrEqual(4);
  });

  it("既存地点選択・pan・情報カードを再利用する", () => {
    expect(navigation).toContain("selectHistoricalPlace({");
    expect(main).toContain("map.panTo");
    expect(main).toContain("renderKyotoPlaceCard");
    expect(main).toContain("renderShigaPlaceCard");
  });

  it("情報カード見出しへフォーカスしモバイル閉鎖後の復帰先を開くボタンにする", () => {
    expect(main).toContain('infoCard.querySelector<HTMLElement>("h2")');
    expect(main).toContain("heading.tabIndex = -1");
    expect(main).toContain("heading.focus()");
    expect(navigation).toContain('window.matchMedia("(max-width: 600px)").matches ? opener : trigger');
    expect(navigation).toContain("controller.close(false)");
  });

  it("成功・失敗を対応するaria-live controllerへ通知する", () => {
    expect(navigation).toContain("controller.announce");
    expect(navigation).toContain("へ切り替え、");
    expect(navigation).toContain("関連地点を読み込めませんでした");
  });
});
