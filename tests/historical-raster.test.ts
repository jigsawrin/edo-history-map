import { describe, expect, it } from "vitest";
import {
  addHistoricalImageLayer,
  getApprovedHistoricalRasters,
  type HistoricalRasterDefinition,
} from "../src/historical-raster";

function raster(
  overrides: Partial<HistoricalRasterDefinition> = {},
): HistoricalRasterDefinition {
  return {
    id: "safe-raster",
    eraId: "edo-late",
    title: "権利確認済みテスト定義",
    localTilePath: "data/historical-rasters/safe/{z}/{x}/{y}.png",
    minZoom: 10,
    maxZoom: 18,
    bounds: [
      [35.4, 139.4],
      [35.95, 140.05],
    ],
    opacity: 0.8,
    attributionId: "safe-attribution",
    sourceId: "safe-source",
    georeferenceMethod: "control-points",
    estimatedErrorMeters: 50,
    reviewStatus: "approved",
    ...overrides,
  };
}

describe("歴史画像の実行時登録ゲート", () => {
  it("approvedかつ公開前承認sourceに一致する定義だけを登録する", () => {
    const definitions = [
      raster(),
      raster({ id: "pending", reviewStatus: "pending" }),
      raster({ id: "rejected", reviewStatus: "rejected" }),
    ];
    expect(getApprovedHistoricalRasters(definitions, ["safe-source"]))
      .toHaveLength(1);
    expect(getApprovedHistoricalRasters(definitions, [])).toHaveLength(0);
  });

  it("外部URL、親ディレクトリ参照、必須メタデータ不足を拒否する", () => {
    expect(
      getApprovedHistoricalRasters(
        [raster({ localTilePath: "https://example.invalid/{z}/{x}/{y}.png" })],
        ["safe-source"],
      ),
    ).toHaveLength(0);
    expect(
      getApprovedHistoricalRasters(
        [raster({ localTilePath: "data/historical-rasters/../x.png" })],
        ["safe-source"],
      ),
    ).toHaveLength(0);
    expect(
      getApprovedHistoricalRasters(
        [raster({ georeferenceMethod: "" })],
        ["safe-source"],
      ),
    ).toHaveLength(0);
    expect(
      getApprovedHistoricalRasters(
        [raster({ bounds: [[36, 140], [35, 139]] })],
        ["safe-source"],
      ),
    ).toHaveLength(0);
  });

  it("現時点の実行時レジストリには画像がなく、安全装置はnullを返す", () => {
    expect(getApprovedHistoricalRasters()).toHaveLength(0);
    expect(addHistoricalImageLayer()).toBeNull();
    expect(addHistoricalImageLayer("unknown")).toBeNull();
  });
});
