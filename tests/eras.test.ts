import { beforeEach, describe, expect, it } from "vitest";
import {
  EraRegistry,
  eraRegistry,
  formatEraLabel,
  populateEraSelect,
  VISUAL_LAYER_ENABLED,
  VISUAL_LAYER_IDS,
  type EraDefinition,
} from "../src/eras";

beforeEach(() => document.body.replaceChildren());

describe("EraRegistry", () => {
  it("現代と江戸後期を一元管理し、UIラベルを年代付きで生成する", () => {
    expect(eraRegistry.enabled().map((era) => era.id)).toEqual([
      "modern",
      "edo-late",
    ]);
    const edo = eraRegistry.get("edo-late");
    expect(edo?.baseMode).toBe("reconstructed");
    expect(edo?.placeDatasetId).toBe("codh-edo-maps-places");
    expect(eraRegistry.get("modern")?.attributionIds).toEqual(["gsi-tiles"]);
    expect(edo?.attributionIds).toEqual([
      "codh-edo-maps-places",
      "codh-edo-machiya-areas",
      "codh-edo-coastline",
    ]);
    expect(edo?.visualLayers).toContain(VISUAL_LAYER_IDS.historicalPoints);
    expect(edo?.visualLayers).toContain(
      VISUAL_LAYER_IDS.historicalCommonerAreas,
    );
    expect(VISUAL_LAYER_ENABLED[VISUAL_LAYER_IDS.historicalPoints]).toBe(true);
    expect(
      VISUAL_LAYER_ENABLED[VISUAL_LAYER_IDS.historicalCommonerAreas],
    ).toBe(true);
    expect(VISUAL_LAYER_ENABLED[VISUAL_LAYER_IDS.historicalRoads]).toBe(false);
    expect(edo && formatEraLabel(edo)).toBe("江戸後期 1849–1862");
    expect(edo && formatEraLabel(edo, "en")).toBe("Late Edo 1849–1862");
  });

  it("enabled=false の年代を実行時UIへ登録しない", () => {
    const disabled: EraDefinition = {
      id: "meiji",
      label: "明治",
      startYear: 1868,
      endYear: 1912,
      baseMode: "reconstructed",
      visualLayers: [],
      placeDatasetId: null,
      attributionIds: [],
      uncertaintyNote: "未導入",
      enabled: false,
    };
    const registry = new EraRegistry([disabled]);
    expect(registry.get("meiji")).toBeNull();
    expect(registry.enabled()).toHaveLength(0);
  });

  it("selectの選択値を保ったままレジストリからoptionを構築する", () => {
    const select = document.createElement("select");
    const old = document.createElement("option");
    old.value = "edo-late";
    old.selected = true;
    select.append(old);
    populateEraSelect(select);
    expect(select.value).toBe("edo-late");
    expect([...select.options].map((option) => option.text)).toEqual([
      "現代",
      "江戸後期 1849–1862",
    ]);
  });

  it("年代IDの重複を拒否する", () => {
    const modern = eraRegistry.get("modern") as EraDefinition;
    expect(() => new EraRegistry([modern, modern])).toThrow("重複");
  });
});
