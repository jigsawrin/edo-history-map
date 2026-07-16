import { describe, expect, it } from "vitest";
import { EraRegistry, eraRegistry } from "../src/eras";
import { EDO_REGION_PACK } from "../src/regions/edo";
import { RegionRegistry } from "../src/regions/registry";
import type { RegionPack } from "../src/regions/types";

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
  it("東京・江戸を唯一の本番有効地域として返す", () => {
    const registry = new RegionRegistry();
    expect(registry.enabled().map((item) => item.region.id)).toEqual(["edo"]);
    expect(registry.get("edo")?.region.center).toEqual([35.6852, 139.7528]);
    expect(registry.getEraBinding("edo", "edo-late")?.datasetIds).toHaveLength(3);
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
