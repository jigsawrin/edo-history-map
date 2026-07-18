import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditHistoricalRasterCandidateRepository,
  loadHistoricalRasterCandidateRegistry,
  summarizeHistoricalRasterCandidates,
  validateHistoricalRasterCandidateRegistry,
} from "../scripts/historical-raster-candidates.mjs";

const ROOT = join(__dirname, "..");
const RAW = JSON.parse(readFileSync(join(ROOT, "data-curation", "historical-raster-candidates.json"), "utf8"));
const clone = (): Record<string, unknown> => structuredClone(RAW) as Record<string, unknown>;

describe("古地図候補台帳", () => {
  it("15候補・4所蔵機関をapproved 13、pending 1、rejected 1へ固定する", () => {
    const registry = loadHistoricalRasterCandidateRegistry(ROOT);
    expect(summarizeHistoricalRasterCandidates(registry)).toEqual({
      total: 15,
      institutions: 4,
      approved: 13,
      pending: 1,
      rejected: 1,
      commercialUseCompatible: 13,
    });
  });

  it("approvedは商用・再配布・加工・切り抜き・位置合わせ・タイル化の二重ゲートを満たす", () => {
    const approved = loadHistoricalRasterCandidateRegistry(ROOT).candidates.filter((candidate) => candidate.reviewStatus === "approved");
    for (const candidate of approved) {
      expect(candidate).toMatchObject({
        commercialUseCompatible: true,
        redistributionAllowed: true,
        modificationAllowed: true,
        croppingAllowed: true,
        georeferencingAllowed: true,
        tilingAllowed: true,
        rightsSuitability: "high",
        imageFileAvailable: true,
        loginRequired: false,
        paywallRequired: false,
      });
    }
  });

  it.each(["commercialUseCompatible", "redistributionAllowed", "modificationAllowed", "croppingAllowed", "georeferencingAllowed", "tilingAllowed"])("approvedの%s=falseを拒否する", (field) => {
    const data = clone();
    const candidates = data.candidates as Record<string, unknown>[];
    candidates[0]![field] = false;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(field);
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
    expect(audit.registry?.candidates).toHaveLength(15);
  });
});
