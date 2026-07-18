import { describe, expect, it } from "vitest";
import { evaluateHistoricalRasterQualityGate, greatCircleDistanceMeters, hasDistributedControlPoints, summarizeResidualMeters, summarizeValidationResiduals, validateHistoricalRasterControlPoints, validateHistoricalRasterGeoreference } from "../src/historical-raster-metadata.mjs";
import controlPoints from "./fixtures/historical-rasters/project-grid/control-points.json";
import georeference from "./fixtures/historical-rasters/project-grid/georeference.json";

describe("古地図基準点・ジオリファレンスmetadata", () => {
  it("自作fixtureの四隅へ分散した一意な基準点と出典を検証する", () => {
    const validated = validateHistoricalRasterControlPoints(controlPoints);
    expect(validated.schemaVersion).toBe(2); expect(validated.points).toHaveLength(4); expect(hasDistributedControlPoints(validated)).toBe(true);
  });
  it.each([
    ["画像外pixel", (value: typeof controlPoints) => { value.points[0]!.pixelX = value.imageWidth; }],
    ["基準点ID重複", (value: typeof controlPoints) => { value.points[1]!.id = value.points[0]!.id; }],
    ["同一点重複", (value: typeof controlPoints) => { value.points[1]!.latitude = value.points[0]!.latitude; value.points[1]!.longitude = value.points[0]!.longitude; }],
    ["出典なし", (value: typeof controlPoints) => { value.points[0]!.sourceIds = []; }],
  ])("%sを拒否する", (_label, mutate) => { const value = structuredClone(controlPoints); mutate(value); expect(() => validateHistoricalRasterControlPoints(value)).toThrow(); });
  it("変換方式・ソフト・誤差・SHAを固定georeference metadataで検証する", () => {
    expect(validateHistoricalRasterGeoreference(georeference)).toMatchObject({ rasterId: "project-grid", method: "projective", controlPointCount: 4, maximumErrorMeters: 0 });
  });
  it("最大誤差より大きい平均誤差を拒否する", () => {
    const value = structuredClone(georeference); value.meanErrorMeters = 10;
    expect(() => validateHistoricalRasterGeoreference(value)).toThrow(/誤差値/u);
  });

  it("transform/validation/hold/rejectedを分離し、危険なtransformを拒否する", () => {
    const base = validateHistoricalRasterControlPoints(controlPoints);
    const makeV2 = (role: string) => ({ ...base, points: [{ ...base.points[0], role, ...(role === "hold" || role === "rejected" ? { rejectionReasonJa: "公的根拠が不足するため不採用。" } : {}) }] });
    for (const role of ["transform", "validation", "hold", "rejected"]) expect(validateHistoricalRasterControlPoints(makeV2(role)).points[0]!.role).toBe(role);
    for (const mutation of [
      { confidence: "low" },
      { movedStatus: "moved" },
      { currentExistence: "uncertain" },
      { evidenceUrls: [] },
    ]) expect(() => validateHistoricalRasterControlPoints({ ...base, points: [{ ...base.points[0], ...mutation }] })).toThrow();
  });

  it("schema v1基準点は根拠を捏造せずholdへ安全移行する", () => {
    const legacy = { schemaVersion: 1, rasterId: "legacy-grid", imageWidth: 100, imageHeight: 100, points: [{ id: "cp-legacy", pixelX: 10, pixelY: 10, latitude: 35, longitude: 139, basisJa: "旧schemaの点", confidence: "high", sourceIds: ["legacy-source"] }] };
    expect(validateHistoricalRasterControlPoints(legacy).points[0]).toMatchObject({ role: "hold", currentExistence: "uncertain", movedStatus: "unknown", evidenceUrls: [] });
  });

  it("transformとvalidationの同一pixel利用および未承認sourceを拒否する", () => {
    const base = validateHistoricalRasterControlPoints(controlPoints);
    expect(() => validateHistoricalRasterControlPoints({ ...base, points: [{ ...base.points[0], role: "transform" }, { ...base.points[1], id: "validation-copy", role: "validation", pixelX: base.points[0]!.pixelX, pixelY: base.points[0]!.pixelY }] })).toThrow(/重複/u);
    expect(() => validateHistoricalRasterControlPoints(base, { approvedSourceIds: ["different-source"] })).toThrow(/未承認/u);
  });

  it("緯度を考慮した測地距離と平均・中央値・P90・最大を計算する", () => {
    expect(greatCircleDistanceMeters({ latitude: 35.68, longitude: 139.75 }, { latitude: 35.68, longitude: 139.751 })).toBeGreaterThan(80);
    expect(greatCircleDistanceMeters({ latitude: 35.68, longitude: 139.75 }, { latitude: 35.68, longitude: 139.751 })).toBeLessThan(100);
    expect(summarizeResidualMeters([10, 20, 30, 100])).toMatchObject({ count: 4, mean: 40, median: 25, p90: 100, maximum: 100 });
    expect(() => summarizeResidualMeters([])).toThrow(); expect(() => summarizeResidualMeters([Number.NaN])).toThrow(); expect(() => summarizeResidualMeters([Number.POSITIVE_INFINITY])).toThrow();
  });

  it("公開誤差はtransformを除外してvalidationだけから算出する", () => {
    const result = summarizeValidationResiduals([
      { role: "transform", expected: { latitude: 35, longitude: 139 }, actual: { latitude: 36, longitude: 140 } },
      { role: "validation", expected: { latitude: 35.68, longitude: 139.75 }, actual: { latitude: 35.68, longitude: 139.751 } },
    ]);
    expect(result.count).toBe(1); expect(result.maximum).toBeLessThan(100);
  });

  it("品質ゲートの全条件と個別失敗理由を固定する", () => {
    const passing = { rightsApproved: true, commercialUseCompatible: true, attributionComplete: true, transformPointCount: 8, validationPointCount: 4, transformDistributed: true, validationDistributed: true, validationMeanErrorMeters: 100, validationMedianErrorMeters: 75, validationMaximumErrorMeters: 250, visualIntegrityPassed: true, textReadable: true, boundsConfirmed: true, totalTileBytes: 50 * 1024 * 1024, packageVerified: true };
    expect(evaluateHistoricalRasterQualityGate(passing)).toEqual({ qualityGateVersion: 1, passed: true, failures: [] });
    for (const [field, value, failure] of [["transformPointCount", 7, "transform-count"], ["validationPointCount", 3, "validation-count"], ["transformDistributed", false, "transform-distribution"], ["validationMeanErrorMeters", 151, "validation-mean"], ["validationMedianErrorMeters", 101, "validation-median"], ["validationMaximumErrorMeters", 351, "validation-maximum"], ["visualIntegrityPassed", false, "visual-integrity"], ["totalTileBytes", 101 * 1024 * 1024, "tile-capacity"], ["attributionComplete", false, "attribution"]] as const) {
      expect(evaluateHistoricalRasterQualityGate({ ...passing, [field]: value }).failures).toContain(failure);
    }
  });

  it("georeference schema v2で独立validation統計と品質ゲートを固定する", () => {
    const value = { ...structuredClone(georeference), schemaVersion: 2, controlPointCount: 8, validationPointCount: 4, validationMeanErrorMeters: 80, validationMedianErrorMeters: 70, validationP90ErrorMeters: 120, validationMaximumErrorMeters: 140, qualityGateVersion: 1, qualityGatePassed: true };
    expect(validateHistoricalRasterGeoreference(value)).toMatchObject({ schemaVersion: 2, validationPointCount: 4, qualityGatePassed: true });
    value.validationPointCount = 3;
    expect(() => validateHistoricalRasterGeoreference(value)).toThrow(/8 transform点と4 validation点/u);
  });
});
