/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EDO_SOURCE_DATASET_ID,
  auditEdoPlaceCurationCandidateRepository,
  calculateEdoSourceFeatureSha256,
  validateEdoPlaceCurationCatalog,
} from "../scripts/edo-place-curation-candidates.mjs";

const ROOT = process.cwd();
const source = JSON.parse(readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"));
const catalog = JSON.parse(readFileSync(join(ROOT, "data-curation/edo-place-curation-candidates.json"), "utf8"));
const foundation = { ...catalog, catalogStatus: "empty-foundation", candidates: [] };
const temporaryRoots: string[] = [];
const clone = <T>(value: T): T => structuredClone(value);

function proposedReview() {
  return { status: "proposed", reviewedBy: null, reviewedAt: null, reviewNoteJa: null };
}

function candidate(type: "hide" | "rename" | "annotation" = "hide", sourceIndex = 0): any {
  const feature = source.features[sourceIndex];
  const proposals = {
    hide: { visibility: "hidden" },
    rename: { displayNameJa: `${feature.properties.name}（表示修正）`, preserveOriginalName: true },
    annotation: { noteType: "clarification", noteJa: "根拠資料との関係を補足します。" },
  };
  return {
    candidateId: `edo-place-curation-${type}-${sourceIndex}`,
    sourceDatasetId: EDO_SOURCE_DATASET_ID,
    target: {
      sourceIndex,
      entryId: feature.properties.id,
      sourceFeatureSha256: calculateEdoSourceFeatureSha256(feature),
      name: feature.properties.name,
      category: feature.properties.category,
      sheet: feature.properties.sheet,
      sourceUrl: feature.properties.source,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1],
    },
    proposalType: type,
    proposal: proposals[type],
    reasonCode: type === "rename" ? "orthography-normalization" : type === "annotation" ? "context-needed" : "duplicate",
    reasonJa: "元レコードと根拠資料を比較し、公開表示上の判断候補として記録します。",
    evidence: { basis: "source-record-comparison", urls: [feature.properties.source], noteJa: "CODHの元レコードとの比較根拠です。" },
    review: proposedReview(),
  };
}

function active(...candidates: ReturnType<typeof candidate>[]) {
  return { ...clone(foundation), catalogStatus: "active", candidates };
}

function expectInvalid(catalog: unknown, pattern?: RegExp) {
  expect(() => validateEdoPlaceCurationCatalog(catalog, source)).toThrow(pattern);
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("江戸地名キュレーション候補", () => {
  it("empty foundation・source SHA・8788件を受理する", () => {
    expect(validateEdoPlaceCurationCatalog(foundation, source).candidates).toHaveLength(0);
    expect(validateEdoPlaceCurationCatalog(catalog, source).candidates).toHaveLength(2);
    expect(auditEdoPlaceCurationCandidateRepository(ROOT).errors).toEqual([]);
    expect(source.features).toHaveLength(8788);
  });

  for (const type of ["hide", "rename", "annotation"] as const) {
    it(`valid ${type} candidateを受理する`, () => {
      expect(validateEdoPlaceCurationCatalog(active(candidate(type)), source).candidates).toHaveLength(1);
    });
  }

  for (const review of [
    proposedReview(),
    { status: "in-review", reviewedBy: "jigsawrin", reviewedAt: null, reviewNoteJa: null },
    { status: "approved", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "根拠を確認しました。" },
    { status: "rejected", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "根拠が不足しています。" },
    { status: "withdrawn", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "提案を取り下げました。" },
  ]) {
    it(`valid review ${review.status}を受理する`, () => {
      const item = candidate(review.status === "approved" ? "rename" : "annotation");
      item.review = review as typeof item.review;
      if (review.status === "approved") item.evidence.basis = "official-source";
      expect(validateEdoPlaceCurationCatalog(active(item), source).candidates).toHaveLength(1);
    });
  }

  it("fingerprintは決定的で別Featureとは異なる", () => {
    expect(calculateEdoSourceFeatureSha256(source.features[0])).toBe(calculateEdoSourceFeatureSha256(clone(source.features[0])));
    expect(calculateEdoSourceFeatureSha256(source.features[0])).not.toBe(calculateEdoSourceFeatureSha256(source.features[1]));
    expect(calculateEdoSourceFeatureSha256(source.features[0])).toMatch(/^[0-9a-f]{64}$/);
  });

  const topMutations: [string, (value: any) => void][] = [
    ["schemaVersion違い", (v) => { v.schemaVersion = 2; }],
    ["extra key", (v) => { v.extra = true; }],
    ["missing key", (v) => { delete v.sourceDataPath; }],
    ["catalogStatus不整合", (v) => { v.catalogStatus = "active"; }],
    ["sourceDatasetId違い", (v) => { v.sourceDatasetId = "other"; }],
    ["sourceDataPath違い", (v) => { v.sourceDataPath = "public/data/other.geojson"; }],
    ["source SHA違い", (v) => { v.sourceDataSha256 = "0".repeat(64); }],
    ["feature count違い", (v) => { v.sourceFeatureCount = 1; }],
  ];
  for (const [name, mutate] of topMutations) {
    it(`top-level異常: ${name}`, () => {
      const value = clone(foundation); mutate(value); expectInvalid(value);
    });
  }

  const targetMutations: [string, (item: any) => void][] = [
    ["sourceIndex負数", (c) => { c.target.sourceIndex = -1; }],
    ["sourceIndex小数", (c) => { c.target.sourceIndex = 0.5; }],
    ["sourceIndex範囲外", (c) => { c.target.sourceIndex = 8788; }],
    ["entryId mismatch", (c) => { c.target.entryId = "wrong"; }],
    ["name mismatch", (c) => { c.target.name = "wrong"; }],
    ["category mismatch", (c) => { c.target.category = "wrong"; }],
    ["sheet mismatch", (c) => { c.target.sheet = "wrong"; }],
    ["sourceUrl mismatch", (c) => { c.target.sourceUrl = "https://example.com/"; }],
    ["longitude mismatch", (c) => { c.target.longitude += 1; }],
    ["latitude mismatch", (c) => { c.target.latitude += 1; }],
    ["fingerprint mismatch", (c) => { c.target.sourceFeatureSha256 = "0".repeat(64); }],
    ["target extra key", (c) => { c.target.extra = true; }],
    ["target missing key", (c) => { delete c.target.name; }],
  ];
  for (const [name, mutate] of targetMutations) {
    it(`target異常: ${name}`, () => {
      const item = candidate(); mutate(item); expectInvalid(active(item));
    });
  }

  const proposalMutations: [string, "hide" | "rename" | "annotation", (item: any) => void][] = [
    ["unknown proposalType", "hide", (c) => { c.proposalType = "remove"; }],
    ["hide extra key", "hide", (c) => { c.proposal.extra = true; }],
    ["hide visibility違い", "hide", (c) => { c.proposal.visibility = "deleted"; }],
    ["rename空文字", "rename", (c) => { c.proposal.displayNameJa = ""; }],
    ["renameが元名と同じ", "rename", (c) => { c.proposal.displayNameJa = c.target.name; }],
    ["preserveOriginalName=false", "rename", (c) => { c.proposal.preserveOriginalName = false; }],
    ["rename extra key", "rename", (c) => { c.proposal.extra = true; }],
    ["annotation unknown noteType", "annotation", (c) => { c.proposal.noteType = "guess"; }],
    ["annotation空文字", "annotation", (c) => { c.proposal.noteJa = ""; }],
    ["annotation長過ぎ", "annotation", (c) => { c.proposal.noteJa = "あ".repeat(501); }],
    ["proposal missing key", "annotation", (c) => { delete c.proposal.noteJa; }],
  ];
  for (const [name, type, mutate] of proposalMutations) {
    it(`proposal異常: ${name}`, () => {
      const item = candidate(type); mutate(item); expectInvalid(active(item));
    });
  }

  for (const [name, value] of [
    ["C0", "説明\u0001"],
    ["C1", "説明\u0080"],
    ["DEL", "説明\u007f"],
    ["script", "<script>"],
    ["前後空白", " 説明"],
    ["最大長超過", "あ".repeat(1001)],
  ]) {
    it(`text安全性: ${name}`, () => {
      const item = candidate(); item.reasonJa = String(value); expectInvalid(active(item));
    });
  }

  const evidenceMutations: [string, (item: any) => void][] = [
    ["HTTP URL", (c) => { c.evidence.urls = ["http://example.com/"]; }],
    ["javascript URL", (c) => { c.evidence.urls = ["javascript:alert(1)"]; }],
    ["data URL", (c) => { c.evidence.urls = ["data:text/plain,x"]; }],
    ["file URL", (c) => { c.evidence.urls = ["file:///tmp/x"]; }],
    ["credentials付きURL", (c) => { c.evidence.urls = ["https://user:pass@127.0.0.1/"]; }],
    ["重複URL", (c) => { c.evidence.urls = [c.target.sourceUrl, c.target.sourceUrl]; }],
    ["URL 11件", (c) => { c.evidence.urls = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`); }],
    ["evidence extra key", (c) => { c.evidence.extra = true; }],
    ["approvedでURL 0件", (c) => { c.review = { status: "approved", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "確認済みです。" }; c.evidence.urls = []; }],
  ];
  for (const [name, mutate] of evidenceMutations) {
    it(`evidence異常: ${name}`, () => {
      const item = candidate(); mutate(item); expectInvalid(active(item));
    });
  }
  it("approved renameのbasis不正を拒否する", () => {
    const item = candidate("rename"); item.review = { status: "approved", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "確認済みです。" }; expectInvalid(active(item));
  });
  it("approved annotationのproject-reviewのみを拒否する", () => {
    const item = candidate("annotation"); item.review = { status: "approved", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "確認済みです。" }; item.evidence.basis = "project-review"; expectInvalid(active(item));
  });

  const reviewMutations: [string, (item: any) => void][] = [
    ["proposedにreviewedBy", (c) => { c.review.reviewedBy = "jigsawrin"; }],
    ["proposedにreviewedAt", (c) => { c.review.reviewedAt = "2026-07-28"; }],
    ["approvedでreviewedByなし", (c) => { c.review = { status: "approved", reviewedBy: null, reviewedAt: "2026-07-28", reviewNoteJa: "確認済みです。" }; }],
    ["approvedでreviewedAtなし", (c) => { c.review = { status: "approved", reviewedBy: "jigsawrin", reviewedAt: null, reviewNoteJa: "確認済みです。" }; }],
    ["approvedでreviewNoteJaなし", (c) => { c.review = { status: "approved", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: null }; }],
    ["不正日付形式", (c) => { c.review = { status: "rejected", reviewedBy: "jigsawrin", reviewedAt: "28-07-2026", reviewNoteJa: "確認済みです。" }; }],
    ["reviewedBy不正文字", (c) => { c.review = { status: "in-review", reviewedBy: "Real Name", reviewedAt: null, reviewNoteJa: null }; }],
    ["unknown status", (c) => { c.review.status = "done"; }],
    ["review extra key", (c) => { c.review.extra = true; }],
  ];
  for (const [name, mutate] of reviewMutations) {
    it(`review異常: ${name}`, () => {
      const item = candidate(); mutate(item); expectInvalid(active(item));
    });
  }

  it("candidateId重複を拒否する", () => expectInvalid(active(candidate("hide", 0), candidate("hide", 1).constructor ? { ...candidate("hide", 1), candidateId: candidate("hide", 0).candidateId } : candidate("hide", 1))));
  it("sourceIndex + proposalType重複を拒否する", () => {
    const one = candidate("hide"); const two = clone(one); two.candidateId = "edo-place-curation-hide-copy"; expectInvalid(active(one, two));
  });
  for (const otherType of ["rename", "annotation"] as const) {
    it(`approved hide + approved ${otherType}を拒否する`, () => {
      const hide = candidate("hide"); const other = candidate(otherType);
      for (const item of [hide, other]) item.review = { status: "approved", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "確認済みです。" };
      if (otherType === "rename") other.evidence.basis = "official-source";
      expectInvalid(active(hide, other));
    });
  }
  for (const type of ["rename", "annotation"] as const) {
    it(`approved ${type}複数を拒否する`, () => {
      const one = candidate(type); const two = clone(one); two.candidateId = `edo-place-curation-${type}-copy`;
      for (const item of [one, two]) {
        item.review = { status: "approved", reviewedBy: "jigsawrin", reviewedAt: "2026-07-28", reviewNoteJa: "確認済みです。" };
        if (type === "rename") item.evidence.basis = "official-source";
      }
      expectInvalid(active(one, two));
    });
  }
  for (const [name, mutate] of [
    ["candidateId形式", (item: any) => { item.candidateId = "Bad ID"; }],
    ["candidate extra key", (item: any) => { item.extra = true; }],
    ["candidate missing key", (item: any) => { delete item.reasonJa; }],
    ["candidate dataset違い", (item: any) => { item.sourceDatasetId = "other"; }],
  ] as const) {
    it(`${name}を拒否する`, () => {
      const item = candidate(); mutate(item); expectInvalid(active(item));
    });
  }

  for (const area of ["public", "dist"] as const) {
    it(`${area}にcatalogを置くと失敗する`, () => {
      const root = mkdtempSync(join(tmpdir(), "edo-curation-")); temporaryRoots.push(root);
      mkdirSync(join(root, "data-curation"), { recursive: true }); mkdirSync(join(root, "public", "data"), { recursive: true }); mkdirSync(join(root, area), { recursive: true });
      writeFileSync(join(root, "data-curation", "edo-place-curation-candidates.json"), JSON.stringify(foundation));
      writeFileSync(join(root, "public", "data", "edo-places.geojson"), JSON.stringify(source));
      writeFileSync(join(root, area, "edo-place-curation-candidates.json"), "{}");
      expect(auditEdoPlaceCurationCandidateRepository(root).errors.some((message) => message.includes("private catalog"))).toBe(true);
    });
  }
  it("bundleへprivate fieldが入ると失敗する", () => {
    const root = mkdtempSync(join(tmpdir(), "edo-curation-")); temporaryRoots.push(root);
    mkdirSync(join(root, "data-curation"), { recursive: true }); mkdirSync(join(root, "public", "data"), { recursive: true }); mkdirSync(join(root, "dist", "assets"), { recursive: true });
    writeFileSync(join(root, "data-curation", "edo-place-curation-candidates.json"), JSON.stringify(foundation));
    writeFileSync(join(root, "public", "data", "edo-places.geojson"), JSON.stringify(source));
    writeFileSync(join(root, "dist", "assets", "index.js"), "const privateField='sourceFeatureSha256';");
    expect(auditEdoPlaceCurationCandidateRepository(root).errors.some((message) => message.includes("混入"))).toBe(true);
  });
});
