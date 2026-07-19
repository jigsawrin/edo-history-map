import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditHistoricalReferenceAssetRepository,
  findRuntimeHistoricalReferenceAssetReferences,
  loadHistoricalReferenceAssetCatalog,
  summarizeHistoricalReferenceAssetCatalog,
  validateHistoricalReferenceAssetCatalog,
} from "../scripts/historical-reference-assets.mjs";

const ROOT = join(__dirname, "..");
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

const ORIGINAL_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DERIVED_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

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
  schemaVersion: 2,
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
    rightsReviewStatus: "approved",
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
  writeFileSync(join(root, "src", "historical-raster-registry.json"), "[]\n", "utf8");
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
  if (options.distLeak) {
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, "dist", "historical-reference-assets-leak.js"), "leak\n", "utf8");
  }
  return root;
}

describe("歴史参考画像台帳基盤", () => {
  it("正常な空台帳を読み込み、0件・empty-foundationを返す", () => {
    const catalog = loadHistoricalReferenceAssetCatalog(ROOT);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.catalogStatus).toBe("empty-foundation");
    expect(catalog.assets).toEqual([]);
    const summary = summarizeHistoricalReferenceAssetCatalog(catalog);
    expect(summary).toMatchObject({
      assetCount: 0,
      publishedCount: 0,
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

  it("orphan published assetを拒否する", () => {
    const root = createAuditFixtureRoot({
      assets: [publishedAsset()],
      candidates: [candidateFixture()],
      displayMaps: [],
    });
    const audit = auditHistoricalReferenceAssetRepository(root);
    expect(audit.errors.some((message) => message.includes("orphan"))).toBe(true);
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
    expect(publicAudit.errors.some((message) => message.includes("公開参考画像ディレクトリ"))).toBe(true);

    const distRoot = createAuditFixtureRoot({ distLeak: true });
    const distAudit = auditHistoricalReferenceAssetRepository(distRoot);
    expect(distAudit.errors.some((message) => message.includes("distへ混入"))).toBe(true);
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
