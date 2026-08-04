import L from "leaflet";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  APPROVED_HISTORICAL_RASTER_SOURCE_IDS,
  HISTORICAL_RASTER_DEFINITIONS,
  HistoricalRasterManifestCache,
  createHistoricalRasterLayer,
  getApprovedHistoricalRasters,
  type HistoricalRasterDefinition,
} from "../src/historical-raster";
import { validateHistoricalRasterDefinitions } from "../src/historical-raster-schema.mjs";
import { rasterDefinition as raster } from "./fixtures/historical-raster-definition";

afterEach(() => vi.unstubAllGlobals());

describe("歴史画像の実行時登録ゲート", () => {
  it("approved rasterとapproved sourceの二重ゲートを通った定義だけを登録する", () => {
    const definitions = [
      raster(),
      raster({ id: "pending", reviewStatus: "pending" }),
      raster({ id: "rejected", reviewStatus: "rejected" }),
    ];
    expect(getApprovedHistoricalRasters(definitions, ["project-generated-fixture"]).map((item) => item.id)).toEqual(["project-grid"]);
    expect(getApprovedHistoricalRasters(definitions, [])).toHaveLength(0);
  });

  it.each([
    ["external", { localTilePath: "https://example.invalid/{z}/{x}/{y}.png" }],
    ["traversal", { localTilePath: "data/historical-rasters/../{z}/{x}/{y}.png" }],
    ["region", { regionId: "" }],
    ["era", { eraId: "" }],
    ["source", { sourceId: "" }],
    ["attribution", { attributionId: "" }],
    ["bounds", { bounds: [[36, 140], [35, 139]] }],
    ["zoom", { maxNativeZoom: 2 }],
    ["opacity", { defaultOpacity: 2 }],
  ])("不正な%s定義を拒否する", (_label, overrides) => {
    expect(getApprovedHistoricalRasters([raster(overrides as Partial<HistoricalRasterDefinition>)], ["project-generated-fixture"])).toHaveLength(0);
  });

  it("ID重複をレジストリ全体として拒否する", () => {
    expect(() => validateHistoricalRasterDefinitions([raster(), raster()])).toThrow(/重複/u);
    expect(getApprovedHistoricalRasters([raster(), raster()], ["project-generated-fixture"])).toHaveLength(0);
  });

  it("本番source承認一覧と実行時レジストリを空のまま維持する", () => {
    expect(APPROVED_HISTORICAL_RASTER_SOURCE_IDS).toHaveLength(0);
    expect(HISTORICAL_RASTER_DEFINITIONS).toHaveLength(0);
    expect(getApprovedHistoricalRasters()).toHaveLength(0);
  });

  it("qualityGatePassed=falseの定義を本番登録しない", () => {
    expect(getApprovedHistoricalRasters([raster({ qualityGatePassed: false })], ["project-generated-fixture"])).toHaveLength(0);
  });

  it("任意のsheetLabelEnを後方互換で検証する", () => {
    expect(validateHistoricalRasterDefinitions([raster({ sheetLabelEn: "Project grid" })])[0]).toMatchObject({ sheetLabelEn: "Project grid" });
    expect(() => validateHistoricalRasterDefinitions([raster({ sheetLabelEn: "<b>grid</b>" })])).toThrow();
  });
});

describe("Leaflet古地図ラスターレイヤー", () => {
  it("固定レジストリ定義からpane・bounds・zoom・noWrap・tileSizeを固定する", () => {
    const definition = raster();
    const historical = createHistoricalRasterLayer(definition, { definitions: [definition], approvedSourceIds: [definition.sourceId] });
    expect(historical.layer.options.pane).toBe("historical-raster-pane");
    expect(historical.layer.options.noWrap).toBe(true);
    expect(historical.layer.options.minZoom).toBe(1);
    expect(historical.layer.options.maxZoom).toBe(1);
    expect(historical.layer.options.maxNativeZoom).toBe(1);
    expect(historical.layer.options.tileSize).toBe(256);
    expect(L.latLngBounds(historical.layer.options.bounds as L.LatLngBoundsLiteral).equals(L.latLngBounds([[...definition.bounds[0]], [...definition.bounds[1]]]))).toBe(true);
  });

  it("opacityを0から1へclampしNaNを0として扱う", () => {
    const definition = raster();
    const historical = createHistoricalRasterLayer(definition, { definitions: [definition], approvedSourceIds: [definition.sourceId] });
    historical.setOpacity(2); expect(historical.layer.options.opacity).toBe(1);
    historical.setOpacity(-1); expect(historical.layer.options.opacity).toBe(0);
    historical.setOpacity(Number.NaN); expect(historical.layer.options.opacity).toBe(0);
  });

  it("非表示中はtileerrorを解除し、表示中は一度だけ通知してdisposeする", () => {
    const definition = raster(); const onTileError = vi.fn();
    const historical = createHistoricalRasterLayer(definition, { definitions: [definition], approvedSourceIds: [definition.sourceId], onTileError });
    const remove = vi.spyOn(historical.layer, "remove");
    historical.deactivate(); historical.layer.fire("tileerror");
    expect(onTileError).not.toHaveBeenCalled();
    historical.activate();
    historical.layer.fire("tileerror"); historical.layer.fire("tileerror");
    expect(onTileError).toHaveBeenCalledTimes(1);
    historical.dispose(); expect(remove).toHaveBeenCalledOnce();
    historical.layer.fire("tileerror"); expect(onTileError).toHaveBeenCalledTimes(1);
  });

  it("固定レジストリ外の定義から任意URLレイヤーを作れない", () => {
    expect(() => createHistoricalRasterLayer(raster())).toThrow(/固定レジストリ/u);
  });
});

describe("manifestメモリキャッシュ", () => {
  it("同じ定義の同一origin manifestを一度だけ読み込み再利用する", async () => {
    const definition = raster();
    const manifest = {
      schemaVersion: 1, rasterId: definition.id, sourceId: definition.sourceId, regionId: definition.regionId, eraId: definition.eraId,
      tileScheme: "xyz", tileFormat: "png", tileSize: 256, minZoom: 1, maxZoom: 1, maxNativeZoom: 1,
      bounds: { south: 35.6, west: 139.7, north: 35.7, east: 139.8 }, originalFileSha256: "a".repeat(64), georeferenceMetadataSha256: "b".repeat(64),
      tileCount: 1, totalBytes: 10, files: [{ path: "1/0/0.png", sha256: "c".repeat(64), bytes: 10, width: 256, height: 256 }],
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(manifest) });
    vi.stubGlobal("fetch", fetchMock);
    const cache = new HistoricalRasterManifestCache();
    const first = cache.load(definition); const second = cache.load(definition);
    expect(first).toBe(second); await expect(first).resolves.toMatchObject({ rasterId: definition.id });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
