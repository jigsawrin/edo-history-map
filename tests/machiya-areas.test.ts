import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadMachiyaAreas,
  MachiyaValidationError,
  parseMachiyaAreasGeoJson,
  validateMachiyaAreaCollection,
} from "../src/machiya-areas";
import { MACHIYA_LIMITS } from "../src/config";

function polygonFeature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [139.7, 35.68],
          [139.71, 35.68],
          [139.71, 35.69],
          [139.7, 35.68],
        ],
      ],
    },
    properties: {
      id: "machiya-01",
      sourceSheetId: "1",
      sourceSheetName: "自作fixture",
      category: "machiya-area",
      eraId: "edo-late",
      positionConfidence: "estimated",
      sourceId: "codh-edo-machiya-areas",
    },
    ...overrides,
  };
}

function collection(features: unknown[] = [polygonFeature()]) {
  return { type: "FeatureCollection", features };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("町家領域GeoJSON検証", () => {
  it("正常なPolygonとMultiPolygonを受け入れる", () => {
    const multi = polygonFeature({
      geometry: {
        type: "MultiPolygon",
        coordinates: [polygonFeature().geometry.coordinates],
      },
      properties: { ...polygonFeature().properties, id: "machiya-02" },
    });
    expect(validateMachiyaAreaCollection(collection([polygonFeature(), multi])).features).toHaveLength(2);
  });

  it.each(["GeometryCollection", "Point", "LineString"])("%sを拒否する", (type) => {
    expect(() =>
      validateMachiyaAreaCollection(
        collection([polygonFeature({ geometry: { type, coordinates: [] } })]),
      ),
    ).toThrow(MachiyaValidationError);
  });

  it("NaN、Infinity、nullとbounds外座標を拒否する", () => {
    for (const coordinate of [NaN, Infinity, null, 135]) {
      const feature = polygonFeature();
      feature.geometry.coordinates[0]![1]![0] = coordinate as number;
      expect(() => validateMachiyaAreaCollection(collection([feature]))).toThrow(
        MachiyaValidationError,
      );
    }
  });

  it("未閉鎖ring、空geometry、巨大頂点数を拒否する", () => {
    const unclosed = polygonFeature();
    unclosed.geometry.coordinates[0]![3] = [139.701, 35.681];
    expect(() => validateMachiyaAreaCollection(collection([unclosed]))).toThrow("閉じていません");
    expect(() =>
      validateMachiyaAreaCollection(
        collection([polygonFeature({ geometry: { type: "Polygon", coordinates: [] } })]),
      ),
    ).toThrow("空です");

    const points = Array.from(
      { length: MACHIYA_LIMITS.maxVerticesPerFeature },
      (_, index) => [139.7 + (index % 10) * 0.00001, 35.68 + (index % 7) * 0.00001],
    );
    points.push(points[0] as number[]);
    expect(() =>
      validateMachiyaAreaCollection(
        collection([polygonFeature({ geometry: { type: "Polygon", coordinates: [points] } })]),
      ),
    ).toThrow("頂点数");
  });

  it("不正プロパティ、重複ID、prototype pollutionキー、深いネストを拒否する", () => {
    expect(() =>
      validateMachiyaAreaCollection(
        collection([
          polygonFeature({
            properties: { ...polygonFeature().properties, sourceId: "unknown" },
          }),
        ]),
      ),
    ).toThrow("固定プロパティ");
    expect(() => validateMachiyaAreaCollection(collection([polygonFeature(), polygonFeature()]))).toThrow("重複");
    expect(() =>
      parseMachiyaAreasGeoJson(
        '{"type":"FeatureCollection","features":[],"__proto__":{"polluted":true}}',
      ),
    ).toThrow("禁止");
    let nested: unknown = 1;
    for (let index = 0; index < MACHIYA_LIMITS.maxDepth + 2; index++) nested = [nested];
    expect(() => validateMachiyaAreaCollection(nested)).toThrow("ネスト");
  });

  it("最大ファイルサイズとJSON以外を拒否する", () => {
    expect(() => parseMachiyaAreasGeoJson("x".repeat(MACHIYA_LIMITS.maxBytes + 1))).toThrow(
      "サイズ",
    );
    expect(() => parseMachiyaAreasGeoJson("not-json")).toThrow("JSON");
  });
});

describe("町家領域の安全な取得", () => {
  it("同一オリジンをcredentials omit・redirect errorで取得しContent-Typeを確認する", async () => {
    const body = JSON.stringify(collection());
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers({
        "content-type": "application/geo+json",
        "content-length": String(new TextEncoder().encode(body).byteLength),
      }),
      body: null,
      text: async () => body,
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadMachiyaAreas("/edo-history-map/")).resolves.toMatchObject({
      type: "FeatureCollection",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/edo-history-map/data/edo-machiya-areas.geojson",
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
  });

  it("HTTPエラー、不正Content-Type、Content-Length超過を拒否する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, headers: new Headers(), body: null })),
    );
    await expect(loadMachiyaAreas()).rejects.toThrow("読み込めませんでした");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({ "content-type": "text/html" }),
        body: null,
      })),
    );
    await expect(loadMachiyaAreas()).rejects.toThrow("Content-Type");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: new Headers({
          "content-type": "application/geo+json",
          "content-length": String(MACHIYA_LIMITS.maxBytes + 1),
        }),
        body: null,
      })),
    );
    await expect(loadMachiyaAreas()).rejects.toThrow("サイズ");
  });

  it("応答がタイムアウトした場合にAbortSignalで中断する", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, options: RequestInit) =>
          new Promise((_resolve, reject) => {
            options.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      ),
    );
    const loading = loadMachiyaAreas();
    const rejection = expect(loading).rejects.toThrow("読み込めませんでした");
    await vi.advanceTimersByTimeAsync(MACHIYA_LIMITS.fetchTimeoutMs);
    await rejection;
  });
});
