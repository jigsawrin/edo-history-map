import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditHistoricalRasterCandidateRepository,
  loadHistoricalRasterCandidateRegistry,
  summarizeHistoricalRasterCandidates,
  validateHistoricalRasterCandidateRegistry,
  migrateHistoricalRasterCandidateRegistryV1,
  migrateHistoricalRasterCandidateRegistryV2,
} from "../scripts/historical-raster-candidates.mjs";

const ROOT = join(__dirname, "..");
const RAW = JSON.parse(readFileSync(join(ROOT, "data-curation", "historical-raster-candidates.json"), "utf8"));
const clone = (): Record<string, unknown> => structuredClone(RAW) as Record<string, unknown>;

describe("古地図候補台帳", () => {
  it("16候補・4所蔵機関をapproved 14、pending 1、rejected 1へ固定する", () => {
    const registry = loadHistoricalRasterCandidateRegistry(ROOT);
    expect(summarizeHistoricalRasterCandidates(registry)).toEqual({
      total: 16,
      institutions: 4,
      approved: 14,
      pending: 1,
      rejected: 1,
      commercialUseCompatible: 14,
    });
  });

  it("schema v3で用途・権利・技術・公開状態を分離する", () => {
    const registry = loadHistoricalRasterCandidateRegistry(ROOT);
    expect(registry.schemaVersion).toBe(3);
    const target = registry.candidates.find((candidate) => candidate.candidateId === "taito-2017-chi-009-daimyo-koji");
    expect(target).toMatchObject({ reviewStatus: "approved", rightsReviewStatus: "approved", technicalReviewStatus: "rejected", publicationStatus: "shortlisted" });
  });

  it("v2を全候補overlay用途つきv3へ明示移行する", () => {
    const v2 = clone(); v2.schemaVersion = 2;
    v2.candidates = (v2.candidates as Record<string, unknown>[]).slice(0, 15);
    for (const candidate of v2.candidates as Record<string, unknown>[]) delete candidate.intendedUses;
    const migrated = migrateHistoricalRasterCandidateRegistryV2(v2) as typeof RAW;
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.candidates.every((candidate: { intendedUses?: string[] }) => candidate.intendedUses?.join() === "georeferenced-overlay")).toBe(true);
    expect(() => validateHistoricalRasterCandidateRegistry(v2)).not.toThrow();
  });

  it("v1を後方互換aliasつきv2へ明示移行する", () => {
    const v1 = structuredClone(RAW) as Record<string, unknown>;
    v1.schemaVersion = 1;
    v1.candidates = (v1.candidates as Record<string, unknown>[]).slice(0, 15);
    for (const candidate of v1.candidates as Record<string, unknown>[]) {
      delete candidate.rightsReviewStatus; delete candidate.technicalReviewStatus; delete candidate.publicationStatus;
    }
    const migrated = migrateHistoricalRasterCandidateRegistryV1(v1) as typeof RAW;
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.candidates[0]).toMatchObject({ rightsReviewStatus: migrated.candidates[0]!.reviewStatus, technicalReviewStatus: "not-started", publicationStatus: "candidate" });
    expect(() => validateHistoricalRasterCandidateRegistry(v1)).not.toThrow();
  });

  it("publishedにはrights/technicalの両approvedを要求し、shortlistedは本番rasterを要求しない", () => {
    const data = clone(); const candidate = (data.candidates as Record<string, unknown>[])[0]!;
    candidate.publicationStatus = "published"; candidate.technicalReviewStatus = "in-review";
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/published/u);
    candidate.publicationStatus = "shortlisted";
    expect(() => validateHistoricalRasterCandidateRegistry(data)).not.toThrow();
  });

  it("approvedは共通権利ゲートを満たし、overlay用途だけ位置合わせ・タイル化を要求する", () => {
    const approved = loadHistoricalRasterCandidateRegistry(ROOT).candidates.filter((candidate) => candidate.reviewStatus === "approved");
    for (const candidate of approved) {
      expect(candidate).toMatchObject({
        commercialUseCompatible: true,
        redistributionAllowed: true,
        modificationAllowed: true,
        croppingAllowed: true,
        rightsSuitability: "high",
        imageFileAvailable: true,
        loginRequired: false,
        paywallRequired: false,
      });
      if (candidate.intendedUses.includes("georeferenced-overlay")) {
        expect(candidate).toMatchObject({ georeferencingAllowed: true, tilingAllowed: true });
      }
    }
  });

  it("和田倉御門をreference-panel専用candidateとして登録する", () => {
    const registry = loadHistoricalRasterCandidateRegistry(ROOT);
    const target = registry.candidates.find((candidate) => candidate.candidateId === "tokyo-archive-4300033114-wadakura-gate");
    expect(target).toMatchObject({
      intendedUses: ["reference-panel"],
      rightsEvidenceUrls: [
        "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960",
        "https://archive.library.metro.tokyo.lg.jp/da/windowRequestImage2",
      ],
      rightsReviewStatus: "approved",
      technicalReviewStatus: "not-started",
      publicationStatus: "candidate",
      georeferencingAllowed: null,
      tilingAllowed: null,
    });
  });

  it.each(["commercialUseCompatible", "redistributionAllowed", "modificationAllowed", "croppingAllowed", "georeferencingAllowed", "tilingAllowed"])("approvedの%s=falseを拒否する", (field) => {
    const data = clone();
    const candidates = data.candidates as Record<string, unknown>[];
    candidates[0]![field] = false;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(field);
  });

  it.each([
    ["欠落", undefined], ["空配列", []], ["重複", ["georeferenced-overlay", "georeferenced-overlay"]],
    ["未知値", ["both"]], ["順序不正", ["reference-panel", "georeferenced-overlay"]],
  ])("intendedUsesの%sを拒否する", (_label, intendedUses) => {
    const data = clone(); const candidate = (data.candidates as Record<string, unknown>[])[0]!;
    if (intendedUses === undefined) delete candidate.intendedUses; else candidate.intendedUses = intendedUses;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/intendedUses/u);
  });

  it.each(["georeferencingAllowed", "tilingAllowed"])("reference-panel専用approvedは%s=falseを許可する", (field) => {
    const data = clone(); const candidate = (data.candidates as Record<string, unknown>[])[0]!;
    candidate.intendedUses = ["reference-panel"]; candidate[field] = false;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).not.toThrow();
  });

  it("reference-panel専用approvedはgeoreferencing/tilingの両nullを許可する", () => {
    const data = clone(); const candidate = (data.candidates as Record<string, unknown>[])[0]!;
    candidate.intendedUses = ["reference-panel"]; candidate.georeferencingAllowed = null; candidate.tilingAllowed = null;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).not.toThrow();
  });

  it("両用途approvedはoverlay権利条件を必須にする", () => {
    const data = clone(); const candidate = (data.candidates as Record<string, unknown>[])[0]!;
    candidate.intendedUses = ["georeferenced-overlay", "reference-panel"]; candidate.tilingAllowed = false;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/tilingAllowed/u);
  });

  it("pendingとrejectedを本番承認と混同しない", () => {
    const registry = loadHistoricalRasterCandidateRegistry(ROOT);
    const unavailable = registry.candidates.filter((candidate) => candidate.reviewStatus !== "approved");
    expect(unavailable.map((candidate) => candidate.candidateId)).toEqual([
      "naj-177-0646-edo-kiriezu-bundle",
      "ndl-000007297269-daimyo-koji-paper",
    ]);
    expect(JSON.parse(readFileSync(join(ROOT, "src", "historical-raster-registry.json"), "utf8"))).toEqual([]);
  });

  it("同題・異版・異所蔵を固有candidateIdと個別資料URLへ分離する", () => {
    const family = loadHistoricalRasterCandidateRegistry(ROOT).candidates.filter((candidate) => candidate.titleFamilyId === "daimyo-koji-central");
    expect(family).toHaveLength(5);
    expect(new Set(family.map((candidate) => candidate.candidateId)).size).toBe(5);
    expect(new Set(family.map((candidate) => candidate.exactItemUrl)).size).toBe(5);
    expect(new Set(family.map((candidate) => candidate.holdingInstitution))).toEqual(new Set([
      "東京都立中央図書館",
      "台東区立中央図書館",
      "国立国会図書館",
    ]));
  });

  it("既存candidate IDと用途以外の全履歴・権利・URL・priorityを維持する", () => {
    const candidates = (clone().candidates as Record<string, unknown>[]).slice(0, 15);
    const idsSha = createHash("sha256").update(JSON.stringify(candidates.map(({ candidateId }) => candidateId))).digest("hex");
    const priorFieldsSha = createHash("sha256").update(JSON.stringify(candidates.map((candidate) => Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "intendedUses"))))).digest("hex");
    expect(idsSha).toBe("a6f95c658645c00e8e7b9436b04c41e21f167a8f1fca6c7f2ba307d14b980713");
    expect(priorFieldsSha).toBe("0bf8e7c97fa22ceee049a3e8724c798fcb4a3489c7c0070d1b2f0b8bcdbaeedf");
  });

  it("候補ID重複・資料URL重複・平文URLを拒否する", () => {
    for (const mutation of [
      (candidates: Record<string, unknown>[]) => { candidates[1]!.candidateId = candidates[0]!.candidateId; },
      (candidates: Record<string, unknown>[]) => { candidates[1]!.exactItemUrl = candidates[0]!.exactItemUrl; },
      (candidates: Record<string, unknown>[]) => { candidates[0]!.exactItemUrl = "http://example.com/map"; },
    ]) {
      const data = clone();
      mutation(data.candidates as Record<string, unknown>[]);
      expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow();
    }
  });

  it("広告・寄付・NC除外の商用前提を台帳schemaで必須にする", () => {
    const data = clone();
    data.commercialContextJa = "一般公開を想定する。";
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow("商用利用前提");
  });

  it("本番レジストリ0件・public古地図0件の調査のみ経路を監査する", () => {
    const audit = auditHistoricalRasterCandidateRepository(ROOT);
    expect(audit.errors).toEqual([]);
    expect(audit.registry?.candidates).toHaveLength(16);
  });
});
