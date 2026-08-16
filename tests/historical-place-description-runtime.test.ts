import { describe, expect, it } from "vitest";
import projection from "../scripts/historical-place-description-public-projection.json";
import {
  createHistoricalDescriptionResolver,
  resolveEdoHistoricalDescription,
  resolveHistoricalDescription,
  type HistoricalDescriptionSourceIdentity,
} from "../src/historical-place-description";

const identity: HistoricalDescriptionSourceIdentity = {
  datasetId: "codh-edo-maps-places",
  sourceIndex: 7346,
  entryId: "4-349",
  sourceFeatureSha256: "e4158b329af9e3b357e89c66896ddaa03c2b1ada2a9961d6b0c266ed9f3118b1",
};

const sensojiIdentity: HistoricalDescriptionSourceIdentity = {
  datasetId: "codh-edo-maps-places",
  sourceIndex: 4847,
  entryId: "21-497",
  sourceFeatureSha256: "4cd349c5d383c0b221ff2d19027f08a03176917d3493560403ea69d5d1836611",
};

const nihonbashiIdentity: HistoricalDescriptionSourceIdentity = {
  datasetId: "codh-edo-maps-places",
  sourceIndex: 3652,
  entryId: "2-159",
  sourceFeatureSha256: "700aef29e635de8c8fb3b043b418359be29cf8e68a45dae0c1f11817bc95a227",
};

describe("historical description runtime resolver", () => {
  it("generated public projectionのexact source identityだけを解決する", () => {
    expect(resolveHistoricalDescription(identity)?.canonicalContentSha256).toBe(
      "15d5d4d29ca600e712fd5cd94b9ae64980ac3da758e78da46766eb03f003b5b9",
    );
    expect(resolveEdoHistoricalDescription(7346, "4-349")?.text).toContain("徳川将軍家");
    expect(resolveHistoricalDescription(sensojiIdentity)?.canonicalContentSha256).toBe(
      "caf61089088c9d60eba280a141642ca82cf1d2b4f0c26731c82aba3ffe62bafa",
    );
    expect(resolveEdoHistoricalDescription(4847, "21-497")?.text).toContain("浅草観音");
    expect(resolveHistoricalDescription(nihonbashiIdentity)?.canonicalContentSha256).toBe(
      "e0364766da0e2a550a83c582d0f7e11fa7127f1c96f75ed7c53fb9dfa445ae76",
    );
    expect(resolveEdoHistoricalDescription(3652, "2-159")?.text).toContain("魚河岸");
  });

  it.each([
    [{ ...identity, sourceIndex: 7345 }, "wrong sourceIndex"],
    [{ ...identity, entryId: "4-348" }, "wrong entryId"],
    [{ ...identity, sourceFeatureSha256: "a".repeat(64) }, "wrong feature SHA"],
  ])("%sでは解決しない", (candidate) => {
    expect(resolveHistoricalDescription(candidate as HistoricalDescriptionSourceIdentity)).toBeNull();
  });

  it("同名やrelation情報を入力に取らず別recordへ波及しない", () => {
    expect(resolveEdoHistoricalDescription(0, "4-349")).toBeNull();
    expect(resolveEdoHistoricalDescription(7346, "same-name-record")).toBeNull();
    expect(resolveEdoHistoricalDescription(6727, "3-263")).toBeNull();
  });

  it("stale public projectionはfail closedにする", () => {
    expect(() => createHistoricalDescriptionResolver({
      ...projection,
      sourceDataSha256: "a".repeat(64),
    })).toThrow(/stale or invalid/u);
  });
});
