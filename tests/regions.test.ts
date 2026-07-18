import { describe, expect, it } from "vitest";
import { EraRegistry, eraRegistry } from "../src/eras";
import { EDO_REGION_PACK } from "../src/regions/edo";
import { KYOTO_REGION_PACK } from "../src/regions/kyoto";
import { RegionRegistry } from "../src/regions/registry";
import type { RegionPack } from "../src/regions/types";
import { datasetRegistry } from "../src/datasets";
import { rasterDefinition as raster } from "./fixtures/historical-raster-definition";

function pack(overrides: Partial<RegionPack["region"]> = {}): RegionPack {
  return {
    region: {
      id: "fixture",
      label: "テスト地域",
      center: [35, 135],
      defaultZoom: 12,
      bounds: { minLat: 34, maxLat: 36, minLon: 134, maxLon: 136 },
      defaultEraId: "modern",
      enabledEraIds: ["modern"],
      enabled: true,
      presentation: {
        pageTitle: "テスト",
        metaDescription: "テスト説明",
        tagline: "テスト地域",
        pointOpacityLabel: "地点不透明度",
        historicalViewLabel: "歴史表示",
        footerCaution: "テスト注意",
        pointLegendLabel: "地点",
        noDataMessage: "データなし",
        searchButtonLabel: "地点を検索",
        searchHeading: "地点一覧",
        searchInputLabel: "地点名",
        searchEmptyMessage: "一致なし",
        searchResultNoun: "地点",
      },
      ...overrides,
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

function withEra(
  source: RegionPack,
  overrides: Partial<RegionPack["eras"][number]>,
): RegionPack {
  return {
    ...source,
    eras: [{ ...(source.eras[0] as RegionPack["eras"][number]), ...overrides }],
  };
}

describe("RegionRegistry", () => {
  it("東京・江戸、京都、滋賀を本番有効地域として返す", () => {
    const registry = new RegionRegistry();
    expect(registry.enabled().map((item) => item.region.id)).toEqual([
      "edo",
      "kyoto",
      "shiga",
    ]);
    expect(registry.get("edo")?.region.center).toEqual([35.6852, 139.7528]);
    expect(registry.getEraBinding("edo", "edo-late")?.datasetIds).toHaveLength(3);
    expect(registry.get("kyoto")?.region.defaultEraId).toBe("bakumatsu");
    expect(registry.get("kyoto")?.region.center).toEqual([
      34.993708,
      135.752445,
    ]);
    expect(registry.get("kyoto")?.region.defaultZoom).toBe(11);
    expect(registry.get("kyoto")?.region.enabledEraIds).toEqual([
      "modern",
      "bakumatsu",
    ]);
    expect(registry.get("shiga")?.region.center).toEqual([35.24, 136.13]);
    expect(registry.get("shiga")?.region.enabledEraIds).toEqual(["modern", "sengoku"]);
    expect(
      registry.getEraBinding("kyoto", "bakumatsu")?.datasetIds,
    ).toEqual(["project-kyoto-bakumatsu-places"]);
    expect(registry.getEraBinding("kyoto", "edo-late")).toBeNull();
    expect(registry.getEraBinding("edo", "bakumatsu")).toBeNull();
    expect(registry.enabled().flatMap((item) => item.eras).every((binding) => binding.historicalRasterIds === undefined && binding.defaultHistoricalRasterId === undefined)).toBe(true);
    expect(registry.enabled().flatMap((item) => item.eras).every((binding) => !binding.allowedHistoricalViewModes?.includes("historical-map"))).toBe(true);
  });

  it("approved古地図IDをregion・era・sourceの二重ゲートで接続する", () => {
    const source = withEra(pack({ defaultEraId: "edo-late", enabledEraIds: ["edo-late"] }), {
      eraId: "edo-late", baseMode: "reconstructed", visualLayers: ["historical-raster"],
      allowedHistoricalViewModes: ["historical-map"], defaultHistoricalViewMode: "historical-map",
      historicalRasterIds: ["project-grid"], defaultHistoricalRasterId: "project-grid",
    });
    const definition = raster({ regionId: "fixture" });
    const registry = new RegionRegistry([source], eraRegistry, "fixture", datasetRegistry, [definition], [definition.sourceId]);
    expect(registry.getEraBinding("fixture", "edo-late")?.historicalRasterIds).toEqual(["project-grid"]);
    expect(Object.isFrozen(registry.getEraBinding("fixture", "edo-late")?.historicalRasterIds)).toBe(true);
  });

  it.each([
    ["pending", raster({ regionId: "fixture", reviewStatus: "pending" }), ["project-generated-fixture"]],
    ["rejected", raster({ regionId: "fixture", reviewStatus: "rejected" }), ["project-generated-fixture"]],
    ["source不一致", raster({ regionId: "fixture" }), []],
    ["region不一致", raster(), ["project-generated-fixture"]],
    ["era不一致", raster({ regionId: "fixture", eraId: "modern" }), ["project-generated-fixture"]],
  ])("%s古地図参照を拒否する", (_label, definition, approvedSources) => {
    const source = withEra(pack({ defaultEraId: "edo-late", enabledEraIds: ["edo-late"] }), {
      eraId: "edo-late", baseMode: "reconstructed", visualLayers: ["historical-raster"],
      allowedHistoricalViewModes: ["historical-map"], defaultHistoricalViewMode: "historical-map",
      historicalRasterIds: ["project-grid"], defaultHistoricalRasterId: "project-grid",
    });
    expect(() => new RegionRegistry([source], eraRegistry, "fixture", datasetRegistry, [definition], approvedSources)).toThrow(/未承認|地域または年代/u);
  });

  it("古地図ID重複・default配列外・古地図なしhistorical-mapを拒否する", () => {
    const base = pack({ defaultEraId: "edo-late", enabledEraIds: ["edo-late"] });
    for (const overrides of [
      { historicalRasterIds: ["project-grid", "project-grid"], defaultHistoricalRasterId: "project-grid" },
      { historicalRasterIds: ["project-grid"], defaultHistoricalRasterId: "missing" },
    ]) {
      const source = withEra(base, {
        eraId: "edo-late", baseMode: "reconstructed", visualLayers: ["historical-raster"],
        allowedHistoricalViewModes: ["historical-map"], defaultHistoricalViewMode: "historical-map", ...overrides,
      });
      const definition = raster({ regionId: "fixture" });
      expect(() => new RegionRegistry([source], eraRegistry, "fixture", datasetRegistry, [definition], [definition.sourceId])).toThrow(/古地図/u);
    }
    const withoutRaster = withEra(base, {
      eraId: "edo-late", baseMode: "reconstructed", visualLayers: ["historical-raster"],
      allowedHistoricalViewModes: ["historical-map"], defaultHistoricalViewMode: "historical-map",
    });
    const definition = raster({ regionId: "fixture" });
    expect(() => new RegionRegistry([withoutRaster], eraRegistry, "fixture", datasetRegistry, [definition], [definition.sourceId])).toThrow(/古地図/u);
  });

  it("重複地域IDを拒否する", () => {
    expect(() => new RegionRegistry([pack(), pack()])).toThrow("重複");
  });

  it.each([
    [[91, 135], "中心座標"],
    [[35, 181], "中心座標"],
    [[Number.NaN, 135], "中心座標"],
  ])("不正な中心座標 %j を拒否する", (center, message) => {
    expect(() =>
      new RegionRegistry([pack({ center: center as [number, number] })], eraRegistry, "fixture"),
    ).toThrow(message);
  });

  it("逆転・同値・範囲外のboundsを拒否する", () => {
    expect(() =>
      new RegionRegistry([
        pack({ bounds: { minLat: 36, maxLat: 34, minLon: 134, maxLon: 136 } }),
      ], eraRegistry, "fixture"),
    ).toThrow("bounds");
    expect(() =>
      new RegionRegistry([
        pack({ bounds: { minLat: 34, maxLat: 36, minLon: 136, maxLon: 136 } }),
      ], eraRegistry, "fixture"),
    ).toThrow("bounds");
  });

  it("bounds外の中心を拒否する", () => {
    expect(() =>
      new RegionRegistry([pack({ center: [37, 135] })], eraRegistry, "fixture"),
    ).toThrow("bounds外");
  });

  it.each([4, 19, 12.5, Number.NaN])("不正ズーム %s を拒否する", (zoom) => {
    expect(() =>
      new RegionRegistry([pack({ defaultZoom: zoom })], eraRegistry, "fixture"),
    ).toThrow("ズーム");
  });

  it("defaultEraIdがenabledEraIds外なら拒否する", () => {
    expect(() =>
      new RegionRegistry([pack({ defaultEraId: "edo-late" })], eraRegistry, "fixture"),
    ).toThrow("初期年代");
  });

  it("存在しない年代参照を拒否する", () => {
    expect(() =>
      new RegionRegistry([
        pack({ defaultEraId: "missing", enabledEraIds: ["missing"] }),
      ], eraRegistry, "fixture"),
    ).toThrow("存在しない年代");
  });

  it("有効年代に有効なバインディングがなければ拒否する", () => {
    const source = withEra(pack(), { enabled: false });
    expect(() => new RegionRegistry([source], eraRegistry, "fixture")).toThrow(
      "バインディング",
    );
  });

  it("未承認データセットと未登録出典を拒否する", () => {
    const badData = withEra(pack(), { datasetIds: ["unknown"] });
    expect(() => new RegionRegistry([badData], eraRegistry, "fixture")).toThrow(
      "未承認",
    );
    const badAttr = withEra(pack(), { attributionIds: ["unknown"] });
    expect(() => new RegionRegistry([badAttr], eraRegistry, "fixture")).toThrow(
      "未登録",
    );
  });

  it("EDOと京都の専用データ相互混入を拒否する", () => {
    const badEdo: RegionPack = {
      ...EDO_REGION_PACK,
      eras: EDO_REGION_PACK.eras.map((binding) =>
        binding.eraId === "edo-late"
          ? {
              ...binding,
              datasetIds: ["project-kyoto-bakumatsu-places"],
              placeDatasetId: null,
            }
          : binding,
      ),
    };
    expect(() => new RegionRegistry([badEdo], eraRegistry, "edo")).toThrow(
      "京都専用",
    );

    const badKyoto: RegionPack = {
      ...KYOTO_REGION_PACK,
      eras: KYOTO_REGION_PACK.eras.map((binding) =>
        binding.eraId === "bakumatsu"
          ? {
              ...binding,
              datasetIds: ["codh-edo-maps-places"],
              placeDatasetId: null,
            }
          : binding,
      ),
    };
    expect(() =>
      new RegionRegistry([badKyoto], eraRegistry, "kyoto"),
    ).toThrow("EDO専用");
  });

  it("基図・表示レイヤー・重複ID・注意文・表示モードを検証する", () => {
    expect(() =>
      new RegionRegistry(
        [withEra(pack(), { baseMode: "unknown" as never })],
        eraRegistry,
        "fixture",
      ),
    ).toThrow("基図モード");
    expect(() =>
      new RegionRegistry(
        [withEra(pack(), { visualLayers: ["unknown"] })],
        eraRegistry,
        "fixture",
      ),
    ).toThrow("表示レイヤー");
    expect(() =>
      new RegionRegistry(
        [withEra(pack(), { attributionIds: ["gsi-tiles", "gsi-tiles"] })],
        eraRegistry,
        "fixture",
      ),
    ).toThrow("出典IDが重複");
    expect(() =>
      new RegionRegistry(
        [
          withEra(pack(), {
            datasetIds: ["codh-edo-maps-places", "codh-edo-maps-places"],
          }),
        ],
        eraRegistry,
        "fixture",
      ),
    ).toThrow("データセットIDが重複");
    expect(() =>
      new RegionRegistry(
        [withEra(pack(), { uncertaintyNote: "注".repeat(1001) })],
        eraRegistry,
        "fixture",
      ),
    ).toThrow("注意文");
    expect(() =>
      new RegionRegistry(
        [
          withEra(pack(), {
            allowedHistoricalViewModes: ["points"],
            defaultHistoricalViewMode: "compare",
          }),
        ],
        eraRegistry,
        "fixture",
      ),
    ).toThrow("歴史表示モード");
  });

  it("無効地域を一覧・get・resolve候補へ出さない", () => {
    const disabled = pack({ id: "disabled", enabled: false });
    const registry = new RegionRegistry(
      [EDO_REGION_PACK, disabled],
      eraRegistry,
      "edo",
    );
    expect(registry.enabled()).toHaveLength(1);
    expect(registry.get("disabled")).toBeNull();
    expect(registry.resolve("disabled").region.id).toBe("edo");
  });

  it("入力と返却定義を深く分離し凍結する", () => {
    const source = pack();
    const registry = new RegionRegistry([source], eraRegistry, "fixture");
    source.region.label = "変更";
    (source.region.center as [number, number])[0] = 0;
    (source.region.enabledEraIds as string[])[0] = "edo-late";
    expect(registry.get("fixture")?.region.label).toBe("テスト地域");
    expect(registry.get("fixture")?.region.center).toEqual([35, 135]);
    expect(Object.isFrozen(registry.get("fixture")?.region.center)).toBe(true);
    expect(Object.isFrozen(registry.get("fixture")?.eras[0]?.visualLayers)).toBe(true);
  });

  it("注入した年代カタログで独自fixtureを検証できる", () => {
    const catalog = new EraRegistry([
      { id: "fixture-era", label: "例", startYear: null, endYear: null },
    ]);
    let source = pack({
      defaultEraId: "fixture-era",
      enabledEraIds: ["fixture-era"],
    });
    source = withEra(source, { eraId: "fixture-era" });
    expect(new RegionRegistry([source], catalog, "fixture").get("fixture")).not.toBeNull();
  });
});
