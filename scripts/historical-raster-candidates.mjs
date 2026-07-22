import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

const STATUS = new Set(["approved", "pending", "rejected"]);
const TECHNICAL_STATUS = new Set(["not-started", "in-review", "approved", "rejected"]);
const PUBLICATION_STATUS = new Set(["candidate", "shortlisted", "published"]);
const SUITABILITY = new Set(["high", "medium", "low"]);
const COVERAGE = new Set(["narrow", "medium", "broad"]);
export const HISTORICAL_SOURCE_INTENDED_USES = Object.freeze([
  "georeferenced-overlay",
  "reference-panel",
]);
const REASON_CODES = new Set([
  "cc-by-4.0",
  "image-unit-unavailable",
  "no-public-image",
  "public-domain-open-data",
]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const TEXT_FIELDS = [
  "candidateId",
  "titleJa",
  "titleOriginal",
  "provider",
  "holdingInstitution",
  "publicationYearDisplay",
  "historicalPeriod",
  "regionId",
  "eraId",
  "approximateCoverageJa",
  "likelyModernCoverageJa",
  "reviewReasonCode",
  "reviewReasonJa",
  "notesJa",
];
const BOOLEAN_OR_NULL_FIELDS = [
  "commercialUseCompatible",
  "redistributionAllowed",
  "modificationAllowed",
  "croppingAllowed",
  "georeferencingAllowed",
  "tilingAllowed",
  "attributionRequired",
];
const BOOLEAN_FIELDS = [
  "directDownloadAvailable",
  "iiifAvailable",
  "loginRequired",
  "paywallRequired",
  "imageFileAvailable",
];
const COMMON_APPROVAL_FIELDS = [
  "commercialUseCompatible",
  "redistributionAllowed",
  "modificationAllowed",
  "croppingAllowed",
];
const OVERLAY_APPROVAL_FIELDS = [
  "georeferencingAllowed",
  "tilingAllowed",
];
const CANDIDATE_KEYS = new Set([
  ...TEXT_FIELDS, "titleFamilyId", "series", "sheetNumber", "attributionRecommendedTextJa",
  "exactItemUrl", "exactImageUrl", "exactViewerUrl", "rightsEvidenceUrls", "intendedUses",
  ...BOOLEAN_FIELDS, ...BOOLEAN_OR_NULL_FIELDS, "reviewStatus", "rightsReviewStatus",
  "technicalReviewStatus", "publicationStatus", "technicalReviewReasonJa", "technicalSuitability",
  "rightsSuitability", "expectedResolutionSuitability", "expectedControlPointAvailability",
  "expectedSeamRisk", "expectedCoverageBreadth", "expectedTileSizeRisk", "priorityScore",
]);
const REGISTRY_KEYS = new Set(["schemaVersion", "reviewedAt", "commercialContextJa", "candidates"]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertHttps(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  assert(typeof value === "string", `${label}はHTTPS URLである必要があります`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label}はHTTPS URLである必要があります`);
  }
  assert(parsed.protocol === "https:" && !parsed.username && !parsed.password, `${label}は認証情報なしのHTTPS URLである必要があります`);
}

function migrateCandidateV1(candidate) {
  return {
    ...candidate,
    rightsReviewStatus: candidate.reviewStatus,
    technicalReviewStatus: "not-started",
    publicationStatus: "candidate",
  };
}

export function migrateHistoricalRasterCandidateRegistryV1(value) {
  if (!value || value.schemaVersion !== 1) return value;
  return { ...value, schemaVersion: 2, candidates: value.candidates.map(migrateCandidateV1) };
}

export function migrateHistoricalRasterCandidateRegistryV2(value) {
  if (!value || value.schemaVersion !== 2) return value;
  return {
    ...value,
    schemaVersion: 3,
    candidates: value.candidates.map((candidate) => ({
      ...candidate,
      intendedUses: ["georeferenced-overlay"],
    })),
  };
}

function validateCandidate(candidate, index) {
  const label = `候補${index + 1}`;
  assert(candidate && typeof candidate === "object" && !Array.isArray(candidate), `${label}がobjectではありません`);
  for (const key of Object.keys(candidate)) assert(CANDIDATE_KEYS.has(key), `${label}.${key}は未定義キーです`);
  for (const field of TEXT_FIELDS) assert(typeof candidate[field] === "string" && candidate[field].trim().length > 0, `${label}.${field}がありません`);
  assert(ID_PATTERN.test(candidate.candidateId), `${label}.candidateIdが不正です`);
  if (candidate.titleFamilyId !== undefined) assert(typeof candidate.titleFamilyId === "string" && ID_PATTERN.test(candidate.titleFamilyId), `${label}.titleFamilyIdが不正です`);
  for (const field of ["series", "sheetNumber", "attributionRecommendedTextJa"]) assert(candidate[field] === null || typeof candidate[field] === "string" && candidate[field].trim().length > 0, `${label}.${field}が不正です`);
  assertHttps(candidate.exactItemUrl, `${label}.exactItemUrl`);
  assertHttps(candidate.exactImageUrl, `${label}.exactImageUrl`, { nullable: true });
  assertHttps(candidate.exactViewerUrl, `${label}.exactViewerUrl`, { nullable: true });
  assert(Array.isArray(candidate.rightsEvidenceUrls) && candidate.rightsEvidenceUrls.length > 0, `${label}.rightsEvidenceUrlsがありません`);
  candidate.rightsEvidenceUrls.forEach((url, evidenceIndex) => assertHttps(url, `${label}.rightsEvidenceUrls[${evidenceIndex}]`));
  for (const field of BOOLEAN_FIELDS) assert(typeof candidate[field] === "boolean", `${label}.${field}はbooleanである必要があります`);
  for (const field of BOOLEAN_OR_NULL_FIELDS) assert(candidate[field] === null || typeof candidate[field] === "boolean", `${label}.${field}はbooleanまたはnullである必要があります`);
  assert(Array.isArray(candidate.intendedUses) && candidate.intendedUses.length > 0, `${label}.intendedUsesは1件以上必要です`);
  assert(new Set(candidate.intendedUses).size === candidate.intendedUses.length, `${label}.intendedUsesが重複しています`);
  assert(candidate.intendedUses.every((use) => HISTORICAL_SOURCE_INTENDED_USES.includes(use)), `${label}.intendedUsesに未知値があります`);
  const normalizedUses = HISTORICAL_SOURCE_INTENDED_USES.filter((use) => candidate.intendedUses.includes(use));
  assert(normalizedUses.every((use, useIndex) => use === candidate.intendedUses[useIndex]), `${label}.intendedUsesの順序が不正です`);
  assert(STATUS.has(candidate.reviewStatus), `${label}.reviewStatusが不正です`);
  assert(STATUS.has(candidate.rightsReviewStatus), `${label}.rightsReviewStatusが不正です`);
  assert(candidate.reviewStatus === candidate.rightsReviewStatus, `${label}: reviewStatusはrightsReviewStatusの後方互換aliasである必要があります`);
  assert(TECHNICAL_STATUS.has(candidate.technicalReviewStatus), `${label}.technicalReviewStatusが不正です`);
  assert(PUBLICATION_STATUS.has(candidate.publicationStatus), `${label}.publicationStatusが不正です`);
  if (candidate.technicalReviewStatus === "rejected") assert(typeof candidate.technicalReviewReasonJa === "string" && candidate.technicalReviewReasonJa.trim().length > 0, `${label}.technicalReviewReasonJaがありません`);
  assert(REASON_CODES.has(candidate.reviewReasonCode), `${label}.reviewReasonCodeが不正です`);
  for (const field of ["technicalSuitability", "rightsSuitability", "expectedResolutionSuitability", "expectedControlPointAvailability", "expectedSeamRisk", "expectedTileSizeRisk"]) assert(SUITABILITY.has(candidate[field]), `${label}.${field}が不正です`);
  assert(COVERAGE.has(candidate.expectedCoverageBreadth), `${label}.expectedCoverageBreadthが不正です`);
  assert(Number.isInteger(candidate.priorityScore) && candidate.priorityScore >= 0 && candidate.priorityScore <= 100, `${label}.priorityScoreが不正です`);
  if (candidate.rightsReviewStatus === "approved") {
    for (const field of COMMON_APPROVAL_FIELDS) assert(candidate[field] === true, `${candidate.candidateId}: approvedには${field}=trueが必要です`);
    if (candidate.intendedUses.includes("georeferenced-overlay")) {
      for (const field of OVERLAY_APPROVAL_FIELDS) assert(candidate[field] === true, `${candidate.candidateId}: overlay approvedには${field}=trueが必要です`);
    }
    assert(candidate.rightsSuitability === "high", `${candidate.candidateId}: approvedにはrightsSuitability=highが必要です`);
    assert(candidate.imageFileAvailable && (candidate.directDownloadAvailable || candidate.iiifAvailable), `${candidate.candidateId}: approved画像の取得経路がありません`);
    assert(!candidate.loginRequired && !candidate.paywallRequired, `${candidate.candidateId}: approved画像にログインまたは課金を要求できません`);
    assert(candidate.exactImageUrl !== null || candidate.exactViewerUrl !== null, `${candidate.candidateId}: approved画像単位のURLがありません`);
  } else {
    assert(![...COMMON_APPROVAL_FIELDS, ...OVERLAY_APPROVAL_FIELDS].every((field) => candidate[field] === true), `${candidate.candidateId}: 全権利条件がtrueならpending/rejected理由を見直してください`);
  }
  if (candidate.publicationStatus === "published") {
    assert(candidate.rightsReviewStatus === "approved" && candidate.technicalReviewStatus === "approved", `${candidate.candidateId}: publishedには権利と技術の両approvedが必要です`);
  }
  if (candidate.technicalReviewStatus === "approved") assert(candidate.rightsReviewStatus === "approved", `${candidate.candidateId}: 技術approvedだけでは公開できません`);
  return Object.freeze({ ...candidate, intendedUses: Object.freeze([...candidate.intendedUses]), rightsEvidenceUrls: Object.freeze([...candidate.rightsEvidenceUrls]) });
}

export function validateHistoricalRasterCandidateRegistry(value) {
  value = migrateHistoricalRasterCandidateRegistryV2(migrateHistoricalRasterCandidateRegistryV1(value));
  assert(value && typeof value === "object" && !Array.isArray(value), "候補台帳がobjectではありません");
  for (const key of Object.keys(value)) assert(REGISTRY_KEYS.has(key), `候補台帳.${key}は未定義キーです`);
  assert(value.schemaVersion === 3, "候補台帳schemaVersionは3である必要があります");
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(value.reviewedAt), "候補台帳reviewedAtが不正です");
  assert(typeof value.commercialContextJa === "string" && value.commercialContextJa.includes("広告") && value.commercialContextJa.includes("寄付") && value.commercialContextJa.includes("NC"), "候補台帳に商用利用前提がありません");
  assert(Array.isArray(value.candidates) && value.candidates.length >= 10, "候補は10件以上必要です");
  const candidates = value.candidates.map(validateCandidate);
  const ids = candidates.map((candidate) => candidate.candidateId);
  assert(new Set(ids).size === ids.length, "candidateIdが重複しています");
  const itemUrls = candidates.map((candidate) => candidate.exactItemUrl);
  assert(new Set(itemUrls).size === itemUrls.length, "exactItemUrlが重複しています。同一資料を別候補として水増しできません");
  assert(new Set(candidates.map((candidate) => candidate.holdingInstitution)).size >= 3, "3機関以上の調査が必要です");
  for (const familyId of new Set(candidates.map((candidate) => candidate.titleFamilyId).filter(Boolean))) {
    const family = candidates.filter((candidate) => candidate.titleFamilyId === familyId);
    assert(new Set(family.map((candidate) => candidate.candidateId)).size === family.length, `${familyId}: 同題資料のcandidateIdが分離されていません`);
    assert(new Set(family.map((candidate) => candidate.exactItemUrl)).size === family.length, `${familyId}: 同題資料の個別URLが分離されていません`);
  }
  return Object.freeze({
    schemaVersion: 3,
    reviewedAt: value.reviewedAt,
    commercialContextJa: value.commercialContextJa,
    candidates: Object.freeze(candidates),
  });
}

export function loadHistoricalRasterCandidateRegistry(root) {
  return validateHistoricalRasterCandidateRegistry(JSON.parse(readFileSync(join(root, "data-curation", "historical-raster-candidates.json"), "utf8")));
}

export function summarizeHistoricalRasterCandidates(registry) {
  const candidates = registry.candidates;
  const count = (status) => candidates.filter((candidate) => candidate.rightsReviewStatus === status).length;
  return Object.freeze({
    total: candidates.length,
    institutions: new Set(candidates.map((candidate) => candidate.holdingInstitution)).size,
    approved: count("approved"),
    pending: count("pending"),
    rejected: count("rejected"),
    commercialUseCompatible: candidates.filter((candidate) => candidate.commercialUseCompatible === true).length,
  });
}

export function auditHistoricalRasterCandidateRepository(root) {
  const errors = [];
  let registry = null;
  try {
    registry = loadHistoricalRasterCandidateRegistry(root);
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "候補台帳を解析できません");
  }
  const runtimeRegistryPath = join(root, "src", "historical-raster-registry.json");
  const publicRasterPath = join(root, "public", "data", "historical-rasters");
  try {
    const runtime = JSON.parse(readFileSync(runtimeRegistryPath, "utf8"));
    if (runtime.length === 0 && existsSync(publicRasterPath)) errors.push("本番ラスターレジストリが空なのに公開古地図ディレクトリがあります");
  } catch {
    errors.push("本番ラスターレジストリを確認できません");
  }
  return Object.freeze({ errors: Object.freeze(errors), registry });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditHistoricalRasterCandidateRepository(root);
  if (result.registry) {
    const summary = summarizeHistoricalRasterCandidates(result.registry);
    console.log(`古地図候補台帳: ${summary.total}件、${summary.institutions}機関、approved ${summary.approved}、pending ${summary.pending}、rejected ${summary.rejected}`);
  }
  for (const message of result.errors) console.error(`ERROR: ${message}`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
