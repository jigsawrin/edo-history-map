import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateHistoricalRasterManifest } from "../src/historical-raster-manifest.mjs";
import { verifyHistoricalRasterPackage } from "../scripts/historical-raster-package.mjs";

const FIXTURE = join(__dirname, "fixtures", "historical-rasters", "project-grid");
const temporary: string[] = [];
function copyFixture(): string { const root = mkdtempSync(join(tmpdir(), "edo-raster-")); temporary.push(root); cpSync(FIXTURE, root, { recursive: true }); return root; }
function readManifest(root = FIXTURE): Record<string, unknown> { return JSON.parse(readFileSync(join(root, "tile-manifest.json"), "utf8")) as Record<string, unknown>; }
function writeManifest(root: string, manifest: Record<string, unknown>): void { writeFileSync(join(root, "tile-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"); }
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("古地図tile manifest", () => {
  it("決定的な自作fixtureのSHA・bytes・magic bytes・寸法・件数を検証する", () => {
    const first = verifyHistoricalRasterPackage({ manifestPath: join(FIXTURE, "tile-manifest.json"), tileRoot: join(FIXTURE, "tiles") });
    const second = verifyHistoricalRasterPackage({ manifestPath: join(FIXTURE, "tile-manifest.json"), tileRoot: join(FIXTURE, "tiles") });
    expect(first).toMatchObject({ tileCount: 2, totalBytes: 2998 });
    expect(second.manifestSha256).toBe(first.manifestSha256);
    expect(first.manifestSha256).toBe(createHash("sha256").update(readFileSync(join(FIXTURE, "tile-manifest.json"))).digest("hex"));
  });

  it.each([
    ["path traversal", "../1/0/0.png"],
    ["absolute path", "/1/0/0.png"],
    ["backslash", "1\\0\\0.png"],
  ])("%sを拒否する", (_label, path) => {
    const manifest = readManifest(); ((manifest.files as Record<string, unknown>[])[0]!).path = path;
    expect(() => validateHistoricalRasterManifest(manifest)).toThrow();
  });

  it.each([
    ["不正zoom", (manifest: Record<string, unknown>) => { manifest.maxZoom = 0; }],
    ["不正bounds", (manifest: Record<string, unknown>) => { manifest.bounds = { south: 36, west: 140, north: 35, east: 139 }; }],
    ["総容量超過", (manifest: Record<string, unknown>) => { manifest.totalBytes = 101 * 1024 * 1024; }],
  ])("%sを拒否する", (_label, mutate) => { const manifest = readManifest(); mutate(manifest); expect(() => validateHistoricalRasterManifest(manifest)).toThrow(); });

  it("SHA不一致とbytes不一致を拒否する", () => {
    for (const field of ["sha256", "bytes"] as const) {
      const root = copyFixture(); const manifest = readManifest(root); const file = (manifest.files as Record<string, unknown>[])[0]!;
      file[field] = field === "sha256" ? "f".repeat(64) : Number(file.bytes) + 1;
      if (field === "bytes") manifest.totalBytes = (manifest.files as Record<string, unknown>[]).reduce((sum, item) => sum + Number(item.bytes), 0);
      writeManifest(root, manifest);
      expect(() => verifyHistoricalRasterPackage({ manifestPath: join(root, "tile-manifest.json"), tileRoot: join(root, "tiles") })).toThrow(field === "sha256" ? /SHA-256/u : /bytes/u);
    }
  });

  it("欠損tileとmanifest外orphanを拒否する", () => {
    const missing = copyFixture(); unlinkSync(join(missing, "tiles", "1", "0", "0.png"));
    expect(() => verifyHistoricalRasterPackage({ manifestPath: join(missing, "tile-manifest.json"), tileRoot: join(missing, "tiles") })).toThrow(/実ファイル数|欠損/u);
    const orphan = copyFixture(); mkdirSync(join(orphan, "tiles", "1", "0"), { recursive: true }); writeFileSync(join(orphan, "tiles", "1", "0", "1.png"), readFileSync(join(FIXTURE, "tiles", "1", "0", "0.png")));
    expect(() => verifyHistoricalRasterPackage({ manifestPath: join(orphan, "tile-manifest.json"), tileRoot: join(orphan, "tiles") })).toThrow(/orphan/u);
  });

  it("SVG・不正magic bytes・不正画像寸法を拒否する", () => {
    const svg = copyFixture(); writeFileSync(join(svg, "tiles", "bad.svg"), "<svg></svg>");
    expect(() => verifyHistoricalRasterPackage({ manifestPath: join(svg, "tile-manifest.json"), tileRoot: join(svg, "tiles") })).toThrow(/禁止/u);
    const magic = copyFixture(); writeFileSync(join(magic, "tiles", "1", "0", "0.png"), Buffer.alloc(20));
    const magicManifest = readManifest(magic); const magicFile = (magicManifest.files as Record<string, unknown>[])[0]!; magicFile.bytes = 20; magicFile.sha256 = createHash("sha256").update(Buffer.alloc(20)).digest("hex"); magicManifest.totalBytes = (magicManifest.files as Record<string, unknown>[]).reduce((sum, file) => sum + Number(file.bytes), 0); writeManifest(magic, magicManifest);
    expect(() => verifyHistoricalRasterPackage({ manifestPath: join(magic, "tile-manifest.json"), tileRoot: join(magic, "tiles") })).toThrow(/magic bytes/u);
    const dimensions = copyFixture(); const tilePath = join(dimensions, "tiles", "1", "0", "0.png"); const tile = readFileSync(tilePath); tile.writeUInt32BE(1, 16); writeFileSync(tilePath, tile);
    const dimensionsManifest = readManifest(dimensions); const dimensionsFile = (dimensionsManifest.files as Record<string, unknown>[])[0]!; dimensionsFile.sha256 = createHash("sha256").update(tile).digest("hex"); writeManifest(dimensions, dimensionsManifest);
    expect(() => verifyHistoricalRasterPackage({ manifestPath: join(dimensions, "tile-manifest.json"), tileRoot: join(dimensions, "tiles") })).toThrow(/256x256/u);
  });
});
