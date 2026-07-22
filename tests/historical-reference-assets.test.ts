import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditHistoricalReferenceAssetRepository,
  createHistoricalReferenceAssetStaticManifest,
  findRuntimeHistoricalReferenceAssetReferences,
  loadHistoricalReferenceAssetCatalog,
  summarizeHistoricalReferenceAssetCatalog,
  validateHistoricalReferenceAssetCatalog,
  verifyHistoricalReferenceAssetFiles,
} from "../scripts/historical-reference-assets.mjs";

const ROOT = join(__dirname, "..");
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

const ORIGINAL_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DERIVED_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

function tinyPng(width = 2, height = 2, red = 64) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = red;
      row[offset + 1] = x * 30;
      row[offset + 2] = y * 30;
      row[offset + 3] = 255;
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const LOSSLESS_WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");
const LOSSY_WEBP = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA", "base64");
const bufferSha256 = (value: Buffer) => createHash("sha256").update(value).digest("hex");

const EMPTY_CATALOG = Object.freeze({
  schemaVersion: 1,
  catalogStatus: "empty-foundation",
  reviewedAt: null,
  assets: [],
});

const EMPTY_DISPLAY = Object.freeze({
  schemaVersion: 1,
  catalogStatus: "empty-foundation",
  reviewedAt: null,
  maps: [],
});

const EMPTY_CANDIDATES = Object.freeze({
  schemaVersion: 3,
  reviewedAt: "2026-01-01",
  commercialContextJa: "試験用",
  candidates: [],
});

/** Test-only fixture. Never write into production data-curation assets. */
function assetFixture(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === "string" ? overrides.id : "test-fixture-reference-asset-a";
  const base = {
    id,
    sourceId: "test-fixture-candidate-a",
    title: { ja: "試験用参考画像A" },
    description: { ja: "検証専用の架空参考画像です。" },
    rightsReviewStatus: "pending",
    technicalReviewStatus: "in-review",
    publicationStatus: "candidate",
    licenseCode: "CC-BY-4.0",
    licenseCategory: "cc-by",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
    attribution: { ja: "試験用帰属表示" },
    derivativeDisclosure: { ja: "試験用派生開示" },
    commercialUseAllowed: true,
    redistributionAllowed: true,
    modificationAllowed: true,
    croppingAllowed: true,
    originalFile: {
      fileName: "original.jpg",
      mimeType: "image/jpeg",
      width: 1000,
      height: 800,
      bytes: 12345,
      sha256: ORIGINAL_SHA,
      rawPath: `data-raw/historical-reference-assets/${id}/original.jpg`,
    },
    crop: {
      sourceWidth: 1000,
      sourceHeight: 800,
      x: 10,
      y: 20,
      width: 400,
      height: 300,
      rotationDegrees: 0,
    },
    removedElements: ["ruler", "color-chart"],
    preservesHistoricalContent: true,
    cropReviewNote: { ja: "定規とカラーチャートのみ除去" },
    derivedFile: {
      mimeType: "image/png",
      width: 400,
      height: 300,
      bytes: 6789,
      sha256: DERIVED_SHA,
      derivedPath: `data-derived/historical-reference-assets/${id}/derived.png`,
    },
  };
  return {
    ...base,
    ...overrides,
    originalFile: {
      ...base.originalFile,
      ...((overrides.originalFile as Record<string, unknown> | undefined) ?? {}),
      rawPath:
        ((overrides.originalFile as { rawPath?: string } | undefined)?.rawPath) ??
        `data-raw/historical-reference-assets/${(overrides.id as string | undefined) ?? id}/original.jpg`,
    },
    crop: {
      ...base.crop,
      ...((overrides.crop as Record<string, unknown> | undefined) ?? {}),
    },
    derivedFile:
      overrides.derivedFile === null
        ? undefined
        : {
            ...base.derivedFile,
            ...((overrides.derivedFile as Record<string, unknown> | undefined) ?? {}),
            derivedPath:
              ((overrides.derivedFile as { derivedPath?: string } | undefined)?.derivedPath) ??
              `data-derived/historical-reference-assets/${(overrides.id as string | undefined) ?? id}/derived.png`,
          },
  };
}

function publishedAsset(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === "string" ? overrides.id : "test-fixture-reference-asset-a";
  return assetFixture({
    rightsReviewStatus: "approved",
    technicalReviewStatus: "approved",
    publicationStatus: "published",
    derivedFile: {
      mimeType: "image/png",
      width: 400,
      height: 300,
      bytes: 6789,
      sha256: DERIVED_SHA,
      derivedPath: `data-derived/historical-reference-assets/${id}/derived.png`,
      publicPath: `/data/historical-reference-assets/${id}/derived.png`,
    },
    ...overrides,
  });
}

function catalogWithAssets(assets: Record<string, unknown>[], reviewedAt = "2026-07-20") {
  return {
    schemaVersion: 1,
    catalogStatus: "reviewed",
    reviewedAt,
    assets,
  };
}

function candidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    candidateId: "test-fixture-candidate-a",
    intendedUses: ["reference-panel"],
    rightsReviewStatus: "approved",
    commercialUseCompatible: true,
    redistributionAllowed: true,
    modificationAllowed: true,
    croppingAllowed: true,
    rightsEvidenceUrls: ["https://example.com/rights"],
    ...overrides,
  };
}

function displayMapFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-fixture-display-map-a",
    sourceId: "test-fixture-candidate-a",
    publicationStatus: "published",
    artifactBinding: {
      kind: "reference-asset",
      assetId: "test-fixture-reference-asset-a",
    },
    ...overrides,
  };
}

function rasterRegistryFixture() {
  return {
    id: "project-grid",
    regionId: "edo",
    eraId: "edo-late",
    titleJa: "権利確認済みテスト定義",
    sheetLabelJa: "テスト格子",
    localTilePath: "data/historical-rasters/project-grid/{z}/{x}/{y}.png",
    tileManifestPath: "data/historical-rasters/project-grid/tile-manifest.json",
    tileFormat: "png",
    tileSize: 256,
    minZoom: 1,
    maxZoom: 1,
    maxNativeZoom: 1,
    bounds: [[35.6, 139.7], [35.7, 139.8]],
    defaultOpacity: 0.8,
    attributionId: "gsi-tiles",
    sourceId: "project-generated-fixture",
    georeferenceMethod: "projective",
    controlPointCount: 4,
    estimatedErrorMeters: 12,
    maximumErrorMeters: 25,
    qualityGateVersion: 1,
    qualityGatePassed: true,
    sourceDateDisplayJa: "テスト用",
    geographicCoverageJa: "テスト専用格子範囲",
    georeferenceNoteJa: "四隅の自作基準点で検証します。",
    contextNoteJa: "利用者向けの古地図として表示しません。",
    seamPolicy: "single-sheet",
    priority: 10,
    reviewStatus: "approved",
  };
}

const tempRoots: string[] = [];
afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

function createAuditFixtureRoot(options: {
  assets?: Record<string, unknown>[];
  catalogStatus?: string;
  reviewedAt?: string | null;
  candidates?: Record<string, unknown>[];
  displayMaps?: Record<string, unknown>[];
  runtimeSource?: { relativePath: string; content: string };
  publicCatalog?: boolean;
  publicAssetDir?: boolean;
  publicRasterDir?: boolean;
  rasterRegistry?: Record<string, unknown>[];
  distLeak?: boolean;
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "historical-reference-assets-"));
  tempRoots.push(root);
  mkdirSync(join(root, "data-curation"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });

  const catalog =
    options.assets && options.assets.length > 0
      ? catalogWithAssets(options.assets, options.reviewedAt ?? "2026-07-20")
      : {
          ...EMPTY_CATALOG,
          ...(options.catalogStatus ? { catalogStatus: options.catalogStatus } : {}),
          ...(options.reviewedAt !== undefined ? { reviewedAt: options.reviewedAt } : {}),
          ...(options.assets ? { assets: options.assets } : {}),
        };

  writeFileSync(
    join(root, "data-curation", "historical-reference-assets.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, "data-curation", "historical-raster-candidates.json"),
    `${JSON.stringify({ ...EMPTY_CANDIDATES, candidates: options.candidates ?? [] }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, "data-curation", "historical-map-display-catalog.json"),
    `${JSON.stringify({ ...EMPTY_DISPLAY, maps: options.displayMaps ?? [] }, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(
    join(root, "src", "historical-raster-registry.json"),
    `${JSON.stringify(options.rasterRegistry ?? [], null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(root, "src", "main.ts"), "export {};\n", "utf8");

  if (options.runtimeSource) {
    const full = join(root, options.runtimeSource.relativePath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, options.runtimeSource.content, "utf8");
  }
  if (options.publicCatalog) {
    mkdirSync(join(root, "public", "data"), { recursive: true });
    writeFileSync(
      join(root, "public", "data", "historical-reference-assets.json"),
      "{}\n",
      "utf8",
    );
  }
  if (options.publicAssetDir) {
    mkdirSync(join(root, "public", "data", "historical-reference-assets"), { recursive: true });
  }
  if (options.publicRasterDir) {
    mkdirSync(join(root, "public", "data", "historical-rasters"), { recursive: true });
  }
  if (options.distLeak) {
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "historical-reference-assets-leak.js"), "leak\n", "utf8");
  }
  return root;
}

function fileBackedAsset(options: {
  publicationStatus?: "candidate" | "shortlisted" | "published";
  derivedBuffer?: Buffer;
  derivedMimeType?: "image/png" | "image/webp";
} = {}) {
  const rawBuffer = tinyPng(2, 2, 16);
  const derivedBuffer = options.derivedBuffer ?? tinyPng(2, 2, 96);
  const derivedMimeType = options.derivedMimeType ?? "image/png";
  const extension = derivedMimeType === "image/png" ? "png" : "webp";
  const publicationStatus = options.publicationStatus ?? "published";
  const base = publicationStatus === "published" ? publishedAsset() : assetFixture({ publicationStatus });
  return {
    rawBuffer,
    derivedBuffer,
    asset: {
      ...base,
      rightsReviewStatus: publicationStatus === "published" ? "approved" : "pending",
      technicalReviewStatus: publicationStatus === "published" ? "approved" : "in-review",
      originalFile: {
        fileName: "original.png",
        mimeType: "image/png",
        width: 2,
        height: 2,
        bytes: rawBuffer.length,
        sha256: bufferSha256(rawBuffer),
        rawPath: "data-raw/historical-reference-assets/test-fixture-reference-asset-a/original.png",
      },
      crop: {
        sourceWidth: 2,
        sourceHeight: 2,
        x: 0,
        y: 0,
        width: derivedMimeType === "image/webp" ? 1 : 2,
        height: derivedMimeType === "image/webp" ? 1 : 2,
        rotationDegrees: 0,
      },
      derivedFile: {
        mimeType: derivedMimeType,
        width: derivedMimeType === "image/webp" ? 1 : 2,
        height: derivedMimeType === "image/webp" ? 1 : 2,
        bytes: derivedBuffer.length,
        sha256: bufferSha256(derivedBuffer),
        derivedPath: `data-derived/historical-reference-assets/test-fixture-reference-asset-a/derived.${extension}`,
        ...(publicationStatus === "published"
          ? { publicPath: `/data/historical-reference-assets/test-fixture-reference-asset-a/derived.${extension}` }
          : {}),
      },
    },
  };
}

function writeFileBackedAsset(root: string, fixture: ReturnType<typeof fileBackedAsset>, options: {
  raw?: boolean;
  derived?: boolean;
  public?: boolean;
  manifest?: boolean;
} = {}) {
  const asset = fixture.asset as ReturnType<typeof publishedAsset>;
  const derivedFile = asset.derivedFile as unknown as { derivedPath: string; publicPath?: string };
  const catalog = validateHistoricalReferenceAssetCatalog(catalogWithAssets([asset]));
  if (options.raw !== false) {
    const path = join(root, asset.originalFile.rawPath as string);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, fixture.rawBuffer);
  }
  if (options.derived !== false) {
    const path = join(root, derivedFile.derivedPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, fixture.derivedBuffer);
  }
  if (options.public !== false && asset.publicationStatus === "published") {
    if (!derivedFile.publicPath) throw new Error("published fixture publicPath missing");
    const path = join(root, "public", ...derivedFile.publicPath.slice(1).split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, fixture.derivedBuffer);
  }
  if (options.manifest !== false && asset.publicationStatus === "published") {
    const path = join(root, "dist", "places", "manifest.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ schemaVersion: 3, historicalReferenceAssets: createHistoricalReferenceAssetStaticManifest(catalog) }, null, 2)}\n`, "utf8");
  }
  return catalog;
}

function createCompletePublishedRoot(
  options: Parameters<typeof fileBackedAsset>[0] = {},
  displayMaps: Record<string, unknown>[] = [displayMapFixture()],
) {
  const fixture = fileBackedAsset(options);
  const root = createAuditFixtureRoot({
    assets: [fixture.asset],
    candidates: [candidateFixture()],
    displayMaps,
  });
  const catalog = writeFileBackedAsset(root, fixture);
  return { root, fixture, catalog };
}

function initializeGitFixture(root: string) {
  writeFileSync(join(root, ".gitignore"), "data-raw/\ndata-derived/\n", "utf8");
  execFileSync("git", ["init", "--quiet"], { cwd: root, stdio: "ignore" });
}

describe("歴史参考画像台帳基盤", () => {
  it("和田倉御門のshortlisted reference assetを読み込む", () => {
    const catalog = loadHistoricalReferenceAssetCatalog(ROOT);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.catalogStatus).toBe("reviewed");
    expect(catalog.assets).toHaveLength(1);
    expect(catalog.assets[0]).toMatchObject({
      id: "tokyo-archive-4300033114-wadakura-gate-reference-image",
      sourceId: "tokyo-archive-4300033114-wadakura-gate",
      rightsReviewStatus: "approved",
      technicalReviewStatus: "in-review",
      publicationStatus: "shortlisted",
      licenseCategory: "public-domain",
      licenseUrl: "https://archive.library.metro.tokyo.lg.jp/da/windowRequestImage2",
      originalFile: {
        fileName: "6194_02_01.jpg",
        width: 3514,
        height: 2500,
        bytes: 215751,
        sha256: "2bac080e87dd98c9b1927ba7a9cc23227a8b12bdf6b610b91f27d3a93491d8b7",
        rawPath:
          "data-raw/historical-reference-assets/tokyo-archive-4300033114-wadakura-gate-reference-image/6194_02_01.jpg",
      },
      crop: { sourceWidth: 3514, sourceHeight: 2500, x: 500, y: 270, width: 2450, height: 1800 },
      removedElements: ["capture-background", "ruler", "color-chart", "shelfmark-label"],
      preservesHistoricalContent: true,
      derivedFile: {
        mimeType: "image/png",
        width: 2450,
        height: 1800,
        bytes: 1680142,
        sha256: "92e7493dc52be2b18670f1b1bd80e1688ba6c7f491d94f3d2f172cce9b4b3e81",
        derivedPath:
          "data-derived/historical-reference-assets/tokyo-archive-4300033114-wadakura-gate-reference-image/wadakura-gate-reference.png",
      },
    });
    expect(catalog.assets[0]?.derivedFile).not.toHaveProperty("publicPath");
    const summary = summarizeHistoricalReferenceAssetCatalog(catalog);
    expect(summary).toMatchObject({
      assetCount: 1,
      publishedCount: 0,
      approvedRightsCount: 1,
      runtimeConnected: false,
    });
    const audit = auditHistoricalReferenceAssetRepository(ROOT);
    expect(audit.errors).toEqual([]);
  });

  it("schema不正を拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog({ ...EMPTY_CATALOG, schemaVersion: 2 }),
    ).toThrow(/schemaVersion/);
  });

  it("empty-foundationでassetsありを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog({
        ...EMPTY_CATALOG,
        assets: [assetFixture()],
      }),
    ).toThrow(/empty-foundation/);
  });

  it("reviewedでreviewedAtなしを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog({
        schemaVersion: 1,
        catalogStatus: "reviewed",
        reviewedAt: null,
        assets: [assetFixture()],
      }),
    ).toThrow(/reviewedAt/);
  });

  it("asset ID重複を拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([assetFixture(), assetFixture({ title: { ja: "別" } })]),
      ),
    ).toThrow(/重複/);
  });

  it("LocalizedTextのHTMLを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([assetFixture({ title: { ja: "<b>不正</b>" } })]),
      ),
    ).toThrow(/title\.ja/);
  });

  it("rawPathの絶対パスを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            originalFile: { rawPath: "/tmp/original.jpg" },
          }),
        ]),
      ),
    ).toThrow(/絶対パス|rawPath/);
  });

  it("rawPathのtraversalを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            originalFile: {
              rawPath: "data-raw/historical-reference-assets/../secret/original.jpg",
            },
          }),
        ]),
      ),
    ).toThrow(/traversal|rawPath/);
  });

  it("rawPathのURLを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            originalFile: { rawPath: "https://example.com/original.jpg" },
          }),
        ]),
      ),
    ).toThrow(/URL|rawPath|形式/);
  });

  it("rawPathがdata-raw外なら拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            originalFile: {
              rawPath: "data-derived/historical-reference-assets/test-fixture-reference-asset-a/original.jpg",
            },
          }),
        ]),
      ),
    ).toThrow(/rawPath|形式|data-raw/);
  });

  it("derivedPathがdata-derived外なら拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            derivedFile: {
              derivedPath: "data-raw/historical-reference-assets/test-fixture-reference-asset-a/derived.png",
            },
          }),
        ]),
      ),
    ).toThrow(/derivedPath|形式|data-derived/);
  });

  it("publicPathが固定public配下外なら拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          publishedAsset({
            derivedFile: {
              publicPath: "/assets/derived.png",
            },
          }),
        ]),
      ),
    ).toThrow(/publicPath/);
  });

  it("published以外のpublicPathを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            derivedFile: {
              publicPath: "/data/historical-reference-assets/test-fixture-reference-asset-a/derived.png",
            },
          }),
        ]),
      ),
    ).toThrow(/publicPath/);
  });

  it("publishedでpublicPathなしを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            rightsReviewStatus: "approved",
            technicalReviewStatus: "approved",
            publicationStatus: "published",
          }),
        ]),
      ),
    ).toThrow(/publicPath/);
  });

  it("publishedで権利未承認を拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          publishedAsset({
            rightsReviewStatus: "pending",
          }),
        ]),
      ),
    ).toThrow(/rightsReviewStatus/);
  });

  it("publishedで商用利用falseを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([publishedAsset({ commercialUseAllowed: false })]),
      ),
    ).toThrow(/commercialUseAllowed/);
  });

  it("publishedで再配布falseを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([publishedAsset({ redistributionAllowed: false })]),
      ),
    ).toThrow(/redistributionAllowed/);
  });

  it("publishedで改変falseを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([publishedAsset({ modificationAllowed: false })]),
      ),
    ).toThrow(/modificationAllowed/);
  });

  it("publishedでcrop falseを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([publishedAsset({ croppingAllowed: false })]),
      ),
    ).toThrow(/croppingAllowed/);
  });

  it("preservesHistoricalContent=falseのapprovedを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            technicalReviewStatus: "approved",
            preservesHistoricalContent: false,
          }),
        ]),
      ),
    ).toThrow(/preservesHistoricalContent/);
  });

  it("removedElements重複を拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([assetFixture({ removedElements: ["ruler", "ruler"] })]),
      ),
    ).toThrow(/重複/);
  });

  it("未知removedElementを拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([assetFixture({ removedElements: ["legend"] })]),
      ),
    ).toThrow(/removedElements/);
  });

  it("SHA形式不正を拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            originalFile: { sha256: "NOT-A-SHA" },
          }),
        ]),
      ),
    ).toThrow(/SHA-256/);
  });

  it("mimeと拡張子不一致を拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            originalFile: {
              fileName: "original.png",
              mimeType: "image/jpeg",
              rawPath: "data-raw/historical-reference-assets/test-fixture-reference-asset-a/original.png",
            },
          }),
        ]),
      ),
    ).toThrow(/拡張子/);
  });

  it("90度回転後寸法不一致を拒否する", () => {
    expect(() =>
      validateHistoricalReferenceAssetCatalog(
        catalogWithAssets([
          assetFixture({
            crop: { rotationDegrees: 90 },
            derivedFile: { width: 400, height: 300 },
          }),
        ]),
      ),
    ).toThrow(/期待寸法/);
  });

  it("0度回転後寸法一致を成功させる", () => {
    const catalog = validateHistoricalReferenceAssetCatalog(catalogWithAssets([assetFixture()]));
    expect(catalog.assets).toHaveLength(1);
    expect(catalog.assets[0]?.derivedFile?.width).toBe(400);
    expect(catalog.assets[0]?.derivedFile?.height).toBe(300);
  });

  it("sourceId欠落を拒否する", () => {
    const asset = assetFixture();
    delete (asset as { sourceId?: string }).sourceId;
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([asset]))).toThrow(
      /sourceId/,
    );
  });

  it("candidateに存在しないsourceIdを拒否する", () => {
    const root = createAuditFixtureRoot({
      assets: [publishedAsset()],
      candidates: [],
      displayMaps: [displayMapFixture()],
    });
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("候補台帳に存在しません"))).toBe(true);
  });

  it("reference assetはreference-panel用途sourceだけを参照する", () => {
    const accepted = createAuditFixtureRoot({ assets: [assetFixture()], candidates: [candidateFixture()] });
    expect(auditHistoricalReferenceAssetRepository(accepted).errors.some((message) => message.includes("intendedUses"))).toBe(false);
    const rejected = createAuditFixtureRoot({ assets: [assetFixture()], candidates: [candidateFixture({ intendedUses: ["georeferenced-overlay"] })] });
    expect(auditHistoricalReferenceAssetRepository(rejected).errors.some((message) => message.includes("reference-panel"))).toBe(true);
  });

  it("candidate rightsと矛盾するpublishedを拒否する", () => {
    const root = createAuditFixtureRoot({
      assets: [publishedAsset()],
      candidates: [candidateFixture({ rightsReviewStatus: "pending" })],
      displayMaps: [displayMapFixture()],
    });
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => /候補のrightsReviewStatus=approved|pending/.test(message))).toBe(
      true,
    );
  });

  it("display catalogのassetId欠落を拒否する", () => {
    const root = createAuditFixtureRoot({
      assets: [],
      candidates: [candidateFixture()],
      displayMaps: [displayMapFixture()],
      catalogStatus: "reviewed",
      reviewedAt: "2026-07-20",
    });
    // empty assets with reviewed + empty assets array is ok for catalog shape if status reviewed with 0 assets?
    // Actually reviewed with 0 assets is allowed by validate. Write reviewed empty assets:
    writeFileSync(
      join(root, "data-curation", "historical-reference-assets.json"),
      `${JSON.stringify(catalogWithAssets([]), null, 2)}\n`,
      "utf8",
    );
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("参考画像台帳に存在しません"))).toBe(true);
  });

  it("published displayから未公開asset参照を拒否する", () => {
    const root = createAuditFixtureRoot({
      assets: [assetFixture({ rightsReviewStatus: "approved", technicalReviewStatus: "approved" })],
      candidates: [candidateFixture()],
      displayMaps: [displayMapFixture()],
    });
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("published assetのみ参照"))).toBe(true);
  });

  it("published asset参照なしをorphanとして拒否する", () => {
    const { root } = createCompletePublishedRoot({}, []);
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("orphan"))).toBe(true);
  });

  it("candidate displayからだけ参照されるpublished assetをorphanとして拒否する", () => {
    const { root } = createCompletePublishedRoot({}, [
      displayMapFixture({ publicationStatus: "candidate" }),
    ]);
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("orphan"))).toBe(true);
  });

  it("shortlisted displayからだけ参照されるpublished assetをorphanとして拒否する", () => {
    const { root } = createCompletePublishedRoot({}, [
      displayMapFixture({ publicationStatus: "shortlisted" }),
    ]);
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("orphan"))).toBe(true);
  });

  it("sourceId不一致のpublished display参照をorphanとして拒否する", () => {
    const { root } = createCompletePublishedRoot({}, [
      displayMapFixture({ sourceId: "different-test-source" }),
    ]);
    const errors = auditHistoricalReferenceAssetRepository(root).errors;
    expect(errors.some((message) => message.includes("sourceIdがassetと一致しません"))).toBe(true);
    expect(errors.some((message) => message.includes("orphan"))).toBe(true);
  });

  it("published displayから参照されるpublished assetを成功させる", () => {
    const { root } = createCompletePublishedRoot();
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it("shortlisted asset参照なしを段階導入として成功させる", () => {
    const fixture = fileBackedAsset({ publicationStatus: "shortlisted" });
    const root = createAuditFixtureRoot({
      assets: [fixture.asset],
      candidates: [candidateFixture()],
      displayMaps: [],
    });
    writeFileBackedAsset(root, fixture);
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it("runtime参照を拒否する", () => {
    const root = createAuditFixtureRoot({
      runtimeSource: {
        relativePath: "src/layers/reference.ts",
        content: 'import { loadHistoricalReferenceAssetCatalog } from "../../scripts/historical-reference-assets.mjs";\n',
      },
    });
    const hits = findRuntimeHistoricalReferenceAssetReferences(root);
    expect(hits.length).toBeGreaterThan(0);
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("runtime"))).toBe(true);
  });

  it("public/dist非混入を監査する", () => {
    const publicRoot = createAuditFixtureRoot({ publicCatalog: true, publicAssetDir: true });
    const publicAudit = auditHistoricalReferenceAssetRepository(publicRoot);
    expect(publicAudit.errors.some((message) => message.includes("publicへ配信"))).toBe(true);
    expect(publicAudit.errors.some((message) => message.includes("published asset 0件"))).toBe(true);

    const distRoot = createAuditFixtureRoot({ distLeak: true });
    const distAudit = auditHistoricalReferenceAssetRepository(distRoot);
    expect(distAudit.errors.some((message) => message.includes("distへ混入"))).toBe(true);
  });

  it("正常な非空raster registryとreference asset空台帳を共存させる", () => {
    const root = createAuditFixtureRoot({ rasterRegistry: [rasterRegistryFixture()] });
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it("public historical-rasterディレクトリをreference asset監査では拒否しない", () => {
    const root = createAuditFixtureRoot({ publicRasterDir: true });
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it("raster共存時もreference asset publicディレクトリ規則を維持する", () => {
    const root = createAuditFixtureRoot({ publicRasterDir: true, publicAssetDir: true });
    const errors = auditHistoricalReferenceAssetRepository(root).errors;
    expect(errors.some((message) => message.includes("published asset 0件"))).toBe(true);
    expect(errors.some((message) => message.includes("公開古地図"))).toBe(false);
  });

  it("published assetの正しいpublic PNG実ファイルを検証する", () => {
    const { root, catalog } = createCompletePublishedRoot();
    const result = verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true });
    expect(result.publicFiles).toEqual([
      "public/data/historical-reference-assets/test-fixture-reference-asset-a/derived.png",
    ]);
  });

  it("published assetのpublicファイル欠落を拒否する", () => {
    const fixture = fileBackedAsset();
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture, { public: false });
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/公開参考画像|public.*ありません/u);
  });

  it("public orphanファイルを拒否する", () => {
    const { root, catalog } = createCompletePublishedRoot();
    writeFileSync(join(root, "public/data/historical-reference-assets/test-fixture-reference-asset-a/orphan.png"), tinyPng());
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/orphan/u);
  });

  it("publicの余分な空assetディレクトリを拒否する", () => {
    const { root, catalog } = createCompletePublishedRoot();
    mkdirSync(join(root, "public/data/historical-reference-assets/extra-asset"));
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/余分なassetディレクトリ/u);
  });

  it("publicの隠しファイルを拒否する", () => {
    const { root, catalog } = createCompletePublishedRoot();
    writeFileSync(join(root, "public/data/historical-reference-assets/test-fixture-reference-asset-a/.hidden"), "hidden");
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/隠し項目/u);
  });

  it("publicの余分な階層を拒否する", () => {
    const { root, catalog } = createCompletePublishedRoot();
    mkdirSync(join(root, "public/data/historical-reference-assets/test-fixture-reference-asset-a/nested"));
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/id直下/u);
  });

  it("candidate assetのpublicファイルを拒否する", () => {
    const fixture = fileBackedAsset({ publicationStatus: "candidate" });
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    writeFileBackedAsset(root, fixture);
    const publicPath = join(root, "public/data/historical-reference-assets/test-fixture-reference-asset-a/derived.png");
    mkdirSync(dirname(publicPath), { recursive: true });
    writeFileSync(publicPath, fixture.derivedBuffer);
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("published asset 0件"))).toBe(true);
  });

  it("public symlinkを拒否する", () => {
    const fixture = fileBackedAsset();
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture, { public: false });
    const publicRoot = join(root, "public/data/historical-reference-assets");
    const targetDirectory = join(root, "public-junction-target");
    mkdirSync(publicRoot, { recursive: true });
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(join(targetDirectory, "derived.png"), fixture.derivedBuffer);
    symlinkSync(targetDirectory, join(publicRoot, "test-fixture-reference-asset-a"), "junction");
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/symlink|通常ファイル/u);
  });

  it("public SHA不一致を拒否する", () => {
    const fixture = fileBackedAsset();
    fixture.asset.derivedFile.sha256 = "c".repeat(64);
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture, { derived: false });
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/SHA-256/u);
  });

  it("public bytes不一致を拒否する", () => {
    const fixture = fileBackedAsset();
    fixture.asset.derivedFile.bytes = fixture.derivedBuffer.length + 1;
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture, { derived: false });
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/bytes/u);
  });

  it("public寸法不一致を拒否する", () => {
    const fixture = fileBackedAsset();
    fixture.derivedBuffer = tinyPng(3, 2, 96);
    fixture.asset.derivedFile.bytes = fixture.derivedBuffer.length;
    fixture.asset.derivedFile.sha256 = bufferSha256(fixture.derivedBuffer);
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture, { derived: false });
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/寸法/u);
  });

  it("public MIME magic不一致を拒否する", () => {
    const fixture = fileBackedAsset();
    fixture.derivedBuffer = LOSSLESS_WEBP;
    fixture.asset.derivedFile.bytes = fixture.derivedBuffer.length;
    fixture.asset.derivedFile.sha256 = bufferSha256(fixture.derivedBuffer);
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture, { derived: false });
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/magic bytesとmimeType/u);
  });

  it("最小PNG fixtureのsignature・IHDR・寸法を検証する", () => {
    const { root, catalog } = createCompletePublishedRoot();
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requireRawFiles: true, requireDerivedFiles: true, requirePublicFiles: true })).not.toThrow();
  });

  it("最小lossless WebP fixtureを検証する", () => {
    const { root, catalog } = createCompletePublishedRoot({ derivedBuffer: LOSSLESS_WEBP, derivedMimeType: "image/webp" });
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).not.toThrow();
  });

  it("lossy WebP派生画像を拒否する", () => {
    const fixture = fileBackedAsset({ derivedBuffer: LOSSY_WEBP, derivedMimeType: "image/webp" });
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture);
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requirePublicFiles: true })).toThrow(/lossy WebP/u);
  });

  it("raw実ファイルSHA不一致を拒否する", () => {
    const fixture = fileBackedAsset({ publicationStatus: "candidate" });
    fixture.asset.originalFile.sha256 = "d".repeat(64);
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture);
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requireRawFiles: true })).toThrow(/SHA-256/u);
  });

  it("raw実ファイル寸法不一致を拒否する", () => {
    const fixture = fileBackedAsset({ publicationStatus: "candidate" });
    fixture.rawBuffer = tinyPng(3, 2, 16);
    fixture.asset.originalFile.bytes = fixture.rawBuffer.length;
    fixture.asset.originalFile.sha256 = bufferSha256(fixture.rawBuffer);
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    const catalog = writeFileBackedAsset(root, fixture);
    expect(() => verifyHistoricalReferenceAssetFiles(root, catalog, { requireRawFiles: true })).toThrow(/寸法/u);
  });

  it("raw Git追跡を拒否する", () => {
    const fixture = fileBackedAsset({ publicationStatus: "candidate" });
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    writeFileBackedAsset(root, fixture);
    initializeGitFixture(root);
    execFileSync("git", ["add", "-f", "--", fixture.asset.originalFile.rawPath], { cwd: root });
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("rawPathがGit追跡"))).toBe(true);
  });

  it("derived Git追跡を拒否する", () => {
    const fixture = fileBackedAsset({ publicationStatus: "candidate" });
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    writeFileBackedAsset(root, fixture);
    initializeGitFixture(root);
    execFileSync("git", ["add", "-f", "--", fixture.asset.derivedFile.derivedPath], { cwd: root });
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("derivedPathがGit追跡"))).toBe(true);
  });

  it("published publicPathのGit未追跡を拒否する", () => {
    const { root } = createCompletePublishedRoot();
    initializeGitFixture(root);
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("publicPathがGit追跡されていません"))).toBe(true);
  });

  it("published publicPathだけをGit追跡対象として許可する", () => {
    const { root } = createCompletePublishedRoot();
    initializeGitFixture(root);
    execFileSync("git", ["add", "--", "public/data/historical-reference-assets/test-fixture-reference-asset-a/derived.png"], { cwd: root });
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it("raw/derived assetディレクトリのGit除外欠落を拒否する", () => {
    const root = createAuditFixtureRoot();
    execFileSync("git", ["init", "--quiet"], { cwd: root, stdio: "ignore" });
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.filter((message) => message.includes(".gitignoreで保護")).length).toBe(2);
  });

  it("candidate commercial=falseを超えるasset trueを拒否する", () => {
    const root = createAuditFixtureRoot({ assets: [assetFixture()], candidates: [candidateFixture({ commercialUseCompatible: false })] });
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("commercialUseAllowed"))).toBe(true);
  });

  it("candidate redistribution=falseを超えるasset trueを拒否する", () => {
    const root = createAuditFixtureRoot({ assets: [assetFixture()], candidates: [candidateFixture({ redistributionAllowed: false })] });
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("redistributionAllowed"))).toBe(true);
  });

  it("candidate modification=falseを超えるasset trueを拒否する", () => {
    const root = createAuditFixtureRoot({ assets: [assetFixture()], candidates: [candidateFixture({ modificationAllowed: false })] });
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("modificationAllowed"))).toBe(true);
  });

  it("candidate cropping=falseを超えるasset trueを拒否する", () => {
    const root = createAuditFixtureRoot({ assets: [assetFixture()], candidates: [candidateFixture({ croppingAllowed: false })] });
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("croppingAllowed"))).toBe(true);
  });

  it("candidate pending + asset approvedを拒否する", () => {
    const root = createAuditFixtureRoot({ assets: [assetFixture({ rightsReviewStatus: "approved" })], candidates: [candidateFixture({ rightsReviewStatus: "pending" })] });
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("候補rights=pendingを超え"))).toBe(true);
  });

  it("candidate rejected + asset approvedを拒否する", () => {
    const root = createAuditFixtureRoot({ assets: [assetFixture({ rightsReviewStatus: "approved" })], candidates: [candidateFixture({ rightsReviewStatus: "rejected" })] });
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("候補rights=rejectedを超え"))).toBe(true);
  });

  it("candidate approved + asset rejectedを保守的上書きとして許可する", () => {
    const root = createAuditFixtureRoot({ assets: [assetFixture({ rightsReviewStatus: "rejected" })], candidates: [candidateFixture()] });
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it("cc-by + CC-BY-4.0を成功させる", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({ licenseCategory: "cc-by", licenseCode: "CC-BY-4.0" }),
    ]))).not.toThrow();
  });

  it("cc-by + CC0を拒否する", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({ licenseCategory: "cc-by", licenseCode: "CC0-1.0" }),
    ]))).toThrow(/licenseCategory=cc-by/u);
  });

  it("cc0 + CC0-1.0を成功させる", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({ licenseCategory: "cc0", licenseCode: "CC0-1.0" }),
    ]))).not.toThrow();
  });

  it("cc0 + CC-BY-4.0を拒否する", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({ licenseCategory: "cc0", licenseCode: "CC-BY-4.0" }),
    ]))).toThrow(/licenseCategory=cc0/u);
  });

  it("public-domain + Public-Domainを成功させる", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({ licenseCategory: "public-domain", licenseCode: "Public-Domain" }),
    ]))).not.toThrow();
  });

  it("public-domain + CC-BYを拒否する", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({ licenseCategory: "public-domain", licenseCode: "CC-BY-4.0" }),
    ]))).toThrow(/licenseCategory=public-domain/u);
  });

  it("custom-commercial-open + CC-BYを拒否する", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({ licenseCategory: "custom-commercial-open", licenseCode: "CC-BY-4.0" }),
    ]))).toThrow(/custom-commercial-open/u);
  });

  it("custom-commercial-open + custom codeを候補権利根拠込みで成功させる", () => {
    const fixture = fileBackedAsset();
    fixture.asset.licenseCategory = "custom-commercial-open";
    fixture.asset.licenseCode = "CUSTOM-COMMERCIAL-OPEN-1.0";
    const root = createAuditFixtureRoot({
      assets: [fixture.asset],
      candidates: [candidateFixture()],
      displayMaps: [displayMapFixture()],
    });
    writeFileBackedAsset(root, fixture);
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it.each([
    "CC-BY-NC-4.0",
    "NONCOMMERCIAL",
    "CC-BY-ND-4.0",
    "NO_DERIVATIVES",
    "ALL RIGHTS RESERVED",
    "ARR",
  ])("restricted licenseCode %s のpublishedを拒否する", (licenseCode) => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([publishedAsset({ licenseCode })]))).toThrow(/NC\/ND|権利留保/u);
  });

  it("licenseCodeの単純部分文字列を誤検出しない", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([
      publishedAsset({
        licenseCategory: "custom-commercial-open",
        licenseCode: "CANDIDATE-OPEN-1.0",
      }),
    ]))).not.toThrow();
  });

  it("unknown license categoryのpublishedを拒否する", () => {
    expect(() => validateHistoricalReferenceAssetCatalog(catalogWithAssets([publishedAsset({ licenseCategory: "unknown" })]))).toThrow(/licenseCategory/u);
  });

  it("custom-commercial-openで候補rights evidence欠落を拒否する", () => {
    const fixture = fileBackedAsset();
    fixture.asset.licenseCategory = "custom-commercial-open";
    fixture.asset.licenseCode = "CUSTOM-COMMERCIAL-OPEN-1.0";
    const root = createAuditFixtureRoot({
      assets: [fixture.asset],
      candidates: [candidateFixture({ rightsEvidenceUrls: [] })],
      displayMaps: [displayMapFixture()],
    });
    writeFileBackedAsset(root, fixture);
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("rights evidence"))).toBe(true);
  });

  it("正常なpublished権利条件を候補台帳まで含めて成功させる", () => {
    const { root } = createCompletePublishedRoot();
    expect(auditHistoricalReferenceAssetRepository(root).errors).toEqual([]);
  });

  it("published publicPathとstatic manifest SHA不一致を拒否する", () => {
    const { root } = createCompletePublishedRoot();
    const manifestPath = join(root, "dist/places/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.historicalReferenceAssets.files[0].sha256 = "e".repeat(64);
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("static manifestのSHA-256"))).toBe(true);
  });

  it("static manifestだけにあるorphan entryを拒否する", () => {
    const root = createAuditFixtureRoot();
    const manifestPath = join(root, "dist/places/manifest.json");
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify({ historicalReferenceAssets: { schemaVersion: 1, assetCount: 1, files: [{ publicPath: "/data/historical-reference-assets/orphan/x.png", sha256: "a".repeat(64), bytes: 1 }] } })}\n`, "utf8");
    expect(auditHistoricalReferenceAssetRepository(root).errors.some((message) => message.includes("orphan entry"))).toBe(true);
  });

  it("local verifierで非rejected assetのraw欠落を拒否する", () => {
    const fixture = fileBackedAsset();
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    writeFileBackedAsset(root, fixture, { raw: false });
    expect(auditHistoricalReferenceAssetRepository(root, { verifyLocal: true }).errors.some((message) => message.includes("raw原画像がありません"))).toBe(true);
  });

  it("local verifierでderivedFileのローカル欠落を拒否する", () => {
    const fixture = fileBackedAsset();
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    writeFileBackedAsset(root, fixture, { derived: false });
    expect(auditHistoricalReferenceAssetRepository(root, { verifyLocal: true }).errors.some((message) => message.includes("derivedローカル画像がありません"))).toBe(true);
  });

  it("raw symlinkを拒否する", () => {
    const fixture = fileBackedAsset({ publicationStatus: "candidate" });
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    writeFileBackedAsset(root, fixture, { raw: false });
    const rawRoot = join(root, "data-raw/historical-reference-assets");
    const targetDirectory = join(root, "raw-junction-target");
    mkdirSync(rawRoot, { recursive: true });
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(join(targetDirectory, "original.png"), fixture.rawBuffer);
    symlinkSync(targetDirectory, join(rawRoot, "test-fixture-reference-asset-a"), "junction");
    expect(() => verifyHistoricalReferenceAssetFiles(root, validateHistoricalReferenceAssetCatalog(catalogWithAssets([fixture.asset])), { requireRawFiles: true })).toThrow(/symlink/u);
  });

  it("derived symlinkを拒否する", () => {
    const fixture = fileBackedAsset({ publicationStatus: "candidate" });
    const root = createAuditFixtureRoot({ assets: [fixture.asset], candidates: [candidateFixture()] });
    writeFileBackedAsset(root, fixture, { derived: false });
    const derivedRoot = join(root, "data-derived/historical-reference-assets");
    const targetDirectory = join(root, "derived-junction-target");
    mkdirSync(derivedRoot, { recursive: true });
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(join(targetDirectory, "derived.png"), fixture.derivedBuffer);
    symlinkSync(targetDirectory, join(derivedRoot, "test-fixture-reference-asset-a"), "junction");
    expect(() => verifyHistoricalReferenceAssetFiles(root, validateHistoricalReferenceAssetCatalog(catalogWithAssets([fixture.asset])), { requireDerivedFiles: true })).toThrow(/symlink/u);
  });

  it("既存公開データSHAを変更しない", () => {
    expect(sha256("public/data/edo-places.geojson")).toBe(
      "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4",
    );
    expect(sha256("public/data/edo-machiya-areas.geojson")).toBe(
      "516fead3b082499ab1fb9d3c50060fc88812531530e9f86f63bcffff81a70bd6",
    );
    expect(sha256("public/data/edo-coastlines.geojson")).toBe(
      "c67be67ed6213021a7333774300bc196a52195894130f7670ede45e9a2124a31",
    );
    expect(sha256("public/data/kyoto-bakumatsu-places.geojson")).toBe(
      "d141eb046d34c2c16b49286d3a70de49ea06f79e59561ae20537cd934e06f4d6",
    );
    expect(sha256("public/data/shiga-sengoku-places.geojson")).toBe(
      "0467e166fdd7ff58bcc9ada8366068fe6e877edfc6af508df65ac7b355c26fb9",
    );
    expect(sha256("data-curation/historical-themes.json")).toBe(
      "b541a2627dd7cedbf0963ff45085418c559a12887b80b38042d83455fd79989d",
    );
    expect(sha256("data-curation/historical-timeline.json")).toBe(
      "976c49cdbdeda4d776f22259f95d3e6940d4e742b3f6c377b1cbfbaf7867b444",
    );
    expect(JSON.parse(readFileSync(join(ROOT, "data-curation/historical-map-display-catalog.json"), "utf8")).maps).toEqual(
      [],
    );
    expect(
      JSON.parse(readFileSync(join(ROOT, "data-curation/historical-control-point-catalog.json"), "utf8")).entries,
    ).toEqual([]);
    expect(JSON.parse(readFileSync(join(ROOT, "src/historical-raster-registry.json"), "utf8"))).toEqual([]);
  });
});
