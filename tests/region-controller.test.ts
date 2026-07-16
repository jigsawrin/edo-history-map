import { beforeEach, describe, expect, it, vi } from "vitest";
import { eraRegistry } from "../src/eras";
import {
  activeRegionFromParam,
  announceRegionChange,
  applyRegionMapView,
  closeRegionInfoCard,
  populateRegionEraSelect,
  populateRegionSelect,
  RegionLoadCoordinator,
} from "../src/region-controller";
import { RegionRegistry } from "../src/regions/registry";
import type { RegionPack } from "../src/regions/types";

function fixture(id: string, enabled = true): RegionPack {
  return {
    region: {
      id,
      label: `地域${id}`,
      localizedLabels: { ja: `地域${id}`, en: `Region ${id}` },
      center: [35, id === "second" ? 136 : 135],
      defaultZoom: 12,
      bounds: { minLat: 34, maxLat: 36, minLon: 134, maxLon: 137 },
      defaultEraId: "modern",
      enabledEraIds: ["modern"],
      enabled,
    },
    eras: [
      {
        eraId: "modern",
        enabled: true,
        baseMode: "modern",
        visualLayers: ["modern-base"],
        datasetIds: [],
        placeDatasetId: null,
        attributionIds: ["gsi-tiles"],
        uncertaintyNote: "",
      },
    ],
  };
}

beforeEach(() => {
  document.documentElement.lang = "ja";
  document.body.replaceChildren();
});

describe("地域UIと切り替え補助", () => {
  it("有効地域1件ではselectを非表示かつフォーカス対象外にする", () => {
    const registry = new RegionRegistry([fixture("fixture")], eraRegistry, "fixture");
    const container = document.createElement("label");
    const select = document.createElement("select");
    populateRegionSelect(select, container, registry);
    expect(container.hidden).toBe(true);
    expect(select.tabIndex).toBe(-1);
    expect(select.options[0]?.text).toBe("地域fixture");
  });

  it("有効地域2件ではselectを表示し正しい日本語名を使う", () => {
    const registry = new RegionRegistry(
      [fixture("fixture"), fixture("second")],
      eraRegistry,
      "fixture",
    );
    const container = document.createElement("label");
    container.hidden = true;
    const select = document.createElement("select");
    populateRegionSelect(select, container, registry);
    expect(container.hidden).toBe(false);
    expect(select.hasAttribute("tabindex")).toBe(false);
    expect([...select.options].map((option) => option.value)).toEqual([
      "fixture",
      "second",
    ]);
  });

  it("地域用年代選択肢を更新し初期年代を選ぶ", () => {
    const select = document.createElement("select");
    const selected = populateRegionEraSelect(select, fixture("fixture"));
    expect(selected).toBe("modern");
    expect(select.value).toBe("modern");
  });

  it("地域変更時だけ初期中心とズームへ移動しMapを再作成しない", () => {
    const map = { setView: vi.fn() };
    applyRegionMapView(map, fixture("second"));
    expect(map.setView).toHaveBeenCalledWith([35, 136], 12);
    expect(map.setView).toHaveBeenCalledTimes(1);
  });

  it("情報カードを閉じ、地域selectへフォーカスを戻す", () => {
    const card = document.createElement("section");
    card.hidden = false;
    card.append(document.createElement("button"));
    const select = document.createElement("select");
    document.body.append(card, select);
    closeRegionInfoCard(card, select);
    expect(card.hidden).toBe(true);
    expect(card.childElementCount).toBe(0);
    expect(document.activeElement).toBe(select);
  });

  it("地域変更をaria-live用要素へ通知する", () => {
    const live = document.createElement("p");
    announceRegionChange(live, fixture("fixture"));
    expect(live.textContent).toContain("地域fixture");
    expect(live.textContent).toContain("現代");
  });

  it("不明・無効地域パラメータを既定地域へ戻す", () => {
    const registry = new RegionRegistry(
      [fixture("fixture"), fixture("disabled", false)],
      eraRegistry,
      "fixture",
    );
    expect(activeRegionFromParam(undefined, registry).region.id).toBe("fixture");
    expect(activeRegionFromParam("missing", registry).region.id).toBe("fixture");
    expect(activeRegionFromParam("disabled", registry).region.id).toBe("fixture");
  });
});

describe("地域読み込み世代", () => {
  it("地域Aの遅い完了を地域B切替後は無効にする", () => {
    const coordinator = new RegionLoadCoordinator();
    const old = coordinator.begin("a");
    const current = coordinator.begin("b");
    expect(coordinator.isCurrent(old)).toBe(false);
    expect(coordinator.isCurrent(current)).toBe(true);
  });

  it("同じ地域への高速再切替でも古い世代を無効にする", () => {
    const coordinator = new RegionLoadCoordinator();
    const old = coordinator.begin("edo");
    const current = coordinator.begin("edo");
    expect(coordinator.isCurrent(old)).toBe(false);
    expect(coordinator.isCurrent(current)).toBe(true);
  });

  it("古い成功・エラー・出典の反映を同じ判定で防げる", async () => {
    const coordinator = new RegionLoadCoordinator();
    const token = coordinator.begin("a");
    const applied: string[] = [];
    coordinator.begin("b");
    await Promise.resolve().then(() => {
      if (coordinator.isCurrent(token)) applied.push("old-layer");
      if (coordinator.isCurrent(token)) applied.push("old-error");
      if (coordinator.isCurrent(token)) applied.push("old-attribution");
    });
    expect(applied).toEqual([]);
  });
});
