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
import { EDO_REGION_PACK } from "../src/regions/edo";
import { KYOTO_REGION_PACK } from "../src/regions/kyoto";

beforeEach(() => document.body.replaceChildren());

describe("年代カタログと地域・年代バインディング", () => {
  it("年代カタログは地域固有のレイヤーや出典を持たない", () => {
    expect(eraRegistry.all().map((era) => era.id)).toEqual([
      "modern",
      "edo-late",
      "bakumatsu",
      "edo-early",
      "sengoku",
    ]);
    const edo = eraRegistry.get("edo-late");
    expect(edo && formatEraLabel(edo)).toBe("江戸後期 1849–1862");
    expect(edo && formatEraLabel(edo, "en")).toBe("Late Edo 1849–1862");
    expect(edo).not.toHaveProperty("visualLayers");
    expect(edo).not.toHaveProperty("attributionIds");
    const bakumatsu = eraRegistry.get("bakumatsu");
    expect(bakumatsu && formatEraLabel(bakumatsu)).toBe("幕末 1853–1868");
    expect(bakumatsu && formatEraLabel(bakumatsu, "en")).toBe(
      "Bakumatsu 1853–1868",
    );
  });

  it("京都パックは幕末地点だけを表示しEDOデータを参照しない", () => {
    const bakumatsu = KYOTO_REGION_PACK.eras.find(
      (binding) => binding.eraId === "bakumatsu",
    );
    expect(KYOTO_REGION_PACK.region.defaultEraId).toBe("bakumatsu");
    expect(bakumatsu?.baseMode).toBe("historical-points");
    expect(bakumatsu?.visualLayers).toEqual([VISUAL_LAYER_IDS.historicalPoints]);
    expect(bakumatsu?.datasetIds).toEqual([
      "project-kyoto-bakumatsu-places",
    ]);
    expect(bakumatsu?.allowedHistoricalViewModes).toEqual(["points"]);
    expect(bakumatsu?.defaultHistoricalViewMode).toBe("points");
    expect(JSON.stringify(KYOTO_REGION_PACK)).not.toContain("codh-edo-");
  });

  it("東京・江戸パックが既存レイヤー・データ・出典を所有する", () => {
    const edoLate = EDO_REGION_PACK.eras.find(
      (binding) => binding.eraId === "edo-late",
    );
    expect(edoLate?.baseMode).toBe("reconstructed");
    expect(edoLate?.placeDatasetId).toBe("codh-edo-maps-places");
    expect(edoLate?.datasetIds).toEqual([
      "codh-edo-maps-places",
      "codh-edo-machiya-areas",
      "codh-edo-coastline",
    ]);
    expect(edoLate?.visualLayers).toContain(VISUAL_LAYER_IDS.historicalPoints);
    expect(edoLate?.visualLayers).toContain(
      VISUAL_LAYER_IDS.historicalCommonerAreas,
    );
    expect(VISUAL_LAYER_ENABLED[VISUAL_LAYER_IDS.historicalPoints]).toBe(true);
    expect(VISUAL_LAYER_ENABLED[VISUAL_LAYER_IDS.historicalRaster]).toBe(true);
    expect(VISUAL_LAYER_ENABLED[VISUAL_LAYER_IDS.historicalRoads]).toBe(false);
    expect(EDO_REGION_PACK.eras.find((era) => era.eraId === "edo-early")?.enabled).toBe(false);
  });

  it("地域の有効年代だけでselectを構築し選択値を保つ", () => {
    const select = document.createElement("select");
    select.append(new Option("旧", "edo-late", true, true));
    populateEraSelect(select, EDO_REGION_PACK.region.enabledEraIds);
    expect(select.value).toBe("edo-late");
    expect([...select.options].map((option) => option.text)).toEqual([
      "現代",
      "江戸後期 1849–1862",
    ]);
  });

  it("年代IDの重複を拒否し定義を凍結する", () => {
    const modern = eraRegistry.get("modern") as EraDefinition;
    expect(() => new EraRegistry([modern, modern])).toThrow("重複");
    const source: EraDefinition = {
      id: "test",
      label: "テスト",
      startYear: null,
      endYear: null,
      localizedLabels: { ja: "テスト" },
    };
    const registry = new EraRegistry([source]);
    source.label = "変更";
    expect(registry.get("test")?.label).toBe("テスト");
    expect(Object.isFrozen(registry.get("test"))).toBe(true);
  });
});
