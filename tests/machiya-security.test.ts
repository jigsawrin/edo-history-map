import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseMachiyaAreasGeoJson } from "../src/machiya-areas";

const ROOT = join(__dirname, "..");

describe("町家領域の権利・公開ゲート", () => {
  it("approved台帳の変換後SHA-256と公開GeoJSONが一致する", () => {
    const ledger = readFileSync(join(ROOT, "DATA_SOURCES.yml"), "utf8");
    const data = readFileSync(
      join(ROOT, "public", "data", "edo-machiya-areas.geojson"),
    );
    const hash = createHash("sha256").update(data).digest("hex");
    expect(ledger).toContain("id: codh-edo-machiya-areas");
    expect(ledger).toContain("asset_type: historical-vector");
    expect(ledger).toContain(`converted_sha256: ${hash}`);
    expect(ledger).toContain("review_status: approved");
    expect(ledger).toContain("redistribution_allowed: true");
    expect(ledger).toContain("10.20676/00000446");
    expect(ledger).toContain("CC BY 4.0");
    expect(parseMachiyaAreasGeoJson(data.toString("utf8")).features).toHaveLength(
      28,
    );
  });

  it("公開データをapprovedの5 GeoJSONだけに限定し、原形式をGit追跡しない", () => {
    expect(readdirSync(join(ROOT, "public", "data")).sort()).toEqual([
      "edo-coastlines.geojson",
      "edo-machiya-areas.geojson",
      "edo-places.geojson",
      "kyoto-bakumatsu-places.geojson",
      "shiga-sengoku-places.geojson",
    ]);
    const tracked = execFileSync("git", ["ls-files"], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
    expect(
      tracked.filter((file) => /\.(?:zip|shp|shx|dbf|prj|gpkg)$/i.test(file)),
    ).toEqual([]);
  });

  it("監査が未承認vector、ハッシュ不一致、原形式、台帳未登録を拒否する", () => {
    const audit = readFileSync(
      join(ROOT, "scripts", "prepublish-audit.mjs"),
      "utf8",
    );
    for (const needle of [
      'assetType === "historical-vector"',
      "converted_sha256",
      "未承認歴史ベクターの公開",
      "台帳未登録データ",
      "原データ追跡",
      "原データ履歴",
      '".shp"',
      '".gpkg"',
      '".zip"',
    ]) {
      expect(audit).toContain(needle);
    }
  });

  it("従来の古地図画像承認ゲートとCSPを緩めていない", () => {
    const audit = readFileSync(
      join(ROOT, "scripts", "prepublish-audit.mjs"),
      "utf8",
    );
    for (const field of [
      "modification_allowed",
      "cropping_allowed",
      "georeferencing_allowed",
      "tiling_allowed",
      "original_sha256",
      "tile_manifest_sha256",
      "未承認歴史画像の公開",
    ]) {
      expect(audit).toContain(field);
    }
    const vite = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
    expect(vite).toContain("connect-src 'self'");
    expect(vite.match(/https:\/\//g)).toHaveLength(1);
  });

  it("アプリ・第三者通知・READMEに名称、DOI、CC BY 4.0、推定注意がある", () => {
    const combined = [
      "src/attribution.ts",
      "THIRD_PARTY_NOTICES.md",
      "README.md",
      "DISCLAIMER.md",
    ]
      .map((file) => readFileSync(join(ROOT, file), "utf8"))
      .join("\n");
    expect(combined).toContain("町家領域データセット");
    expect(combined).toContain("10.20676/00000446");
    expect(combined).toContain("CC BY 4.0");
    expect(combined).toContain("正確な地籍");
  });
});

describe("町家領域UIのアクセシビリティ", () => {
  it("チェックボックス、透明度、凡例、出典を標準HTMLで関連付ける", () => {
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    expect(html).toMatch(
      /<label[^>]*>[\s\S]*?id="machiya-visible"[\s\S]*?町家領域（推定）[\s\S]*?<\/label>/,
    );
    expect(html).toMatch(
      /id="machiya-opacity-slider"[\s\S]*?aria-labelledby="machiya-opacity-label"[\s\S]*?aria-valuetext="35パーセント"/,
    );
    expect(html).toMatch(/class="map-legend"[\s\S]*?現在地/);
    expect(html).toMatch(
      /class="machiya-description"[\s\S]*?href="https:\/\/codh\.rois\.ac\.jp\/edo-maps\/rekichizu\/index\.html\.ja"[\s\S]*?rel="noopener noreferrer"/,
    );
  });
});
