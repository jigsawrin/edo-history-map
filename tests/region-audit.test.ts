import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("地域パック公開ゲート", () => {
  it("本番地域manifestは東京・江戸、京都、滋賀の3件である", () => {
    const edo = JSON.parse(read("src/regions/edo-pack.json"));
    const kyoto = JSON.parse(read("src/regions/kyoto-pack.json"));
    const shiga = JSON.parse(read("src/regions/shiga-pack.json"));
    expect(edo.region.id).toBe("edo");
    expect(edo.region.enabled).toBe(true);
    expect(edo.region.enabledEraIds).toEqual(["modern", "edo-late"]);
    expect(kyoto.region.id).toBe("kyoto");
    expect(kyoto.region.enabled).toBe(true);
    expect(kyoto.region.defaultEraId).toBe("bakumatsu");
    expect(kyoto.region.enabledEraIds).toEqual(["modern", "bakumatsu"]);
    const edoText = JSON.stringify(edo);
    const kyotoText = JSON.stringify(kyoto);
    expect(edoText).not.toContain("project-kyoto-bakumatsu-places");
    expect(kyotoText).not.toContain("codh-edo-");
    expect(shiga.region.id).toBe("shiga");
    expect(shiga.region.enabledEraIds).toEqual(["modern", "sengoku"]);
    expect(JSON.stringify(shiga)).not.toContain("codh-edo-");
    expect(`${edoText}${kyotoText}${JSON.stringify(shiga)}`).not.toContain("osaka");
  });

  it("承認済み5データだけを固定manifestへ登録する", () => {
    const manifest = JSON.parse(read("src/dataset-manifest.json"));
    expect(manifest.map((item: { id: string }) => item.id)).toEqual([
      "codh-edo-maps-places",
      "codh-edo-machiya-areas",
      "codh-edo-coastline",
      "project-kyoto-bakumatsu-places",
      "project-shiga-sengoku-places",
    ]);
    for (const item of manifest) {
      expect(item.path).toMatch(/^data\/[a-z0-9.-]+\.geojson$/);
      expect(item.path).not.toContain("..");
      expect(item.sourceId).toBe(item.id);
      expect(item.publicSha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("既存GeoJSONの内容とSHAを変更していない", () => {
    const expected = new Map([
      ["data/edo-places.geojson", "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4"],
      ["data/edo-machiya-areas.geojson", "516fead3b082499ab1fb9d3c50060fc88812531530e9f86f63bcffff81a70bd6"],
      ["data/edo-coastlines.geojson", "c67be67ed6213021a7333774300bc196a52195894130f7670ede45e9a2124a31"],
    ]);
    for (const [path, hash] of expected) {
      const actual = createHash("sha256")
        .update(readFileSync(join(ROOT, "public", path)))
        .digest("hex");
      expect(actual).toBe(hash);
    }
  });

  it("DATA_SOURCES台帳の既存3 approved IDとlocal_filesを参照する", () => {
    const ledger = read("DATA_SOURCES.yml");
    for (const [id, file] of [
      ["codh-edo-maps-places", "public/data/edo-places.geojson"],
      ["codh-edo-machiya-areas", "public/data/edo-machiya-areas.geojson"],
      ["codh-edo-coastline", "public/data/edo-coastlines.geojson"],
    ]) {
      const start = ledger.indexOf(`- id: ${id}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = ledger.indexOf("\n  - id: ", start + 1);
      const entry = ledger.slice(start, next < 0 ? undefined : next);
      expect(entry).toContain("review_status: approved");
      expect(entry).toContain(file);
    }
  });

  it("公開前監査が地域・台帳・SHA・CSP・Service Workerを検査する", () => {
    const audit = read("scripts/prepublish-audit.mjs");
    for (const token of [
      "era-catalog.json",
      "dataset-manifest.json",
      "enabledRegionCount",
      "defaultEraId",
      "enabledEraIds",
      "approved台帳登録",
      "local_files",
      "publicSha256",
      "sourceId",
      "viteConnectSources",
      "cspDirectives",
      "Service Worker",
      "未承認歴史画像の公開",
    ]) {
      expect(audit).toContain(token);
    }
  });
});
