import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditHistoricalControlPointCatalogRepository,
  loadHistoricalControlPointCatalog,
  summarizeHistoricalControlPointCatalog,
  validateHistoricalControlPointCatalog,
} from "../scripts/historical-control-point-catalog.mjs";

const ROOT = join(__dirname, "..");
const sha256 = (path: string) =>
  createHash("sha256").update(readFileSync(join(ROOT, path))).digest("hex");

const EMPTY_CATALOG = Object.freeze({
  schemaVersion: 1,
  reviewedAt: null,
  catalogStatus: "empty-foundation",
  entries: [],
});

/** Test-only fixtures. Never write these into data-curation production catalog. */
function eligibleFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-fixture-control-point-a",
    name: { ja: "試験用基準点A", en: "Test control point A" },
    description: { ja: "検証専用の架空地点です。" },
    featureType: "castle-gate",
    currentExistence: "extant",
    movedStatus: "not-moved",
    latitude: 35.6895,
    longitude: 139.6917,
    coordinateAccuracy: "official-published-coordinate",
    eligibility: "eligible-candidate",
    applicableRegionIds: ["edo"],
    applicableEraIds: ["edo-late"],
    sourceIds: ["test-fixture-source"],
    evidenceUrls: [
      "https://github.com/jigsawrin/edo-history-map/tree/main/tests/historical-control-point-catalog.test.ts",
    ],
    identityBasis: { ja: "テストfixtureの固定識別根拠です。" },
    coordinateBasis: { ja: "テストfixtureの固定座標根拠です。" },
    ...overrides,
  };
}

function validationOnlyFixture(overrides: Record<string, unknown> = {}) {
  return eligibleFixture({
    id: "test-fixture-control-point-b",
    name: { ja: "試験用基準点B", en: "Test control point B" },
    eligibility: "validation-only-candidate",
    movedStatus: "possibly-moved",
    coordinateAccuracy: "official-map-derived",
    ...overrides,
  });
}

function catalogWithEntries(entries: Record<string, unknown>[], reviewedAt = "2026-07-19") {
  return {
    schemaVersion: 1,
    reviewedAt,
    catalogStatus: "reviewed",
    entries,
  };
}

describe("歴史基準点カタログ基盤", () => {
  it("正常な空カタログを読み込み、0件・empty-foundationを返す", () => {
    const catalog = loadHistoricalControlPointCatalog(ROOT);
    expect(catalog).toEqual(EMPTY_CATALOG);
    expect(summarizeHistoricalControlPointCatalog(catalog)).toMatchObject({
      schemaVersion: 1,
      catalogStatus: "empty-foundation",
      entryCount: 0,
      transformPromotionCount: 0,
    });
  });

  it("schemaVersion不正を拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog({ ...EMPTY_CATALOG, schemaVersion: 2 }),
    ).toThrow(/schemaVersion/u);
  });

  it("empty-foundationでentriesありを拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog({
        ...EMPTY_CATALOG,
        entries: [eligibleFixture()],
      }),
    ).toThrow(/empty-foundation/u);
  });

  it("reviewedでreviewedAtなしを拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog({
        schemaVersion: 1,
        reviewedAt: null,
        catalogStatus: "reviewed",
        entries: [],
      }),
    ).toThrow(/reviewedAt/u);
  });

  it("ID重複を拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture(), eligibleFixture({ id: "test-fixture-control-point-a" })]),
      ),
    ).toThrow(/重複/u);
  });

  it("HTML文字列を拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture({ name: { ja: "<b>門</b>" } })]),
      ),
    ).toThrow(/name\.ja/u);
  });

  it("制御文字を拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture({ description: { ja: "説明\u0001不正" } })]),
      ),
    ).toThrow(/description\.ja/u);
  });

  it("不正HTTPS URLを拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([
          eligibleFixture({ evidenceUrls: ["http://example.com/evidence"] }),
        ]),
      ),
    ).toThrow(/HTTPS/u);
  });

  it("URL認証情報を拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([
          eligibleFixture({
            evidenceUrls: ["https://user:secret@192.0.2.1/evidence"],
          }),
        ]),
      ),
    ).toThrow(/認証情報/u);
  });

  it("uncertainをeligible-candidateにできない", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture({ currentExistence: "uncertain" })]),
      ),
    ).toThrow(/uncertain/u);
  });

  it("movedをeligible-candidateにできない", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture({ movedStatus: "moved" })]),
      ),
    ).toThrow(/moved/u);
  });

  it("approximate座標をeligible-candidateにできない", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture({ coordinateAccuracy: "approximate" })]),
      ),
    ).toThrow(/approximate/u);
  });

  it("rejectedで理由なしを拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([
          eligibleFixture({
            eligibility: "rejected",
            currentExistence: "uncertain",
            movedStatus: "unknown",
            coordinateAccuracy: "unknown",
          }),
        ]),
      ),
    ).toThrow(/rejectionReason/u);
  });

  it("正常なeligibleテストfixtureを受理し、transform確定を意味しない", () => {
    const catalog = validateHistoricalControlPointCatalog(
      catalogWithEntries([eligibleFixture()]),
    );
    expect(catalog.entries).toHaveLength(1);
    expect(catalog.entries[0]?.eligibility).toBe("eligible-candidate");
    expect(summarizeHistoricalControlPointCatalog(catalog).transformPromotionCount).toBe(0);
  });

  it("正常なvalidation-onlyテストfixtureを受理する", () => {
    const catalog = validateHistoricalControlPointCatalog(
      catalogWithEntries([validationOnlyFixture()]),
    );
    expect(catalog.entries[0]?.eligibility).toBe("validation-only-candidate");
    expect(catalog.entries[0]?.movedStatus).toBe("possibly-moved");
  });

  it("日本語必須・英語空文字を拒否する", () => {
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture({ name: { en: "Only English" } })]),
      ),
    ).toThrow(/name\.ja/u);
    expect(() =>
      validateHistoricalControlPointCatalog(
        catalogWithEntries([eligibleFixture({ name: { ja: "試験", en: "" } })]),
      ),
    ).toThrow(/name\.en/u);
  });

  it("publicへカタログを混入させず、runtimeからimportされていない", () => {
    expect(existsSync(join(ROOT, "public", "data", "historical-control-point-catalog.json"))).toBe(
      false,
    );
    expect(existsSync(join(ROOT, "public", "data", "historical-rasters"))).toBe(false);
    const main = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
    expect(main).not.toMatch(/historical-control-point-catalog/u);
    expect(JSON.parse(readFileSync(join(ROOT, "src", "historical-raster-registry.json"), "utf8"))).toEqual(
      [],
    );
    const audit = auditHistoricalControlPointCatalogRepository(ROOT);
    expect(audit.errors).toEqual([]);
    expect(audit.catalog?.entries).toHaveLength(0);
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
