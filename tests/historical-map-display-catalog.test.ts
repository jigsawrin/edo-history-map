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
  type: "Polygon",
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

/** Test-only fixtures. Never write these into production catalog. */
function mapFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-fixture-display-map-a",
    name: { ja: "試験用表示地図A", en: "Test display map A" },
    displayRole: "regional",
    displayMode: "georeferenced-overlay",
    crop: {
      sourceWidth: 1000,
      sourceHeight: 800,
      x: 10,
      y: 20,
      width: 400,
      height: 300,
      rotationDegrees: 0,
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
    coveragePolygon: structuredClone(SAMPLE_POLYGON),
    sourceId: "test-fixture-source",
    rightsReviewStatus: "pending",
    technicalReviewStatus: "not-started",
    publicationStatus: "candidate",
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
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "historical-map-display-catalog-"));
  tempRoots.push(root);
  mkdirSync(join(root, "data-curation"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "data-curation", "historical-map-display-catalog.json"),
    `${JSON.stringify(EMPTY_CATALOG, null, 2)}\n`,
    "utf8",
  );
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
  it("正常な空カタログを読み込み、0件・empty-foundationを返す", () => {
    const catalog = loadHistoricalMapDisplayCatalog(ROOT);
    expect(catalog).toEqual(EMPTY_CATALOG);
    expect(summarizeHistoricalMapDisplayCatalog(catalog)).toMatchObject({
      schemaVersion: 1,
      catalogStatus: "empty-foundation",
      mapCount: 0,
      runtimeEligibleCount: 0,
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
        maps: [mapFixture()],
      }),
    ).toThrow(/empty-foundation/u);
  });

  it("reviewedでreviewedAtなしを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog({
        schemaVersion: 1,
        catalogStatus: "reviewed",
        reviewedAt: null,
        maps: [],
      }),
    ).toThrow(/reviewedAt/u);
  });

  it("ID重複を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([mapFixture(), mapFixture({ id: "test-fixture-display-map-a" })]),
      ),
    ).toThrow(/重複/u);
  });

  it("HTML文字列を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([mapFixture({ name: { ja: "<b>地図</b>" } })]),
      ),
    ).toThrow(/name\.ja/u);
  });

  it("cropが元画像外側なら拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            crop: {
              sourceWidth: 100,
              sourceHeight: 100,
              x: 80,
              y: 0,
              width: 40,
              height: 40,
              rotationDegrees: 0,
            },
          }),
        ]),
      ),
    ).toThrow(/外側/u);
  });

  it("crop width/heightが正数でない場合を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            crop: {
              sourceWidth: 100,
              sourceHeight: 100,
              x: 0,
              y: 0,
              width: 0,
              height: 10,
              rotationDegrees: 0,
            },
          }),
        ]),
      ),
    ).toThrow(/width/u);
  });

  it("rotationDegrees不正を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            crop: {
              sourceWidth: 100,
              sourceHeight: 100,
              x: 0,
              y: 0,
              width: 50,
              height: 50,
              rotationDegrees: 45,
            },
          }),
        ]),
      ),
    ).toThrow(/rotationDegrees/u);
  });

  it("reference-onlyとgeoreferenced-overlayの組み合わせを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            displayRole: "reference-only",
            displayMode: "georeferenced-overlay",
          }),
        ]),
      ),
    ).toThrow(/reference-only/u);
  });

  it("technical approvedでないpublishedを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            rightsReviewStatus: "approved",
            technicalReviewStatus: "in-review",
            publicationStatus: "published",
          }),
        ]),
      ),
    ).toThrow(/technicalReviewStatus/u);
  });

  it("parentMapIdの自己参照を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            id: "test-fixture-display-map-a",
            parentMapId: "test-fixture-display-map-a",
          }),
        ]),
      ),
    ).toThrow(/自己参照/u);
  });

  it("parent循環を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            id: "test-fixture-display-map-a",
            parentMapId: "test-fixture-display-map-b",
          }),
          mapFixture({
            id: "test-fixture-display-map-b",
            name: { ja: "試験用表示地図B" },
            parentMapId: "test-fixture-display-map-a",
          }),
        ]),
      ),
    ).toThrow(/循環/u);
  });

  it("minZoom > maxZoomを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            zoom: {
              minimum: 18,
              maximum: 12,
              enterDetailAt: 16,
              leaveDetailBelow: 15,
            },
          }),
        ]),
      ),
    ).toThrow(/minimum/u);
  });

  it("ヒステリシス不足を拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            zoom: {
              minimum: 12,
              maximum: 18,
              enterDetailAt: 15,
              leaveDetailBelow: 15,
            },
          }),
        ]),
      ),
    ).toThrow(/ヒステリシス/u);
  });

  it("不正なcoveragePolygonを拒否する", () => {
    expect(() =>
      validateHistoricalMapDisplayCatalog(
        catalogWithMaps([
          mapFixture({
            coveragePolygon: {
              type: "Polygon",
              coordinates: [[[139.7, 35.65], [139.8, 35.65]]],
            },
          }),
        ]),
      ),
    ).toThrow(/4点以上/u);
  });

  it("正常なfixtureと親子関係を受理する", () => {
    const catalog = validateHistoricalMapDisplayCatalog(
      catalogWithMaps([
        mapFixture({
          id: "test-fixture-display-map-parent",
          displayRole: "overview",
          publicationStatus: "candidate",
        }),
        mapFixture({
          id: "test-fixture-display-map-child",
          name: { ja: "試験用表示地図子" },
          displayRole: "detail",
          parentMapId: "test-fixture-display-map-parent",
          zoom: {
            minimum: 14,
            maximum: 19,
            enterDetailAt: 17,
            leaveDetailBelow: 16,
          },
        }),
      ]),
    );
    expect(catalog.maps).toHaveLength(2);
    expect(catalog.maps[1]?.parentMapId).toBe("test-fixture-display-map-parent");
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
    expect(audit.catalog?.maps).toHaveLength(0);
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
