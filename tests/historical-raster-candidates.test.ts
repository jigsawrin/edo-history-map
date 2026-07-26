import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
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
const candidateRecords = (data: Record<string, unknown>) => data.candidates as Record<string, unknown>[];
const findCandidate = (data: Record<string, unknown>, candidateId: string) =>
  candidateRecords(data).find((candidate) => candidate.candidateId === candidateId)!;
const WADAKURA_ID = "tokyo-archive-4300033114-wadakura-gate";
const BABASAKI_ID = "tokyo-archive-4300033114-babasaki-gate";

describe("古地図候補台帳", () => {
  it("17候補・4所蔵機関をapproved 15、pending 1、rejected 1へ固定する", () => {
    const registry = loadHistoricalRasterCandidateRegistry(ROOT);
    expect(summarizeHistoricalRasterCandidates(registry)).toEqual({
      total: 17,
      institutions: 4,
      approved: 15,
      pending: 1,
      rejected: 1,
      commercialUseCompatible: 15,
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
      imageUnit: {
        id: "figure-01-wadakura-gate",
        ordinal: 1,
        labelJa: "第1図 和田倉御門",
      },
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

  it("馬場先御門を指定値のreference-panel専用candidateとして登録する", () => {
    const registry = loadHistoricalRasterCandidateRegistry(ROOT);
    const target = registry.candidates.find((candidate) => candidate.candidateId === BABASAKI_ID);
    expect(target).toMatchObject({
      candidateId: BABASAKI_ID,
      intendedUses: ["reference-panel"],
      titleFamilyId: "edo-castle-outer-gates",
      imageUnit: {
        id: "figure-02-babasaki-gate",
        ordinal: 2,
        labelJa: "第2図 馬場先御門",
      },
      titleJa: "江戸城御外郭御門絵図 第2図 馬場先御門",
      titleOriginal: "江戸城御外郭御門絵図 全（題簽） 第2図 馬場先御門",
      provider: "東京都立図書館デジタルアーカイブ TOKYOアーカイブ",
      holdingInstitution: "東京都立中央図書館",
      series: "江戸城御外郭御門絵図（26図）",
      sheetNumber: "第2図 / 請求記号6194-2・東6194-002 / 資料コード4300033114",
      publicationYearDisplay: "享保2年（1717）",
      historicalPeriod: "江戸中期",
      regionId: "edo",
      eraId: "edo-middle",
      approximateCoverageJa: "馬場先御門の門構造（正確な測地範囲は未確定）",
      likelyModernCoverageJa: "馬場先門跡・馬場先門橋周辺とされるが、図面の正確な現代対応範囲は未確定",
      exactItemUrl: "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960",
      exactImageUrl: null,
      exactViewerUrl: "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960",
      rightsEvidenceUrls: [
        "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960",
        "https://archive.library.metro.tokyo.lg.jp/da/windowRequestImage2",
      ],
      directDownloadAvailable: true,
      iiifAvailable: false,
      commercialUseCompatible: true,
      redistributionAllowed: true,
      modificationAllowed: true,
      croppingAllowed: true,
      georeferencingAllowed: null,
      tilingAllowed: null,
      attributionRequired: false,
      attributionRecommendedTextJa: "『江戸城御外郭御門絵図 第2図 馬場先御門』（東京都立中央図書館所蔵）（部分・加工）",
      loginRequired: false,
      paywallRequired: false,
      reviewStatus: "approved",
      rightsReviewStatus: "approved",
      technicalReviewStatus: "not-started",
      publicationStatus: "candidate",
      reviewReasonCode: "public-domain-open-data",
      technicalSuitability: "medium",
      rightsSuitability: "high",
      imageFileAvailable: true,
      expectedResolutionSuitability: "medium",
      expectedControlPointAvailability: "low",
      expectedSeamRisk: "low",
      expectedCoverageBreadth: "narrow",
      expectedTileSizeRisk: "low",
      priorityScore: 71,
    });
    expect(target?.reviewReasonJa).toContain("2026-07-26");
    expect(target?.notesJa).toContain("trigger polygonは未評価");
  });

  it("単一exactItemUrlではimageUnitなしの既存candidateを受理する", () => {
    const registry = validateHistoricalRasterCandidateRegistry(clone());
    const target = registry.candidates.find((candidate) => candidate.candidateId === "tokyo-archive-00042226-daimyo-koji-1863");
    expect(target?.imageUnit).toBeUndefined();
  });

  it("単一exactItemUrlでは正常なimageUnitも受理する", () => {
    const data = clone();
    candidateRecords(data)[0]!.imageUnit = { id: "sheet-01", ordinal: 1, labelJa: "第1図" };
    expect(() => validateHistoricalRasterCandidateRegistry(data)).not.toThrow();
  });

  it("同一exactItemUrlの異なるimageUnitを同一titleFamilyとして受理する", () => {
    const registry = validateHistoricalRasterCandidateRegistry(clone());
    const family = registry.candidates.filter((candidate) => candidate.titleFamilyId === "edo-castle-outer-gates");
    expect(family).toHaveLength(2);
    expect(new Set(family.map((candidate) => candidate.exactItemUrl)).size).toBe(1);
    expect(new Set(family.map((candidate) => (candidate.imageUnit as { id: string }).id)).size).toBe(2);
  });

  it("大文字hostname・default HTTPS portをcanonicalizeして同一URLとして共有判定する", () => {
    const accepted = clone();
    findCandidate(accepted, BABASAKI_ID).exactItemUrl =
      "https://ARCHIVE.LIBRARY.METRO.TOKYO.LG.JP:443/da/detail?tilcod=0000000002-00006960";
    const registry = validateHistoricalRasterCandidateRegistry(accepted);
    expect(registry.candidates.find((candidate) => candidate.candidateId === BABASAKI_ID)?.exactItemUrl)
      .toBe("https://ARCHIVE.LIBRARY.METRO.TOKYO.LG.JP:443/da/detail?tilcod=0000000002-00006960");

    const missingImageUnit = clone();
    findCandidate(missingImageUnit, BABASAKI_ID).exactItemUrl =
      "https://ARCHIVE.LIBRARY.METRO.TOKYO.LG.JP:443/da/detail?tilcod=0000000002-00006960";
    delete findCandidate(missingImageUnit, BABASAKI_ID).imageUnit;
    expect(() => validateHistoricalRasterCandidateRegistry(missingImageUnit)).toThrow(/全候補にimageUnit/u);
  });

  it("query parameter順をcanonicalizeして共有判定する", () => {
    const data = clone();
    const left = candidateRecords(data)[0]!;
    const right = candidateRecords(data)[1]!;
    left.exactItemUrl = "https://example.com/item?b=2&a=1";
    right.exactItemUrl = "https://EXAMPLE.COM:443/item?a=1&b=2";
    left.imageUnit = { id: "sheet-01", ordinal: 1, labelJa: "第1図" };
    right.imageUnit = { id: "sheet-02", ordinal: 2, labelJa: "第2図" };
    for (const field of ["titleFamilyId", "provider", "holdingInstitution", "series", "publicationYearDisplay", "historicalPeriod"]) {
      left[field] = right[field] = field === "titleFamilyId" ? "canonical-query-order" : left[field];
    }
    expect(() => validateHistoricalRasterCandidateRegistry(data)).not.toThrow();
  });

  it.each([
    ["fragment", "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960#figure-02"],
    ["追加query（後置）", "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960&fake=2"],
    ["追加query（前置）", "https://archive.library.metro.tokyo.lg.jp/da/detail?fake=2&tilcod=0000000002-00006960"],
    ["tilcod重複", "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960&tilcod=0000000002-00006960"],
    ["tilcod欠落", "https://archive.library.metro.tokyo.lg.jp/da/detail"],
    ["空tilcod", "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod="],
    ["認証情報", "https://user:password@localhost/da/detail?tilcod=0000000002-00006960"],
  ])("TOKYOアーカイブdetail URLの%sを拒否する", (_label, exactItemUrl) => {
    const data = clone();
    findCandidate(data, BABASAKI_ID).exactItemUrl = exactItemUrl;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/exactItemUrl/u);
  });

  it.each([
    ["先頭空白", " https://example.com/item"],
    ["末尾空白", "https://example.com/item "],
    ["C0制御文字", "https://example.com/\u001fitem"],
    ["C1制御文字", "https://example.com/\u0085item"],
  ])("exactItemUrlの%sを拒否する", (_label, exactItemUrl) => {
    const data = clone();
    candidateRecords(data)[0]!.exactItemUrl = exactItemUrl;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/exactItemUrl/u);
  });

  it("共有exactItemUrlの片方だけimageUnitなしを拒否する", () => {
    const data = clone();
    delete findCandidate(data, WADAKURA_ID).imageUnit;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/全候補にimageUnit/u);
  });

  it("共有exactItemUrlのimageUnit.id重複とsource image-unit key重複を拒否する", () => {
    const data = clone();
    findCandidate(data, BABASAKI_ID).imageUnit = structuredClone(findCandidate(data, WADAKURA_ID).imageUnit);
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/source image-unit key/u);
  });

  it("canonical化後に同一source image-unit keyとなるcandidateを拒否する", () => {
    const data = clone();
    const babasaki = findCandidate(data, BABASAKI_ID);
    babasaki.exactItemUrl =
      "https://ARCHIVE.LIBRARY.METRO.TOKYO.LG.JP:443/da/detail?tilcod=0000000002-00006960";
    babasaki.imageUnit = structuredClone(findCandidate(data, WADAKURA_ID).imageUnit);
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/source image-unit key/u);
  });

  it("共有exactItemUrlのimageUnit.ordinal重複を拒否する", () => {
    const data = clone();
    (findCandidate(data, BABASAKI_ID).imageUnit as Record<string, unknown>).ordinal = 1;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(/imageUnit\.ordinal/u);
  });

  it("共有exactItemUrlではtitleFamilyId必須かつ一致を要求する", () => {
    const missing = clone();
    delete findCandidate(missing, BABASAKI_ID).titleFamilyId;
    expect(() => validateHistoricalRasterCandidateRegistry(missing)).toThrow(/titleFamilyIdが必要/u);
    const mismatched = clone();
    findCandidate(mismatched, BABASAKI_ID).titleFamilyId = "other-family";
    expect(() => validateHistoricalRasterCandidateRegistry(mismatched)).toThrow(/titleFamilyIdが一致/u);
  });

  it.each(["provider", "holdingInstitution", "series", "publicationYearDisplay", "historicalPeriod"])(
    "共有exactItemUrlの%s不一致を拒否する",
    (field) => {
      const data = clone();
      findCandidate(data, BABASAKI_ID)[field] = "不一致";
      expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(new RegExp(`${field}が一致`, "u"));
    },
  );

  it.each([
    ["object以外", [], /imageUnitはobject/u],
    ["不正id", { id: "Figure 02", ordinal: 2, labelJa: "第2図" }, /imageUnit\.id/u],
    ["ordinal 0", { id: "figure-02", ordinal: 0, labelJa: "第2図" }, /imageUnit\.ordinal/u],
    ["非整数ordinal", { id: "figure-02", ordinal: 1.5, labelJa: "第2図" }, /imageUnit\.ordinal/u],
    ["ordinal 1000", { id: "figure-02", ordinal: 1000, labelJa: "第2図" }, /imageUnit\.ordinal/u],
    ["空labelJa", { id: "figure-02", ordinal: 2, labelJa: "  " }, /imageUnit\.labelJa/u],
    ["制御文字labelJa", { id: "figure-02", ordinal: 2, labelJa: "第2図\u0000" }, /imageUnit\.labelJa/u],
    ["C1制御文字labelJa", { id: "figure-02", ordinal: 2, labelJa: "第2図\u0085馬場先御門" }, /imageUnit\.labelJa/u],
    ["HTML labelJa", { id: "figure-02", ordinal: 2, labelJa: "<b>第2図</b>" }, /imageUnit\.labelJa/u],
    ["HTML comment labelJa", { id: "figure-02", ordinal: 2, labelJa: "<!-- comment -->" }, /imageUnit\.labelJa/u],
    ["不完全HTML labelJa", { id: "figure-02", ordinal: 2, labelJa: "<svg/onload=alert(1)>" }, /imageUnit\.labelJa/u],
    ["過長labelJa", { id: "figure-02", ordinal: 2, labelJa: "図".repeat(121) }, /imageUnit\.labelJa/u],
    ["extra key", { id: "figure-02", ordinal: 2, labelJa: "第2図", fileName: "guess.jpg" }, /未定義キー/u],
  ])("imageUnitの%sを拒否する", (_label, imageUnit, error) => {
    const data = clone();
    candidateRecords(data)[0]!.imageUnit = imageUnit;
    expect(() => validateHistoricalRasterCandidateRegistry(data)).toThrow(error);
  });

  it("intendedUsesをoverlay専用15件・reference-panel専用2件へ固定する", () => {
    const candidates = loadHistoricalRasterCandidateRegistry(ROOT).candidates;
    expect(candidates.filter((candidate) => candidate.intendedUses.join() === "georeferenced-overlay")).toHaveLength(15);
    expect(candidates.filter((candidate) => candidate.intendedUses.join() === "reference-panel")).toHaveLength(2);
    for (const id of [WADAKURA_ID, BABASAKI_ID]) {
      expect(candidates.find((candidate) => candidate.candidateId === id)).toMatchObject({
        georeferencingAllowed: null,
        tilingAllowed: null,
      });
    }
  });

  it("馬場先candidateをasset・display・runtime・publicへ接続しない", () => {
    const assets = JSON.parse(readFileSync(join(ROOT, "data-curation", "historical-reference-assets.json"), "utf8"));
    const displays = JSON.parse(readFileSync(join(ROOT, "data-curation", "historical-map-display-catalog.json"), "utf8"));
    const runtime = JSON.parse(readFileSync(join(ROOT, "src", "historical-reference-panel-registry.json"), "utf8"));
    const publicFiles = readdirSync(join(ROOT, "public"), { recursive: true }).map(String);
    expect(assets.assets).toHaveLength(1);
    expect(displays.maps).toHaveLength(1);
    expect(runtime.entries).toHaveLength(1);
    expect(JSON.stringify({ assets, displays, runtime, publicFiles })).not.toContain("babasaki");
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

  it("候補ID重複・平文URLを拒否する", () => {
    for (const mutation of [
      (candidates: Record<string, unknown>[]) => { candidates[1]!.candidateId = candidates[0]!.candidateId; },
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
    expect(audit.registry?.candidates).toHaveLength(17);
  });
});
