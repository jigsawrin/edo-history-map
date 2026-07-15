import { describe, it, expect } from "vitest";
import {
  parsePlacesGeoJson,
  sanitizeLinkUrl,
  ValidationError,
} from "../src/validate";
import { LIMITS } from "../src/config";

function makeFeature(overrides: Record<string, unknown> = {}) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [139.75, 35.68] },
    properties: {
      id: "1-001",
      name: "桜田御門",
      category: "施設",
      sheet: "御江戸大名小路絵図",
      source: "https://codh.rois.ac.jp/edo-maps/owariya/01/1849/1-001.html.ja",
    },
    ...overrides,
  };
}

function collection(features: unknown[]): string {
  return JSON.stringify({ type: "FeatureCollection", features });
}

describe("parsePlacesGeoJson", () => {
  it("正常な FeatureCollection を解析できる", () => {
    const result = parsePlacesGeoJson(collection([makeFeature()]));
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("桜田御門");
    expect(result[0]?.lat).toBeCloseTo(35.68);
    expect(result[0]?.sourceUrl).toContain("https://codh.rois.ac.jp/");
  });

  it("JSON でない文字列を拒否する", () => {
    expect(() => parsePlacesGeoJson("not json{{")).toThrow(ValidationError);
  });

  it("FeatureCollection 以外を拒否する", () => {
    expect(() => parsePlacesGeoJson('{"type":"Feature"}')).toThrow(
      ValidationError,
    );
    expect(() => parsePlacesGeoJson('{"type":"FeatureCollection"}')).toThrow(
      ValidationError,
    );
  });

  it("巨大な入力(サイズ上限超過)を拒否する", () => {
    const huge = "x".repeat(LIMITS.maxBytes + 1);
    expect(() => parsePlacesGeoJson(huge)).toThrow(ValidationError);
  });

  it("フィーチャ数の上限を超える GeoJSON を拒否する", () => {
    const features = Array.from({ length: LIMITS.maxFeatures + 1 }, () =>
      makeFeature(),
    );
    expect(() => parsePlacesGeoJson(collection(features))).toThrow(
      ValidationError,
    );
  });

  it("数値でない座標(null 等)を拒否する", () => {
    const bad = makeFeature({
      geometry: { type: "Point", coordinates: [null, 35.68] },
    });
    expect(() => parsePlacesGeoJson(collection([bad]))).toThrow(
      ValidationError,
    );
  });

  it("範囲外の緯度経度を拒否する", () => {
    const bad = makeFeature({
      geometry: { type: "Point", coordinates: [139.75, 95] },
    });
    expect(() => parsePlacesGeoJson(collection([bad]))).toThrow(
      ValidationError,
    );
    const bad2 = makeFeature({
      geometry: { type: "Point", coordinates: [200, 35.68] },
    });
    expect(() => parsePlacesGeoJson(collection([bad2]))).toThrow(
      ValidationError,
    );
  });

  it("Point 以外のジオメトリを拒否する", () => {
    const bad = makeFeature({
      geometry: {
        type: "LineString",
        coordinates: [
          [139.7, 35.6],
          [139.8, 35.7],
        ],
      },
    });
    expect(() => parsePlacesGeoJson(collection([bad]))).toThrow(
      ValidationError,
    );
  });

  it("対象地域外(妥当な世界座標)の点は読み飛ばす", () => {
    const outside = makeFeature({
      geometry: { type: "Point", coordinates: [135.5, 34.7] }, // 大阪付近
    });
    const result = parsePlacesGeoJson(collection([makeFeature(), outside]));
    expect(result).toHaveLength(1);
  });

  it("長すぎる文字列プロパティを拒否する", () => {
    const bad = makeFeature({
      properties: {
        id: "1",
        name: "x".repeat(LIMITS.maxStringLength + 1),
        category: "",
        sheet: "",
        source: "",
      },
    });
    expect(() => parsePlacesGeoJson(collection([bad]))).toThrow(
      ValidationError,
    );
  });

  it("HTML タグを含む地名も文字列としてそのまま保持する(実行しない)", () => {
    const withHtml = makeFeature({
      properties: {
        id: "1",
        name: '<img src=x onerror="alert(1)">',
        category: "<script>alert(2)</script>",
        sheet: "",
        source: "",
      },
    });
    const result = parsePlacesGeoJson(collection([withHtml]));
    expect(result[0]?.name).toBe('<img src=x onerror="alert(1)">');
  });
});

describe("sanitizeLinkUrl", () => {
  it("許可ドメインの https URL を受け入れる", () => {
    expect(sanitizeLinkUrl("https://codh.rois.ac.jp/edo-maps/")).toBe(
      "https://codh.rois.ac.jp/edo-maps/",
    );
  });

  it("javascript: URL を拒否する", () => {
    expect(sanitizeLinkUrl("javascript:alert(1)")).toBeNull();
  });

  it("data: URL を拒否する", () => {
    expect(sanitizeLinkUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("http(平文) URL を拒否する", () => {
    expect(sanitizeLinkUrl("http://codh.rois.ac.jp/edo-maps/")).toBeNull();
  });

  it("許可リスト外のドメインを拒否する", () => {
    expect(sanitizeLinkUrl("https://example.com/x")).toBeNull();
  });

  it("ドメイン偽装(codh.rois.ac.jp.evil.example)を拒否する", () => {
    expect(sanitizeLinkUrl("https://codh.rois.ac.jp.evil.example/")).toBeNull();
  });

  it("文字列以外・不正な URL を拒否する", () => {
    expect(sanitizeLinkUrl(123)).toBeNull();
    expect(sanitizeLinkUrl("::::not a url")).toBeNull();
  });
});
