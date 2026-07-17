import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const audit = readFileSync(
  join(ROOT, "scripts", "prepublish-audit.mjs"),
  "utf8",
);

describe("京都・幕末公開前監査", () => {
  it("地域・年代・データセット・出典の固定ゲートを持つ", () => {
    for (const token of [
      "KYOTO_PACK_FILE",
      "bakumatsuDefinition.startYear !== 1853",
      "bakumatsuDefinition.endYear !== 1868",
      "KYOTO_DATASET_ID",
      "source_manifest",
      "京都パックがEDO専用データを参照しています",
      "EDOパックが京都専用データを参照しています",
      "KYOTO_SOURCE_ALLOWED_ORIGINS.has(url.origin)",
      "sourceIds.has(sourceId)",
    ]) {
      expect(audit).toContain(token);
    }
  });

  it("GeoJSONとキュレーションを読み取り専用で完全一致比較する", () => {
    for (const token of [
      "buildKyotoGeoJson()",
      "rebuilt.output !== publicText",
      "rebuilt.sha256 !== publicSha",
      "ledgerOriginalSha !== curationSha",
      "publicData.features.length !== curationData.length",
      'feature?.geometry?.type !== "Point"',
      'properties?.sourceId !== KYOTO_DATASET_ID',
      'properties?.eraId !== "bakumatsu"',
      'properties?.coordinateConfidence === "low"',
      "curatedCoordinates.has(coordinateKey)",
      "publicCoordinates.has(coordinateKey)",
      "hasUnsafeHistoricalText(value)",
    ]) {
      expect(audit).toContain(token);
    }
    expect(audit).not.toMatch(
      /execFileSync\([^\n]*build-kyoto-bakumatsu-places/,
    );
  });

  it("既存の公開安全ゲートを維持する", () => {
    for (const token of [
      "viteConnectSources",
      'viteConnectSources[0] !== "\'self\'"',
      "Service Worker",
      "Actions 未固定参照",
      "未承認歴史画像の公開",
      "ソースマップ露出",
      "外部fetch",
      "京都原画像",
      "京都原資料",
    ]) {
      expect(audit).toContain(token);
    }
    expect(audit).toContain('"dist/places/kyoto/index.html"');
    expect(audit).toContain("!generatedKyotoStaticPages.has(file.rel)");
  });
});
