import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadCoastlines,
  parseCoastlinesGeoJson,
  validateCoastlineCollection,
} from "../src/coastlines";
import { COASTLINE_LIMITS } from "../src/config";

function feature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[139.7, 35.6], [139.8, 35.7]] },
    properties: {
      id: "edo-coastline-0001",
      sourceRecordNumber: 1,
      sourceObjectId: "1929",
      category: "coastline",
      eraId: "edo-late",
      positionConfidence: "estimated",
      sourceId: "codh-edo-coastline",
      ...overrides,
    },
  };
}

const collection = (features = [feature()]) => ({ type: "FeatureCollection", features });

afterEach(() => vi.unstubAllGlobals());

describe("海岸線GeoJSON実行時検証", () => {
  it("LineStringとMultiLineStringだけを受理する", () => {
    const multi = feature();
    multi.geometry = { type: "MultiLineString", coordinates: [[[139.7, 35.6], [139.8, 35.7]]] } as never;
    multi.properties.id = "edo-coastline-0002";
    multi.properties.sourceRecordNumber = 2;
    expect(validateCoastlineCollection(collection([feature(), multi])).features).toHaveLength(2);
  });

  it.each([
    ["重複ID", collection([feature(), feature()])],
    ["sourceId不一致", collection([feature({ sourceId: "other" })])],
    ["eraId不一致", collection([feature({ eraId: "modern" })])],
    ["category不一致", collection([feature({ category: "river" })])],
    ["禁止プロパティ", collection([feature({ constructor: "x" })])],
    ["bounds外", { type: "FeatureCollection", features: [{ ...feature(), geometry: { type: "LineString", coordinates: [[120, 20], [121, 21]] } }] }],
    ["空geometry", { type: "FeatureCollection", features: [{ ...feature(), geometry: { type: "LineString", coordinates: [] } }] }],
    ["未許可geometry", { type: "FeatureCollection", features: [{ ...feature(), geometry: { type: "Point", coordinates: [139.7, 35.6] } }] }],
  ])("%sを拒否する", (_label, value) => expect(() => validateCoastlineCollection(value)).toThrow());

  it("malformed JSONと最大バイト超過を拒否する", () => {
    expect(() => parseCoastlinesGeoJson("not-json")).toThrow("JSON");
    expect(() => parseCoastlinesGeoJson("x".repeat(COASTLINE_LIMITS.maxBytes + 1))).toThrow("サイズ");
  });

  it("最大Feature数・最大頂点数・最大深度を拒否する", () => {
    expect(() =>
      validateCoastlineCollection(
        collection(
          Array.from(
            { length: COASTLINE_LIMITS.maxFeatures + 1 },
            (_, index) =>
              feature({
                id: `edo-coastline-${String(index).padStart(4, "0")}`,
              }),
          ),
        ),
      ),
    ).toThrow("Feature数");
    const tooMany = Array.from({ length: COASTLINE_LIMITS.maxVerticesPerFeature + 1 }, () => [139.7, 35.6]);
    expect(() => validateCoastlineCollection({ type: "FeatureCollection", features: [{ ...feature(), geometry: { type: "LineString", coordinates: tooMany } }] })).toThrow();
    let nested: unknown = 1;
    for (let index = 0; index < COASTLINE_LIMITS.maxDepth + 2; index++) nested = [nested];
    expect(() => validateCoastlineCollection(nested)).toThrow("ネスト");
  });

  it("同一オリジンをcredentials omit・redirect error・タイムアウト付きで取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(collection()), { status: 200, headers: { "content-type": "application/geo+json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadCoastlines("/edo-history-map/")).resolves.toMatchObject({ type: "FeatureCollection" });
    expect(fetchMock).toHaveBeenCalledWith("/edo-history-map/data/edo-coastlines.geojson", expect.objectContaining({ credentials: "omit", redirect: "error", signal: expect.any(AbortSignal) }));
  });

  it("HTTP失敗・Content-Type不一致・Content-Length超過を固定エラーで拒否する", async () => {
    for (const response of [
      new Response("", { status: 404 }),
      new Response(JSON.stringify(collection()), { status: 200, headers: { "content-type": "text/html" } }),
      new Response(JSON.stringify(collection()), { status: 200, headers: { "content-type": "application/json", "content-length": String(COASTLINE_LIMITS.maxBytes + 1) } }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(loadCoastlines()).rejects.toThrow();
    }
  });

  it("タイムアウト時に外部詳細を露出せず拒否する", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => options.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))));
    const loading = loadCoastlines();
    const rejection = expect(loading).rejects.toThrow("読み込めませんでした");
    await vi.advanceTimersByTimeAsync(COASTLINE_LIMITS.fetchTimeoutMs);
    await rejection;
    vi.useRealTimers();
  });
});
