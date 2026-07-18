import { describe, expect, it } from "vitest";
import { hasDistributedControlPoints, validateHistoricalRasterControlPoints, validateHistoricalRasterGeoreference } from "../src/historical-raster-metadata.mjs";
import controlPoints from "./fixtures/historical-rasters/project-grid/control-points.json";
import georeference from "./fixtures/historical-rasters/project-grid/georeference.json";

describe("古地図基準点・ジオリファレンスmetadata", () => {
  it("自作fixtureの四隅へ分散した一意な基準点と出典を検証する", () => {
    const validated = validateHistoricalRasterControlPoints(controlPoints);
    expect(validated.points).toHaveLength(4); expect(hasDistributedControlPoints(validated)).toBe(true);
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
});
