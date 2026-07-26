import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  auditHistoricalMapDisplayCatalogRepository,
  findRuntimeHistoricalMapDisplayCatalogReferences,
  loadHistoricalMapDisplayCatalog,
  summarizeHistoricalMapDisplayCatalog,
  validateHistoricalMapDisplayCatalog,
} from "../scripts/historical-map-display-catalog.mjs";

const ROOT = join(__dirname, "..");
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

const EMPTY_CATALOG = Object.freeze({
  schemaVersion: 1,
  catalogStatus: "empty-foundation",
  reviewedAt: null,
  maps: [],
});

const SAMPLE_POLYGON = Object.freeze({
  type: "Polygon" as const,
  coordinates: [
    [
      [139.7, 35.65],
      [139.8, 35.65],
      [139.8, 35.75],
      [139.7, 35.75],
      [139.7, 35.65],
    ],
  ],
});

const SAMPLE_MULTIPOLYGON = Object.freeze({
  type: "MultiPolygon" as const,
  coordinates: [
    [
      [
        [139.7, 35.65],
        [139.75, 35.65],
        [139.75, 35.7],
        [139.7, 35.7],
        [139.7, 35.65],
      ],
    ],
    [
      [
        [139.76, 35.71],
        [139.8, 35.71],
        [139.8, 35.75],
        [139.76, 35.75],
        [139.76, 35.71],
      ],
    ],
  ],
});

const WADAKURA_TRIGGER_POLYGON = Object.freeze({
  type: "Polygon" as const,
  coordinates: [
    [
      [139.75995, 35.6827],
      [139.7622, 35.6827],
      [139.7622, 35.6842],
      [139.75995, 35.6842],
      [139.75995, 35.6827],
    ],
  ],
});

/** Test-only fixtures. Never write these into production catalog. */
function mapFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-fixture-display-map-a",
    name: { ja: "試験用表示地図A", en: "Test display map A" },
    displayRole: "regional",
    displayMode: "georeferenced-overlay",
    artifactBinding: {
      kind: "historical-raster",
      rasterId: "test-fixture-raster-a",
    },
    spatialBinding: {
      kind: "georeferenced-coverage",
      geometry: structuredClone(SAMPLE_POLYGON),
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
    cropReview: {
      removedElements: ["ruler", "color-chart"],
      preservesHistoricalContent: true,
      note: { ja: "撮影用定規とカラーチャートのみ除去した試験fixtureです。" },
    },
    zoom: {
      minimum: 12,
      maximum: 18,
      enterDetailAt: 16,
      leaveDetailBelow: 15,
    },
    regionId: "edo",
    eraId: "edo-late",
    priority: 10,
    sourceId: "test-fixture-source",
    rightsReviewStatus: "pending",
    technicalReviewStatus: "not-started",
    publicationStatus: "candidate",
    ...overrides,
  };
}

function overviewFixture(overrides: Record<string, unknown> = {}) {
  return mapFixture({
    id: "test-fixture-display-map-overview",
    name: { ja: "試験用概観地図" },
    displayRole: "overview",
    zoom: {
      minimum: 10,
      maximum: 16,
      enterDetailAt: 14,
      leaveDetailBelow: 13,
    },
    priority: 100,
    ...overrides,
  });
}

function referenceFixture(overrides: Record<string, unknown> = {}) {
  return mapFixture({
    id: "test-fixture-display-map-ref",
    name: { ja: "試験用参考地図" },
    displayRole: "reference-only",
    displayMode: "reference-panel",
    artifactBinding: {
      kind: "reference-asset",
      assetId: "test-fixture-asset-a",
    },
    spatialBinding: {
      kind: "display-trigger-area",
      geometry: structuredClone(SAMPLE_POLYGON),
    },
    ...overrides,
  });
}

function referenceAssetFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-fixture-asset-a",
    sourceId: "test-fixture-source",
    publicationStatus: "shortlisted",
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
    cropReviewNote: { ja: "撮影用定規とカラーチャートのみ除去した試験fixtureです。" },
    ...overrides,
  };
}

function catalogWithMaps(maps: Record<string, unknown>[], reviewedAt = "2026-07-19") {
  return {
    schemaVersion: 1,
    catalogStatus: "reviewed",
    reviewedAt,
    maps,
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
  runtimeSource?: { relativePath: string; content: string };
  scriptReference?: boolean;
  maps?: Record<string, unknown>[];
  candidates?: Record<string, unknown>[];
  assets?: Record<string, unknown>[];
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "historical-map-display-catalog-"));
  tempRoots.push(root);
  mkdirSync(join(root, "data-curation"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "data-curation", "historical-map-display-catalog.json"),
    `${JSON.stringify(options.maps ? catalogWithMaps(options.maps) : EMPTY_CATALOG, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(join(root, "data-curation", "historical-raster-candidates.json"), `${JSON.stringify({ schemaVersion: 3, candidates: options.candidates ?? [] }, null, 2)}\n`, "utf8");
  writeFileSync(join(root, "data-curation", "historical-reference-assets.json"), `${JSON.stringify({ schemaVersion: 1, catalogStatus: "reviewed", reviewedAt: "2026-07-22", assets: options.assets ?? [] }, null, 2)}\n`, "utf8");
  writeFileSync(join(root, "src", "historical-raster-registry.json"), "[]\n", "utf8");
  writeFileSync(join(root, "src", "main.ts"), "export {};\n", "utf8");
  if (options.runtimeSource) {
    const full = join(root, options.runtimeSource.relativePath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, options.runtimeSource.content, "utf8");
  }
  if (options.scriptReference) {
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(
      join(root, "scripts", "helper.mjs"),
      'import { loadHistoricalMapDisplayCatalog } from "./historical-map-display-catalog.mjs";\n',
      "utf8",
    );
  }
  return root;
}

describe("古地図表示カタログ基盤", () => {
  it("本番カタログに和田倉御門のpublished reference displayだけを保持する", () => {
    const catalog = loadHistoricalMapDisplayCatalog(ROOT);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.catalogStatus).toBe("reviewed");
    expect(catalog.reviewedAt).toBe("2026-07-23");
    expect(catalog.maps).toHaveLength(1);
    expect(catalog.maps[0]).toEqual({
      id: "tokyo-archive-4300033114-wadakura-gate-reference-display",
      name: { ja: "江戸城御外郭御門絵図 第1図 和田倉御門" },
      displayRole: "reference-only",
      displayMode: "reference-panel",
      artifactBinding: {
        kind: "reference-asset",
        assetId: "tokyo-archive-4300033114-wadakura-gate-reference-image",
      },
      spatialBinding: {
        kind: "display-trigger-area",
        geometry: WADAKURA_TRIGGER_POLYGON,
      },
      crop: {
        sourceWidth: 3514,
        sourceHeight: 2500,
        x: 500,
        y: 270,
        width: 2450,
        height: 1800,
        rotationDegrees: 0,
      },
      cropReview: {
        removedElements: ["capture-background", "ruler", "color-chart", "shelfmark-label"],
        preservesHistoricalContent: true,
        note: {
          ja: "図面本体、全注記、方角表示、右下の細部図、原本余白、折り目、印・記号、台紙の縁を残した。原本外であることが明確な外側の灰色背景、資料番号札、カラーチャート、グレースケール、定規だけを除去した。",
        },
      },
      zoom: { minimum: 15, maximum: 20, enterDetailAt: 17, leaveDetailBelow: 16.5 },
      regionId: "edo",
      eraId: "edo-middle",
      priority: 70,
      sourceId: "tokyo-archive-4300033114-wadakura-gate",
      rightsReviewStatus: "approved",
      technicalReviewStatus: "approved",
      publicationStatus: "published",
    });
    expect(catalog.maps[0]).not.toHaveProperty("parentMapId");
    const asset = JSON.parse(
      readFileSync(join(ROOT, "data-curation", "historical-reference-assets.json"), "utf8"),
    ).assets[0];
    expect(catalog.maps[0]?.crop).toEqual(asset.crop);
    expect(catalog.maps[0]?.cropReview).toEqual({
      removedElements: asset.removedElements,
      preservesHistoricalContent: asset.preservesHistoricalContent,
      note: asset.cropReviewNote,
    });
    expect(summarizeHistoricalMapDisplayCatalog(catalog)).toMatchObject({
      schemaVersion: 1,
      catalogStatus: "reviewed",
      mapCount: 1,
      publishedCount: 1,
      runtimeEligibleCount: 1,
      runtimeConnected: false,
    });
  });

  it("schemaVersion不正を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog({ ...EMPTY_CATALOG, schemaVersion: 2 }),
    ).toThrow(/schemaVersion/u);
  });

  it("empty-foundationでmapsありを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog({
        ...EMPTY_CATALOG,
        maps: [overviewFixture()],
      }),
    ).toThrow(/empty-foundation/u);
  });

  it("overlay + historical-rasterを受理する", () => {
    const catalog = validateHistoricalMapDisplayCatalog(
      catalogWithMaps([overviewFixture()]),
    );
    expect(catalog.maps[0]?.artifactBinding).toEqual({
      kind: "historical-raster",
      rasterId: "test-fixture-raster-a",
    });
  });

  it("overlay + reference-assetを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            artifactBinding: { kind: "reference-asset", assetId: "test-fixture-asset-a" },
          }),
        ]),
      ),
    ).toThrow(/reference-asset/u);
  });

  it("reference-panel + reference-assetを受理する", () => {
    const catalog = validateHistoricalMapDisplayCatalog(
      catalogWithMaps([
        overviewFixture(),
        referenceFixture({
          displayRole: "reference-only",
          displayMode: "reference-panel",
        }),
      ]),
    );
    expect(catalog.maps[1]?.artifactBinding.kind).toBe("reference-asset");
  });

  it("reference-panel + historical-rasterを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture(),
          referenceFixture({
            artifactBinding: { kind: "historical-raster", rasterId: "test-fixture-raster-a" },
          }),
        ]),
      ),
    ).toThrow(/historical-raster/u);
  });

  it("reference-only + historical-rasterを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          referenceFixture({
            artifactBinding: { kind: "historical-raster", rasterId: "test-fixture-raster-a" },
          }),
        ]),
      ),
    ).toThrow(/historical-raster/u);
  });

  it("reference-only + georeferenced-overlayを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([referenceFixture({ displayMode: "georeferenced-overlay" })]),
      ),
    ).toThrow(/reference-onlyはreference-panel/u);
  });

  it("reference-only + georeferenced-coverageを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture(),
          referenceFixture({
            spatialBinding: {
              kind: "georeferenced-coverage",
              geometry: structuredClone(SAMPLE_POLYGON),
            },
          }),
        ]),
      ),
    ).toThrow(/georeferenced-coverage/u);
  });

  it("reference-only + display-trigger-areaを受理する", () => {
    const catalog = validateHistoricalMapDisplayCatalog(catalogWithMaps([referenceFixture()]));
    expect(catalog.maps[0]?.spatialBinding.kind).toBe("display-trigger-area");
    expect(catalog.maps[0]).not.toHaveProperty("parentMapId");
  });

  it("parentMapIdありreference-onlyも従来どおり受理する", () => {
    const catalog = validateHistoricalMapDisplayCatalog(
      catalogWithMaps([
        overviewFixture(),
        referenceFixture({ parentMapId: "test-fixture-display-map-overview" }),
      ]),
    );
    expect(catalog.maps[1]?.parentMapId).toBe("test-fixture-display-map-overview");
  });

  it("technical approved + historical content非保持を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            technicalReviewStatus: "approved",
            rightsReviewStatus: "approved",
            cropReview: {
              removedElements: [],
              preservesHistoricalContent: false,
              note: { ja: "歴史情報を削った試験です。" },
            },
          }),
        ]),
      ),
    ).toThrow(/preservesHistoricalContent|歴史情報非保持/u);
  });

  it("published + historical content非保持を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            rightsReviewStatus: "approved",
            technicalReviewStatus: "approved",
            publicationStatus: "published",
            cropReview: {
              removedElements: [],
              preservesHistoricalContent: false,
              note: { ja: "公開不可の試験です。" },
            },
          }),
        ]),
      ),
    ).toThrow(/preservesHistoricalContent|歴史情報非保持/u);
  });

  it("crop removedElements重複を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            cropReview: {
              removedElements: ["ruler", "ruler"],
              preservesHistoricalContent: true,
              note: { ja: "重複試験です。" },
            },
          }),
        ]),
      ),
    ).toThrow(/重複/u);
  });

  it("crop removedElements未知値を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            cropReview: {
              removedElements: ["stamp"],
              preservesHistoricalContent: true,
              note: { ja: "未知値試験です。" },
            },
          }),
        ]),
      ),
    ).toThrow(/removedElements/u);
  });

  it("overviewのparentを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({ parentMapId: "test-fixture-display-map-other" }),
          mapFixture({
            id: "test-fixture-display-map-other",
            name: { ja: "他地図" },
            displayRole: "overview",
          }),
        ]),
      ),
    ).toThrow(/overviewはparentMapIdを持てません/u);
  });

  it("detailのparent欠落を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            id: "test-fixture-display-map-detail",
            displayRole: "detail",
            zoom: {
              minimum: 14,
              maximum: 19,
              enterDetailAt: 17,
              leaveDetailBelow: 16,
            },
          }),
        ]),
      ),
    ).toThrow(/parentMapIdが必要/u);
  });

  it("親子region不一致を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture(),
          mapFixture({
            id: "test-fixture-display-map-detail",
            name: { ja: "詳細" },
            displayRole: "detail",
            parentMapId: "test-fixture-display-map-overview",
            regionId: "kyoto",
            zoom: {
              minimum: 14,
              maximum: 16,
              enterDetailAt: 15.5,
              leaveDetailBelow: 15,
            },
          }),
        ]),
      ),
    ).toThrow(/regionId/u);
  });

  it("親子era不一致を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture(),
          mapFixture({
            id: "test-fixture-display-map-detail",
            name: { ja: "詳細" },
            displayRole: "detail",
            parentMapId: "test-fixture-display-map-overview",
            eraId: "bakumatsu",
            zoom: {
              minimum: 14,
              maximum: 16,
              enterDetailAt: 15.5,
              leaveDetailBelow: 15,
            },
          }),
        ]),
      ),
    ).toThrow(/eraId/u);
  });

  it("detailの不正なparent roleを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture(),
          referenceFixture({ id: "test-fixture-display-map-ref" }),
          mapFixture({
            id: "test-fixture-display-map-detail",
            name: { ja: "詳細" },
            displayRole: "detail",
            parentMapId: "test-fixture-display-map-ref",
            zoom: {
              minimum: 14,
              maximum: 16,
              enterDetailAt: 15.5,
              leaveDetailBelow: 15,
            },
          }),
        ]),
      ),
    ).toThrow(/reference-onlyをparent|detailのparent/u);
  });

  it("reference-onlyをparentにするケースを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture(),
          referenceFixture(),
          mapFixture({
            id: "test-fixture-display-map-child",
            name: { ja: "子" },
            displayRole: "detail",
            parentMapId: "test-fixture-display-map-ref",
            zoom: {
              minimum: 14,
              maximum: 16,
              enterDetailAt: 15.5,
              leaveDetailBelow: 15,
            },
          }),
        ]),
      ),
    ).toThrow(/reference-onlyをparent/u);
  });

  it("reference-onlyの不正なparent roleを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          referenceFixture({ id: "test-fixture-display-map-parent-ref" }),
          referenceFixture({ parentMapId: "test-fixture-display-map-parent-ref" }),
        ]),
      ),
    ).toThrow(/reference-onlyをparent|parent role/u);
  });

  it("overlay親子のzoom gapを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            zoom: {
              minimum: 10,
              maximum: 14,
              enterDetailAt: 13,
              leaveDetailBelow: 12,
            },
          }),
          mapFixture({
            id: "test-fixture-display-map-detail",
            name: { ja: "詳細" },
            displayRole: "detail",
            parentMapId: "test-fixture-display-map-overview",
            zoom: {
              minimum: 15,
              maximum: 18,
              enterDetailAt: 16,
              leaveDetailBelow: 15.5,
            },
          }),
        ]),
      ),
    ).toThrow(/enterDetailAt|maximum/u);
  });

  it("全点同一のzero-area ringを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            spatialBinding: {
              kind: "georeferenced-coverage",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [139.7, 35.65],
                    [139.7, 35.65],
                    [139.7, 35.65],
                    [139.7, 35.65],
                  ],
                ],
              },
            },
          }),
        ]),
      ),
    ).toThrow(/3点以上|面積0/u);
  });

  it("一直線のzero-area ringを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            spatialBinding: {
              kind: "georeferenced-coverage",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [139.7, 35.65],
                    [139.8, 35.65],
                    [139.9, 35.65],
                    [139.7, 35.65],
                  ],
                ],
              },
            },
          }),
        ]),
      ),
    ).toThrow(/面積0/u);
  });

  it("閉じていないringを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            spatialBinding: {
              kind: "georeferenced-coverage",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [139.7, 35.65],
                    [139.8, 35.65],
                    [139.8, 35.75],
                    [139.7, 35.75],
                  ],
                ],
              },
            },
          }),
        ]),
      ),
    ).toThrow(/閉じたリング/u);
  });

  it("緯度経度範囲外を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          overviewFixture({
            spatialBinding: {
              kind: "georeferenced-coverage",
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [200, 35.65],
                    [139.8, 35.65],
                    [139.8, 35.75],
                    [139.7, 35.75],
                    [200, 35.65],
                  ],
                ],
              },
            },
          }),
        ]),
      ),
    ).toThrow(/範囲外/u);
  });

  it("正常なMultiPolygonを受理する", () => {
    const catalog = validateHistoricalMapDisplayCatalog(
      catalogWithMaps([
        overviewFixture({
          spatialBinding: {
            kind: "georeferenced-coverage",
            geometry: structuredClone(SAMPLE_MULTIPOLYGON),
          },
        }),
      ]),
    );
    expect(catalog.maps[0]?.spatialBinding.geometry.type).toBe("MultiPolygon");
  });

  it("正常な親子overlayとreferenceを受理する", () => {
    const catalog = validateHistoricalMapDisplayCatalog(
      catalogWithMaps([
        overviewFixture(),
        mapFixture({
          id: "test-fixture-display-map-detail",
          name: { ja: "試験用詳細地図" },
          displayRole: "detail",
          parentMapId: "test-fixture-display-map-overview",
          zoom: {
            minimum: 14,
            maximum: 18,
            enterDetailAt: 16,
            leaveDetailBelow: 15,
          },
        }),
        referenceFixture(),
      ]),
    );
    expect(catalog.maps).toHaveLength(3);
    expect(summarizeHistoricalMapDisplayCatalog(catalog).runtimeConnected).toBe(false);
  });

  it("publicへ混入せずruntimeから参照されていない", () => {
    expect(existsSync(join(ROOT, "public", "data", "historical-map-display-catalog.json"))).toBe(
      false,
    );
    expect(existsSync(join(ROOT, "public", "data", "historical-rasters"))).toBe(false);
    expect(findRuntimeHistoricalMapDisplayCatalogReferences(ROOT)).toEqual([]);
    expect(JSON.parse(readFileSync(join(ROOT, "src", "historical-raster-registry.json"), "utf8"))).toEqual(
      [],
    );
    const audit = auditHistoricalMapDisplayCatalogRepository(ROOT);
    expect(audit.errors).toEqual([]);
    expect(audit.catalog?.maps).toHaveLength(1);
  });

  it("src配下の間接参照を監査失敗にする", () => {
    const root = createAuditFixtureRoot({
      runtimeSource: {
        relativePath: "src/layers/display.ts",
        content: 'export const path = "data-curation/historical-map-display-catalog.json";\n',
      },
    });
    const audit = auditHistoricalMapDisplayCatalogRepository(root);
    expect(audit.errors.some((message) => message.includes("src/layers/display.ts"))).toBe(true);
  });

  it("scripts内の正当な参照はruntime監査の失敗対象にしない", () => {
    const root = createAuditFixtureRoot({ scriptReference: true });
    const audit = auditHistoricalMapDisplayCatalogRepository(root);
    expect(audit.errors).toEqual([]);
  });

  it("display modeとsource intendedUsesの一致を監査する", () => {
    const overlay = overviewFixture();
    const reference = referenceFixture({ parentMapId: "test-fixture-display-map-overview" });
    const matching = createAuditFixtureRoot({
      maps: [overlay, reference],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["georeferenced-overlay", "reference-panel"] }],
      assets: [referenceAssetFixture()],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(matching).errors).toEqual([]);

    const mismatched = createAuditFixtureRoot({
      maps: [overlay],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(mismatched).errors.some((message) => message.includes("georeferenced-overlay"))).toBe(true);
  });

  it("reference assetの存在・sourceId・公開状態を監査する", () => {
    const reference = referenceFixture({ publicationStatus: "shortlisted" });
    const matching = createAuditFixtureRoot({
      maps: [reference],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
      assets: [referenceAssetFixture()],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(matching).errors).toEqual([]);

    const missing = createAuditFixtureRoot({
      maps: [reference],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(missing).errors.some((message) => message.includes("reference asset"))).toBe(true);

    const mismatched = createAuditFixtureRoot({
      maps: [reference],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
      assets: [referenceAssetFixture({ sourceId: "other-source" })],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(mismatched).errors.some((message) => message.includes("sourceId"))).toBe(true);

    const publishedDisplay = createAuditFixtureRoot({
      maps: [referenceFixture({
        publicationStatus: "published",
        rightsReviewStatus: "approved",
        technicalReviewStatus: "approved",
      })],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
      assets: [referenceAssetFixture()],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(publishedDisplay).errors.some((message) => message.includes("published reference asset"))).toBe(true);
  });

  it("reference assetとのcrop不一致を拒否する", () => {
    const root = createAuditFixtureRoot({
      maps: [referenceFixture()],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
      assets: [referenceAssetFixture({ crop: { ...referenceAssetFixture().crop, x: 11 } })],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(root).errors.some((message) => message.includes("cropが"))).toBe(true);
  });

  it("reference assetとのremovedElements不一致を拒否する", () => {
    const root = createAuditFixtureRoot({
      maps: [referenceFixture()],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
      assets: [referenceAssetFixture({ removedElements: ["color-chart", "ruler"] })],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(root).errors.some((message) => message.includes("removedElements"))).toBe(true);
  });

  it("reference assetとのpreservesHistoricalContent不一致を拒否する", () => {
    const root = createAuditFixtureRoot({
      maps: [referenceFixture()],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
      assets: [referenceAssetFixture({ preservesHistoricalContent: false })],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(root).errors.some((message) => message.includes("preservesHistoricalContent"))).toBe(true);
  });

  it("reference assetとのcropReview.note不一致を拒否する", () => {
    const root = createAuditFixtureRoot({
      maps: [referenceFixture()],
      candidates: [{ candidateId: "test-fixture-source", intendedUses: ["reference-panel"] }],
      assets: [referenceAssetFixture({ cropReviewNote: { ja: "異なる説明です。" } })],
    });
    expect(auditHistoricalMapDisplayCatalogRepository(root).errors.some((message) => message.includes("cropReview note"))).toBe(true);
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
  });
});
