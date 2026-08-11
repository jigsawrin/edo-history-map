import { describe, expect, it } from "vitest";
import projection from "../src/edo-card-projection.json";
import {
  createEdoCardResolver,
  validateEdoCardProjection,
  type EdoCardProjection,
} from "../src/edo-card-projection";
import type { PlaceFeature } from "../src/validate";

const place: PlaceFeature = {
  name: "桜田御門",
  category: "施設",
  sheet: "御江戸大名小路絵図",
  entryId: "1-001",
  sourceUrl: "https://codh.rois.ac.jp/edo-maps/owariya/01/1849/1-001.html.ja",
  lat: 35.68,
  lon: 139.75,
};
const binding = {
  sourceRecordId: place.entryId,
  sourceIndex: 0,
  featureSha256: "a".repeat(64),
};

function value(overrides: EdoCardProjection["overrides"]): EdoCardProjection {
  return {
    ...projection,
    schemaVersion: 1,
    renderableCardCount: 8788 - overrides.filter((item) => item.hidden).length,
    overrides,
  };
}

describe("Edo card projection", () => {
  it("keeps the checked-in runtime projection minimal with one approved rename", () => {
    expect(validateEdoCardProjection(projection)).toEqual(projection);
    expect(projection).toEqual({
      schemaVersion: 1,
      sourceDataSha256: "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4",
      sourceFeatureCount: 8788,
      applicableSourceCount: 8788,
      renderableCardCount: 8788,
      overrides: [{
        sourceRecordId: "20-246",
        sourceIndex: 4207,
        featureSha256: "1b1047dfd21bedab30cabdbbbd95dc95faf7636443215514bf15679d6756b232",
        displayName: "太田摂津守",
        hidden: false,
      }],
    });
  });

  it("resolves the approved 20-246 heading and preserves its source name", () => {
    const target = { ...place, entryId: "20-246", name: "大田摂津守" };
    expect(createEdoCardResolver(projection)(target)).toEqual({
      hidden: false,
      displayName: "太田摂津守",
      sourceName: "大田摂津守",
    });
  });

  it("resolves no override, approved rename, and approved hide by entryId without mutating the raw source", () => {
    const original = structuredClone(place);
    const plain = createEdoCardResolver(projection)(place);
    const renamed = createEdoCardResolver(value([{ ...binding, displayName: "承認済み表示名", hidden: false }]))(place);
    const hidden = createEdoCardResolver(value([{ ...binding, displayName: null, hidden: true }]))(place);
    expect(plain).toEqual({ hidden: false, displayName: place.name, sourceName: null });
    expect(renamed).toEqual({ hidden: false, displayName: "承認済み表示名", sourceName: place.name });
    expect(hidden.hidden).toBe(true);
    expect(place).toEqual(original);
  });

  it.each([
    ["unknown root", { ...projection, reviewer: "private" }],
    ["wrong source SHA", { ...projection, sourceDataSha256: "0".repeat(64) }],
    ["wrong source count", { ...projection, sourceFeatureCount: 8787 }],
    ["negative applicable", { ...projection, applicableSourceCount: -1 }],
    ["applicable above source", { ...projection, applicableSourceCount: 8789 }],
    ["negative renderable", { ...projection, renderableCardCount: -1 }],
    ["renderable above applicable", { ...projection, applicableSourceCount: 8787 }],
    ["wrong renderable equation", { ...projection, renderableCardCount: 8787 }],
    ["unknown override", value([{ ...binding, displayName: "表示名", hidden: false, evidence: "private" } as never])],
    ["bad feature SHA", value([{ ...binding, featureSha256: "bad", displayName: "表示名", hidden: false }])],
    ["empty ID", value([{ ...binding, sourceRecordId: "", displayName: "表示名", hidden: false }])],
    ["unsafe rename", value([{ ...binding, displayName: "<b>表示名</b>", hidden: false }])],
    ["empty rename", value([{ ...binding, displayName: "", hidden: false }])],
    ["hide with name", value([{ ...binding, displayName: "表示名", hidden: true }])],
    ["rename without name", value([{ ...binding, displayName: null, hidden: false }])],
    ["duplicate index", value([
      { ...binding, displayName: "表示名", hidden: false },
      { ...binding, sourceRecordId: "1-002", displayName: "別名", hidden: false },
    ])],
    ["unordered index", value([
      { ...binding, sourceRecordId: "1-002", sourceIndex: 1, displayName: "別名", hidden: false },
      { ...binding, displayName: "表示名", hidden: false },
    ])],
  ])("rejects %s", (_name, invalid) => {
    expect(() => validateEdoCardProjection(invalid)).toThrow();
  });
});
