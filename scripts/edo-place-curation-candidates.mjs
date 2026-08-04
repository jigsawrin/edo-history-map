import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

export const EDO_CURATION_CATALOG_PATH = "data-curation/edo-place-curation-candidates.json";
export const EDO_SOURCE_DATASET_ID = "codh-edo-maps-places";
export const EDO_SOURCE_DATA_PATH = "public/data/edo-places.geojson";
export const EDO_SOURCE_SHA256 = "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4";
export const EDO_SOURCE_FEATURE_COUNT = 8788;

const TOP_KEYS = ["schemaVersion", "catalogStatus", "sourceDatasetId", "sourceDataPath", "sourceDataSha256", "sourceFeatureCount", "candidates"];
const CANDIDATE_KEYS = ["candidateId", "sourceDatasetId", "target", "proposalType", "proposal", "reasonCode", "reasonJa", "evidence", "review"];
const TARGET_KEYS = ["sourceIndex", "entryId", "sourceFeatureSha256", "name", "category", "sheet", "sourceUrl", "longitude", "latitude"];
const EVIDENCE_KEYS = ["basis", "urls", "noteJa"];
const REVIEW_KEYS = ["status", "reviewedBy", "reviewedAt", "reviewNoteJa"];
const PROPOSAL_TYPES = ["hide", "rename", "annotation"];
const REASON_CODES = ["duplicate", "non-place-label", "low-information", "transcription-error", "orthography-normalization", "ambiguous-label", "context-needed", "other"];
const BASIS = ["source-record-comparison", "official-source", "scholarly-source", "project-review"];
const REVIEW_STATUSES = ["proposed", "in-review", "approved", "rejected", "withdrawn"];
const NOTE_TYPES = ["clarification", "reading", "modern-equivalent", "duplicate-context", "other"];
const PRIVATE_MARKERS = ["sourceFeatureSha256", "reviewedBy", "reviewNoteJa"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label}はobjectである必要があります`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label}のkeysが不正です`);
}

function hasUnsafeText(value) {
  // eslint-disable-next-line no-control-regex
  return /[\u0000-\u001f\u007f-\u009f<>]/u.test(value);
}

function safeText(value, label, max) {
  assert(typeof value === "string" && value.length >= 1 && value.length <= max, `${label}の長さが不正です`);
  assert(value === value.trim(), `${label}はtrim済みである必要があります`);
  assert(!hasUnsafeText(value), `${label}に安全でない文字があります`);
}

function canonicalFeature(feature) {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
    },
    properties: {
      id: feature.properties.id,
      name: feature.properties.name,
      category: feature.properties.category,
      sheet: feature.properties.sheet,
      source: feature.properties.source,
    },
  };
}

export function calculateEdoSourceFeatureSha256(feature) {
  return createHash("sha256").update(JSON.stringify(canonicalFeature(feature)), "utf8").digest("hex");
}

function validateUrl(value, label) {
  assert(typeof value === "string" && value.length <= 500 && value === value.trim() && !hasUnsafeText(value), `${label}が不正です`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label}はURLである必要があります`);
  }
  assert(parsed.protocol === "https:" && !parsed.username && !parsed.password, `${label}は認証情報なしのHTTPS URLである必要があります`);
}

function validateTarget(target, feature, sourceIndex, label) {
  exactKeys(target, TARGET_KEYS, `${label}.target`);
  assert(Number.isInteger(target.sourceIndex) && target.sourceIndex >= 0 && target.sourceIndex < EDO_SOURCE_FEATURE_COUNT, `${label}.target.sourceIndexが範囲外です`);
  assert(target.sourceIndex === sourceIndex, `${label}.target.sourceIndexが不正です`);
  assert(feature?.type === "Feature" && feature.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates), `${label}.targetの元Featureが不正です`);
  const expected = {
    entryId: feature.properties?.id,
    name: feature.properties?.name,
    category: feature.properties?.category,
    sheet: feature.properties?.sheet,
    sourceUrl: feature.properties?.source,
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  };
  for (const [key, value] of Object.entries(expected)) assert(target[key] === value, `${label}.target.${key}が元Featureと一致しません`);
  assert(/^[0-9a-f]{64}$/u.test(target.sourceFeatureSha256), `${label}.target.sourceFeatureSha256が不正です`);
  assert(target.sourceFeatureSha256 === calculateEdoSourceFeatureSha256(feature), `${label}.target.sourceFeatureSha256が元Featureと一致しません`);
}

function validateProposal(candidate, label) {
  assert(PROPOSAL_TYPES.includes(candidate.proposalType), `${label}.proposalTypeが不正です`);
  if (candidate.proposalType === "hide") {
    exactKeys(candidate.proposal, ["visibility"], `${label}.proposal`);
    assert(candidate.proposal.visibility === "hidden", `${label}.proposal.visibilityが不正です`);
  } else if (candidate.proposalType === "rename") {
    exactKeys(candidate.proposal, ["displayNameJa", "preserveOriginalName"], `${label}.proposal`);
    safeText(candidate.proposal.displayNameJa, `${label}.proposal.displayNameJa`, 200);
    assert(candidate.proposal.displayNameJa !== candidate.target.name, `${label}.proposal.displayNameJaが元名と同じです`);
    assert(candidate.proposal.preserveOriginalName === true, `${label}.proposal.preserveOriginalNameはtrueである必要があります`);
  } else {
    exactKeys(candidate.proposal, ["noteType", "noteJa"], `${label}.proposal`);
    assert(NOTE_TYPES.includes(candidate.proposal.noteType), `${label}.proposal.noteTypeが不正です`);
    safeText(candidate.proposal.noteJa, `${label}.proposal.noteJa`, 500);
  }
}

function validateEvidence(evidence, reviewStatus, proposalType, label) {
  exactKeys(evidence, EVIDENCE_KEYS, `${label}.evidence`);
  assert(BASIS.includes(evidence.basis), `${label}.evidence.basisが不正です`);
  assert(Array.isArray(evidence.urls) && evidence.urls.length <= 10, `${label}.evidence.urlsが不正です`);
  evidence.urls.forEach((url, index) => validateUrl(url, `${label}.evidence.urls[${index}]`));
  assert(new Set(evidence.urls).size === evidence.urls.length, `${label}.evidence.urlsが重複しています`);
  safeText(evidence.noteJa, `${label}.evidence.noteJa`, 1000);
  if (reviewStatus === "approved") {
    assert(evidence.urls.length >= 1, `${label}: approvedには根拠URLが必要です`);
    if (proposalType === "rename") assert(["official-source", "scholarly-source"].includes(evidence.basis), `${label}: approved renameのbasisが不正です`);
    if (proposalType === "annotation") assert(evidence.basis !== "project-review", `${label}: approved annotationをproject-reviewだけで承認できません`);
  }
}

function validateReview(review, label) {
  exactKeys(review, REVIEW_KEYS, `${label}.review`);
  assert(REVIEW_STATUSES.includes(review.status), `${label}.review.statusが不正です`);
  const validReviewer = (value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) && value.length <= 64;
  if (review.status === "proposed") {
    assert(review.reviewedBy === null && review.reviewedAt === null && review.reviewNoteJa === null, `${label}.review proposedのnull整合が不正です`);
  } else if (review.status === "in-review") {
    assert(validReviewer(review.reviewedBy), `${label}.review.reviewedByが不正です`);
    assert(review.reviewedAt === null, `${label}.review.reviewedAtはnullである必要があります`);
    if (review.reviewNoteJa !== null) safeText(review.reviewNoteJa, `${label}.review.reviewNoteJa`, 1000);
  } else {
    assert(validReviewer(review.reviewedBy), `${label}.review.reviewedByが不正です`);
    assert(typeof review.reviewedAt === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(review.reviewedAt), `${label}.review.reviewedAtが不正です`);
    safeText(review.reviewNoteJa, `${label}.review.reviewNoteJa`, 1000);
  }
}

export function validateEdoPlaceCurationCatalog(value, sourceGeoJson) {
  exactKeys(value, TOP_KEYS, "catalog");
  assert(value.schemaVersion === 1, "catalog.schemaVersionは1である必要があります");
  assert(["empty-foundation", "active"].includes(value.catalogStatus), "catalog.catalogStatusが不正です");
  assert(value.sourceDatasetId === EDO_SOURCE_DATASET_ID, "catalog.sourceDatasetIdが不正です");
  assert(value.sourceDataPath === EDO_SOURCE_DATA_PATH, "catalog.sourceDataPathが不正です");
  assert(value.sourceDataSha256 === EDO_SOURCE_SHA256, "catalog.sourceDataSha256が不正です");
  assert(value.sourceFeatureCount === EDO_SOURCE_FEATURE_COUNT, "catalog.sourceFeatureCountが不正です");
  assert(sourceGeoJson?.type === "FeatureCollection" && Array.isArray(sourceGeoJson.features), "江戸GeoJSONがFeatureCollectionではありません");
  assert(sourceGeoJson.features.length === EDO_SOURCE_FEATURE_COUNT, "江戸GeoJSONのFeature数が不正です");
  assert(Array.isArray(value.candidates), "catalog.candidatesは配列である必要があります");
  assert(value.catalogStatus === (value.candidates.length === 0 ? "empty-foundation" : "active"), "catalogStatusとcandidates件数が不整合です");

  const ids = new Set();
  const targetTypes = new Set();
  const approvedByIndex = new Map();
  value.candidates.forEach((candidate, index) => {
    const label = `candidate[${index}]`;
    exactKeys(candidate, CANDIDATE_KEYS, label);
    assert(typeof candidate.candidateId === "string" && candidate.candidateId.length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(candidate.candidateId), `${label}.candidateIdが不正です`);
    assert(!ids.has(candidate.candidateId), "candidateIdが重複しています");
    ids.add(candidate.candidateId);
    assert(candidate.sourceDatasetId === EDO_SOURCE_DATASET_ID, `${label}.sourceDatasetIdが不正です`);
    assert(Number.isInteger(candidate.target?.sourceIndex), `${label}.target.sourceIndexは整数である必要があります`);
    const feature = sourceGeoJson.features[candidate.target.sourceIndex];
    validateTarget(candidate.target, feature, candidate.target.sourceIndex, label);
    validateProposal(candidate, label);
    assert(REASON_CODES.includes(candidate.reasonCode), `${label}.reasonCodeが不正です`);
    assert(!(candidate.proposalType === "rename" && candidate.reasonCode === "duplicate"), `${label}: rename + duplicateだけでは不十分です`);
    assert(!(candidate.proposalType === "hide" && candidate.reasonCode === "transcription-error"), `${label}: hide + transcription-errorは不自然です`);
    safeText(candidate.reasonJa, `${label}.reasonJa`, 1000);
    assert(candidate.reasonJa !== "不要だから", `${label}.reasonJaが具体的ではありません`);
    validateReview(candidate.review, label);
    validateEvidence(candidate.evidence, candidate.review.status, candidate.proposalType, label);
    const targetType = `${candidate.target.sourceIndex}:${candidate.proposalType}`;
    assert(!targetTypes.has(targetType), "sourceIndex + proposalTypeが重複しています");
    targetTypes.add(targetType);
    if (candidate.review.status === "approved") {
      const types = approvedByIndex.get(candidate.target.sourceIndex) ?? [];
      types.push(candidate.proposalType);
      approvedByIndex.set(candidate.target.sourceIndex, types);
    }
  });
  for (const types of approvedByIndex.values()) {
    assert(types.filter((type) => type === "rename").length <= 1, "approved renameが重複しています");
    assert(types.filter((type) => type === "annotation").length <= 1, "approved annotationが重複しています");
    assert(!(types.includes("hide") && types.some((type) => type === "rename" || type === "annotation")), "approved hideと表示変更を同時に有効化できません");
  }
  return Object.freeze({ ...value, candidates: Object.freeze([...value.candidates]) });
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) files.push(...walkFiles(full));
    else files.push(full);
  }
  return files;
}

export function auditEdoPlaceCurationLeakage(root) {
  const errors = [];
  for (const area of ["public", "dist"]) {
    for (const file of walkFiles(join(root, area))) {
      const rel = relative(root, file).replace(/\\/gu, "/");
      if (file.endsWith("edo-place-curation-candidates.json")) errors.push(`${rel}: private catalogを公開領域へ置けません`);
      if (file.endsWith(".js") || file.endsWith(".html") || file.endsWith(".json")) {
        const content = readFileSync(file, "utf8");
        if (PRIVATE_MARKERS.some((marker) => content.includes(marker)) || (content.includes("candidateId") && content.includes("proposalType") && content.includes("review"))) {
          errors.push(`${rel}: private candidate catalogの構造が公開物へ混入しています`);
        }
      }
    }
  }
  return errors;
}

export function summarizeEdoPlaceCurationCandidates(catalog) {
  const statuses = Object.fromEntries(REVIEW_STATUSES.map((status) => [status, 0]));
  const types = Object.fromEntries(PROPOSAL_TYPES.map((type) => [type, 0]));
  for (const candidate of catalog.candidates) {
    statuses[candidate.review.status]++;
    types[candidate.proposalType]++;
  }
  return { count: catalog.candidates.length, approvedCount: statuses.approved, statuses, types };
}

export function auditEdoPlaceCurationCandidateRepository(root = process.cwd()) {
  const errors = [];
  let catalog = null;
  try {
    const catalogPath = resolve(root, EDO_CURATION_CATALOG_PATH);
    const sourcePath = resolve(root, EDO_SOURCE_DATA_PATH);
    const catalogRelative = relative(resolve(root, "data-curation"), catalogPath);
    assert(catalogRelative && !catalogRelative.startsWith("..") && !catalogRelative.includes(":"), "catalog pathがprivate data-curation外です");
    const sourceBytes = readFileSync(sourcePath);
    assert(createHash("sha256").update(sourceBytes).digest("hex") === EDO_SOURCE_SHA256, "江戸GeoJSONのSHA-256がprotected SHAと一致しません");
    catalog = validateEdoPlaceCurationCatalog(JSON.parse(readFileSync(catalogPath, "utf8")), JSON.parse(sourceBytes.toString("utf8")));
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  errors.push(...auditEdoPlaceCurationLeakage(root));
  return { catalog, errors };
}

function runCli() {
  const audit = auditEdoPlaceCurationCandidateRepository();
  if (audit.catalog) {
    const summary = summarizeEdoPlaceCurationCandidates(audit.catalog);
    console.log(`江戸地名キュレーション候補: ${summary.count}件`);
    for (const status of REVIEW_STATUSES) console.log(`status ${status}: ${summary.statuses[status]}`);
    for (const type of PROPOSAL_TYPES) console.log(`type ${type}: ${summary.types[type]}`);
  }
  for (const error of audit.errors) console.error(`ERROR: ${error}`);
  process.exitCode = audit.errors.length === 0 ? 0 : 1;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) runCli();
