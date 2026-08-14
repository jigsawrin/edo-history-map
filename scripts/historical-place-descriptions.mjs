import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  calculateEdoSourceFeatureSha256,
  EDO_SOURCE_DATA_PATH,
  EDO_SOURCE_DATASET_ID,
  EDO_SOURCE_FEATURE_COUNT,
  EDO_SOURCE_SHA256,
} from "./edo-place-curation-candidates.mjs";

export const DESCRIPTION_RIGHTS_PATH = "data-curation/historical-description-source-rights.json";
export const DESCRIPTION_CATALOG_PATH = "data-curation/historical-place-descriptions.json";
export const DESCRIPTION_PUBLIC_PROJECTION_PATH = "scripts/historical-place-description-public-projection.json";

const PERMISSIONS = ["allowed", "prohibited", "unknown"];
const ACCESS = ["confirmed", "unavailable", "unknown"];
const THIRD_PARTY = ["cleared-for-scope", "restricted", "unknown"];
const COMPOSITION_MODES = ["editorial-summary", "direct-quote"];
const STATUSES = ["proposed", "in-review", "approved", "rejected", "withdrawn"];
const EPISTEMIC = ["historical-fact", "inference", "tradition"];
const ROLES = ["fact-verification", "text-reuse"];
const AI_USE = ["none", "draft-assistance"];
const TRANSLATION_STATUSES = ["proposed", "in-review", "approved", "rejected", "withdrawn"];
const SHA256 = /^[0-9a-f]{64}$/u;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f<>]/u;

const RIGHTS_TOP_KEYS = ["schemaVersion", "catalogStatus", "sources"];
const SOURCE_KEYS = ["sourceId", "title", "provider", "sourceUrl", "termsUrl", "rightsBasisUrls", "rightsCheckedAt", "rightsBasisNote", "accessible", "commercialUse", "reproduction", "modification", "summarization", "attribution", "thirdPartyRights", "scopeNote"];
const ATTRIBUTION_KEYS = ["required", "requiredText", "licenseNotice", "modificationNotice"];
const THIRD_PARTY_KEYS = ["status", "note"];
const CATALOG_KEYS = ["schemaVersion", "catalogStatus", "sourceDatasetId", "sourceDataPath", "sourceDataSha256", "sourceFeatureCount", "descriptions"];
const DESCRIPTION_KEYS = ["descriptionId", "target", "compositionMode", "status", "canonicalLocale", "content", "evidence", "review", "translations"];
const TARGET_KEYS = ["datasetId", "sourceIndex", "entryId", "sourceFeatureSha256"];
const CONTENT_KEYS = ["ja"];
const LOCALE_CONTENT_KEYS = ["text", "segments"];
const SEGMENT_KEYS = ["segmentId", "epistemicStatus", "text", "evidenceIds", "aiUse", "humanVerified"];
const EVIDENCE_KEYS = ["evidenceId", "sourceId", "role", "verifiedFacts"];
const REVIEW_KEYS = ["reviewedBy", "reviewedAt", "reviewNote"];
const TRANSLATION_KEYS = ["locale", "text", "translationOfContentSha256", "status", "reviewedBy", "reviewedAt", "reviewNote"];
const PROJECTION_KEYS = ["schemaVersion", "projectionStatus", "sourceDataSha256", "sourceFeatureCount", "approvedDescriptionCount", "descriptions"];
const PUBLIC_DESCRIPTION_KEYS = ["descriptionId", "sourceIdentity", "locale", "compositionMode", "text", "canonicalContentSha256", "epistemicSegments", "sources", "translations"];
const PUBLIC_IDENTITY_KEYS = ["datasetId", "sourceIndex", "entryId", "sourceFeatureSha256"];
const PUBLIC_SEGMENT_KEYS = ["epistemicStatus", "text"];
const PUBLIC_SOURCE_KEYS = ["sourceId", "title", "provider", "sourceUrl", "attribution"];
const PUBLIC_ATTRIBUTION_KEYS = ["requiredText", "licenseNotice", "modificationNotice"];
const PUBLIC_TRANSLATION_KEYS = ["locale", "text", "translationOfContentSha256"];
const PRIVATE_MARKERS = ["verifiedFacts", "reviewNote", "rightsBasisNote", "scopeNote", "thirdPartyRights", "humanVerified", "aiUse"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, keys, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(actual.length === expected.length && actual.every((key, index) => key === expected[index]), `${label} has unknown or missing fields`);
}

function text(value, label, max = 1000) {
  assert(typeof value === "string" && value.length > 0 && value.length <= max && value === value.trim() && !UNSAFE.test(value), `${label} is invalid`);
  return value;
}

function nullableText(value, label, max = 1000) {
  if (value === null) return null;
  return text(value, label, max);
}

function httpsUrl(value, label) {
  const raw = text(value, label, 500);
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${label} is invalid`); }
  assert(url.protocol === "https:" && !url.username && !url.password, `${label} must be credential-free HTTPS`);
  return url.href;
}

function enumValue(value, allowed, label) {
  assert(allowed.includes(value), `${label} is invalid`);
  return value;
}

function validDate(value, label) {
  assert(typeof value === "string" && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), `${label} is invalid`);
  return value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function canonicalDescriptionContentSha256(textJa) {
  text(textJa, "canonical Japanese content", 2000);
  return createHash("sha256").update(canonicalJson({ locale: "ja", text: textJa }), "utf8").digest("hex");
}

export function validateDescriptionRightsRegistry(value) {
  exactKeys(value, RIGHTS_TOP_KEYS, "rights registry");
  assert(value.schemaVersion === 1 && value.catalogStatus === "active" && Array.isArray(value.sources), "rights registry metadata is invalid");
  const ids = new Set();
  const sources = value.sources.map((source, index) => {
    const label = `rights sources[${index}]`;
    exactKeys(source, SOURCE_KEYS, label);
    text(source.sourceId, `${label}.sourceId`, 80);
    assert(ID.test(source.sourceId) && !ids.has(source.sourceId), `${label}.sourceId is invalid or duplicated`);
    ids.add(source.sourceId);
    text(source.title, `${label}.title`, 240);
    text(source.provider, `${label}.provider`, 160);
    httpsUrl(source.sourceUrl, `${label}.sourceUrl`);
    httpsUrl(source.termsUrl, `${label}.termsUrl`);
    assert(Array.isArray(source.rightsBasisUrls) && source.rightsBasisUrls.length > 0 && source.rightsBasisUrls.length <= 5, `${label}.rightsBasisUrls is invalid`);
    const rightsBasisUrls = source.rightsBasisUrls.map((url, urlIndex) => httpsUrl(url, `${label}.rightsBasisUrls[${urlIndex}]`));
    assert(new Set(rightsBasisUrls).size === rightsBasisUrls.length, `${label}.rightsBasisUrls is duplicated`);
    validDate(source.rightsCheckedAt, `${label}.rightsCheckedAt`);
    text(source.rightsBasisNote, `${label}.rightsBasisNote`, 1200);
    enumValue(source.accessible, ACCESS, `${label}.accessible`);
    for (const field of ["commercialUse", "reproduction", "modification", "summarization"]) enumValue(source[field], PERMISSIONS, `${label}.${field}`);
    exactKeys(source.attribution, ATTRIBUTION_KEYS, `${label}.attribution`);
    assert(typeof source.attribution.required === "boolean", `${label}.attribution.required is invalid`);
    for (const field of ["requiredText", "licenseNotice", "modificationNotice"]) nullableText(source.attribution[field], `${label}.attribution.${field}`, 500);
    if (source.attribution.required) assert(source.attribution.requiredText, `${label} cannot generate required attribution`);
    exactKeys(source.thirdPartyRights, THIRD_PARTY_KEYS, `${label}.thirdPartyRights`);
    enumValue(source.thirdPartyRights.status, THIRD_PARTY, `${label}.thirdPartyRights.status`);
    text(source.thirdPartyRights.note, `${label}.thirdPartyRights.note`, 800);
    text(source.scopeNote, `${label}.scopeNote`, 800);
    return Object.freeze(deepClone(source));
  });
  return Object.freeze({ schemaVersion: 1, catalogStatus: "active", sources: Object.freeze(sources) });
}

function validateReview(review, status, label) {
  exactKeys(review, REVIEW_KEYS, label);
  const reviewedBy = nullableText(review.reviewedBy, `${label}.reviewedBy`, 80);
  const reviewedAt = review.reviewedAt === null ? null : validDate(review.reviewedAt, `${label}.reviewedAt`);
  const reviewNote = nullableText(review.reviewNote, `${label}.reviewNote`, 1200);
  if (status === "approved" || status === "rejected" || status === "withdrawn") {
    assert(reviewedBy && reviewedAt && reviewNote, `${label} is incomplete for terminal status`);
  }
}

export function validateHistoricalPlaceDescriptionCatalog(value, sourceGeoJson, rightsRegistryValue) {
  const rights = validateDescriptionRightsRegistry(rightsRegistryValue);
  const sourceIds = new Set(rights.sources.map((source) => source.sourceId));
  exactKeys(value, CATALOG_KEYS, "description catalog");
  assert(value.schemaVersion === 1 && value.catalogStatus === "active" && value.sourceDatasetId === EDO_SOURCE_DATASET_ID && value.sourceDataPath === EDO_SOURCE_DATA_PATH && value.sourceDataSha256 === EDO_SOURCE_SHA256 && value.sourceFeatureCount === EDO_SOURCE_FEATURE_COUNT && Array.isArray(value.descriptions), "description catalog metadata is invalid");
  assert(sourceGeoJson?.type === "FeatureCollection" && Array.isArray(sourceGeoJson.features) && sourceGeoJson.features.length === EDO_SOURCE_FEATURE_COUNT, "source GeoJSON is invalid");
  const descriptionIds = new Set();
  const targets = new Set();
  const descriptions = value.descriptions.map((description, index) => {
    const label = `descriptions[${index}]`;
    exactKeys(description, DESCRIPTION_KEYS, label);
    text(description.descriptionId, `${label}.descriptionId`, 100);
    assert(ID.test(description.descriptionId) && !descriptionIds.has(description.descriptionId), `${label}.descriptionId is invalid or duplicated`);
    descriptionIds.add(description.descriptionId);
    exactKeys(description.target, TARGET_KEYS, `${label}.target`);
    assert(description.target.datasetId === EDO_SOURCE_DATASET_ID && Number.isInteger(description.target.sourceIndex) && description.target.sourceIndex >= 0 && description.target.sourceIndex < EDO_SOURCE_FEATURE_COUNT && typeof description.target.entryId === "string" && SHA256.test(description.target.sourceFeatureSha256), `${label}.target is invalid`);
    const feature = sourceGeoJson.features[description.target.sourceIndex];
    assert(feature?.properties?.id === description.target.entryId && calculateEdoSourceFeatureSha256(feature) === description.target.sourceFeatureSha256, `${label}.target source identity/SHA mismatch`);
    const targetKey = `${description.target.datasetId}:${description.target.sourceIndex}:${description.target.entryId}`;
    assert(!targets.has(targetKey), `${label}.target is duplicated`);
    targets.add(targetKey);
    enumValue(description.compositionMode, COMPOSITION_MODES, `${label}.compositionMode`);
    enumValue(description.status, STATUSES, `${label}.status`);
    assert(description.canonicalLocale === "ja", `${label}.canonicalLocale must be ja`);
    exactKeys(description.content, CONTENT_KEYS, `${label}.content`);
    exactKeys(description.content.ja, LOCALE_CONTENT_KEYS, `${label}.content.ja`);
    text(description.content.ja.text, `${label}.content.ja.text`, 2000);
    assert(Array.isArray(description.content.ja.segments) && description.content.ja.segments.length > 0, `${label}.segments are required`);
    const evidenceIds = new Set();
    assert(Array.isArray(description.evidence) && description.evidence.length > 0, `${label}.evidence is required`);
    for (const [evidenceIndex, evidence] of description.evidence.entries()) {
      const evidenceLabel = `${label}.evidence[${evidenceIndex}]`;
      exactKeys(evidence, EVIDENCE_KEYS, evidenceLabel);
      text(evidence.evidenceId, `${evidenceLabel}.evidenceId`, 100);
      assert(ID.test(evidence.evidenceId) && !evidenceIds.has(evidence.evidenceId), `${evidenceLabel}.evidenceId is invalid or duplicated`);
      evidenceIds.add(evidence.evidenceId);
      assert(sourceIds.has(evidence.sourceId), `${evidenceLabel}.sourceId is not registered`);
      enumValue(evidence.role, ROLES, `${evidenceLabel}.role`);
      assert(Array.isArray(evidence.verifiedFacts) && evidence.verifiedFacts.length > 0 && evidence.verifiedFacts.length <= 20, `${evidenceLabel}.verifiedFacts is invalid`);
      evidence.verifiedFacts.forEach((fact, factIndex) => text(fact, `${evidenceLabel}.verifiedFacts[${factIndex}]`, 300));
    }
    const segmentIds = new Set();
    for (const [segmentIndex, segment] of description.content.ja.segments.entries()) {
      const segmentLabel = `${label}.content.ja.segments[${segmentIndex}]`;
      exactKeys(segment, SEGMENT_KEYS, segmentLabel);
      text(segment.segmentId, `${segmentLabel}.segmentId`, 100);
      assert(ID.test(segment.segmentId) && !segmentIds.has(segment.segmentId), `${segmentLabel}.segmentId is invalid or duplicated`);
      segmentIds.add(segment.segmentId);
      enumValue(segment.epistemicStatus, EPISTEMIC, `${segmentLabel}.epistemicStatus`);
      text(segment.text, `${segmentLabel}.text`, 1000);
      assert(Array.isArray(segment.evidenceIds) && segment.evidenceIds.length > 0 && segment.evidenceIds.every((id) => evidenceIds.has(id)), `${segmentLabel}.evidenceIds is invalid`);
      enumValue(segment.aiUse, AI_USE, `${segmentLabel}.aiUse`);
      assert(typeof segment.humanVerified === "boolean", `${segmentLabel}.humanVerified is invalid`);
    }
    assert(description.content.ja.segments.map((segment) => segment.text).join("") === description.content.ja.text, `${label}.segments do not reconstruct canonical text`);
    validateReview(description.review, description.status, `${label}.review`);
    assert(Array.isArray(description.translations), `${label}.translations must be an array`);
    const locales = new Set();
    for (const [translationIndex, translation] of description.translations.entries()) {
      const translationLabel = `${label}.translations[${translationIndex}]`;
      exactKeys(translation, TRANSLATION_KEYS, translationLabel);
      assert(translation.locale === "en" && !locales.has(translation.locale), `${translationLabel}.locale is invalid or duplicated`);
      locales.add(translation.locale);
      text(translation.text, `${translationLabel}.text`, 2400);
      assert(SHA256.test(translation.translationOfContentSha256), `${translationLabel}.translationOfContentSha256 is invalid`);
      enumValue(translation.status, TRANSLATION_STATUSES, `${translationLabel}.status`);
      validateReview({ reviewedBy: translation.reviewedBy, reviewedAt: translation.reviewedAt, reviewNote: translation.reviewNote }, translation.status, translationLabel);
    }
    return Object.freeze(deepClone(description));
  });
  return Object.freeze({ ...deepClone(value), descriptions: Object.freeze(descriptions) });
}

function assertNoUnknownRights(source, label) {
  assert(source.termsUrl && source.rightsCheckedAt, `${label} lacks terms URL or rights checked date`);
  assert(source.accessible !== "unknown" && source.accessible === "confirmed", `${label} is not confirmed accessible`);
  for (const field of ["commercialUse", "reproduction", "modification", "summarization"]) assert(source[field] !== "unknown", `${label}.${field} is unknown`);
  assert(source.commercialUse === "allowed", `${label} does not allow commercial use`);
  assert(source.thirdPartyRights.status === "cleared-for-scope", `${label} has unresolved third-party rights`);
  if (source.attribution.required) assert(source.attribution.requiredText && source.attribution.licenseNotice, `${label} cannot generate attribution`);
}

function publicSource(source) {
  return Object.freeze({
    sourceId: source.sourceId,
    title: source.title,
    provider: source.provider,
    sourceUrl: source.sourceUrl,
    attribution: Object.freeze({
      requiredText: source.attribution.requiredText,
      licenseNotice: source.attribution.licenseNotice,
      modificationNotice: source.attribution.modificationNotice,
    }),
  });
}

export function createHistoricalPlaceDescriptionPublicProjection(catalogValue, rightsRegistryValue, sourceGeoJson) {
  const rights = validateDescriptionRightsRegistry(rightsRegistryValue);
  const catalog = validateHistoricalPlaceDescriptionCatalog(catalogValue, sourceGeoJson, rightsRegistryValue);
  const sourceById = new Map(rights.sources.map((source) => [source.sourceId, source]));
  const descriptions = catalog.descriptions.filter((description) => description.status === "approved").map((description) => {
    assert(description.review.reviewedBy && description.review.reviewedAt, `${description.descriptionId} lacks reviewer/date`);
    const evidenceById = new Map(description.evidence.map((evidence) => [evidence.evidenceId, evidence]));
    for (const segment of description.content.ja.segments) {
      assert(segment.humanVerified, `${description.descriptionId}/${segment.segmentId} is AI-only or not human verified`);
      assert(segment.evidenceIds.length > 0 && segment.evidenceIds.every((id) => evidenceById.has(id)), `${description.descriptionId}/${segment.segmentId} lacks evidence`);
    }
    const usedEvidence = [...new Set(description.content.ja.segments.flatMap((segment) => segment.evidenceIds))].map((id) => evidenceById.get(id));
    const usedSources = [...new Set(usedEvidence.map((evidence) => evidence.sourceId))].map((id) => sourceById.get(id));
    usedSources.forEach((source) => assertNoUnknownRights(source, `${description.descriptionId}/${source.sourceId}`));
    const reuseEvidence = usedEvidence.filter((evidence) => evidence.role === "text-reuse");
    assert(reuseEvidence.length > 0, `${description.descriptionId} lacks text-reuse evidence`);
    for (const evidence of reuseEvidence) {
      const source = sourceById.get(evidence.sourceId);
      assert(source.reproduction === "allowed", `${description.descriptionId}/${source.sourceId} lacks reproduction permission`);
      if (description.compositionMode === "editorial-summary") {
        assert(source.modification === "allowed" && source.summarization === "allowed", `${description.descriptionId}/${source.sourceId} lacks modification/summarization permission`);
      }
    }
    const canonicalContentSha256 = canonicalDescriptionContentSha256(description.content.ja.text);
    const translations = description.translations.filter((translation) => translation.status === "approved" && translation.translationOfContentSha256 === canonicalContentSha256).map((translation) => Object.freeze({ locale: translation.locale, text: translation.text, translationOfContentSha256: translation.translationOfContentSha256 }));
    return Object.freeze({
      descriptionId: description.descriptionId,
      sourceIdentity: Object.freeze(deepClone(description.target)),
      locale: "ja",
      compositionMode: description.compositionMode,
      text: description.content.ja.text,
      canonicalContentSha256,
      epistemicSegments: Object.freeze(description.content.ja.segments.map((segment) => Object.freeze({ epistemicStatus: segment.epistemicStatus, text: segment.text }))),
      sources: Object.freeze(usedSources.map(publicSource).sort((a, b) => a.sourceId.localeCompare(b.sourceId, "en"))),
      translations: Object.freeze(translations),
    });
  }).sort((a, b) => a.descriptionId.localeCompare(b.descriptionId, "en"));
  return Object.freeze({ schemaVersion: 1, projectionStatus: "non-runtime-foundation", sourceDataSha256: EDO_SOURCE_SHA256, sourceFeatureCount: EDO_SOURCE_FEATURE_COUNT, approvedDescriptionCount: descriptions.length, descriptions: Object.freeze(descriptions) });
}

export function isHistoricalPlaceDescriptionTranslationStale(description, translation) {
  return translation.translationOfContentSha256 !== canonicalDescriptionContentSha256(description.content.ja.text);
}

export function validateHistoricalPlaceDescriptionPublicProjection(value, expected) {
  exactKeys(value, PROJECTION_KEYS, "public projection");
  assert(value.schemaVersion === 1 && value.projectionStatus === "non-runtime-foundation" && value.sourceDataSha256 === EDO_SOURCE_SHA256 && value.sourceFeatureCount === EDO_SOURCE_FEATURE_COUNT && value.approvedDescriptionCount === value.descriptions?.length, "public projection metadata is invalid");
  for (const [index, description] of value.descriptions.entries()) {
    const label = `public descriptions[${index}]`;
    exactKeys(description, PUBLIC_DESCRIPTION_KEYS, label);
    exactKeys(description.sourceIdentity, PUBLIC_IDENTITY_KEYS, `${label}.sourceIdentity`);
    description.epistemicSegments.forEach((segment, segmentIndex) => exactKeys(segment, PUBLIC_SEGMENT_KEYS, `${label}.epistemicSegments[${segmentIndex}]`));
    description.sources.forEach((source, sourceIndex) => {
      exactKeys(source, PUBLIC_SOURCE_KEYS, `${label}.sources[${sourceIndex}]`);
      exactKeys(source.attribution, PUBLIC_ATTRIBUTION_KEYS, `${label}.sources[${sourceIndex}].attribution`);
    });
    description.translations.forEach((translation, translationIndex) => exactKeys(translation, PUBLIC_TRANSLATION_KEYS, `${label}.translations[${translationIndex}]`));
    const serialized = JSON.stringify(description);
    for (const marker of PRIVATE_MARKERS) assert(!serialized.includes(`"${marker}"`), `${label} leaks private field ${marker}`);
  }
  assert(canonicalJson(value) === canonicalJson(expected), "public projection is not deterministic or current");
  return value;
}

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) files.push(...filesBelow(path));
    else files.push(path);
  }
  return files;
}

export function auditHistoricalPlaceDescriptionPrivateLeakage(root) {
  const errors = [];
  for (const area of ["public", "dist"]) {
    for (const path of filesBelow(join(root, area))) {
      const rel = relative(root, path).replaceAll("\\", "/");
      const name = rel.split("/").at(-1);
      if (name === DESCRIPTION_RIGHTS_PATH.split("/").at(-1) || name === DESCRIPTION_CATALOG_PATH.split("/").at(-1)) errors.push(`private description catalog leaked to ${rel}`);
    }
  }
  return errors;
}

export function summarizeHistoricalPlaceDescriptions(catalog, projection) {
  return Object.freeze({
    count: catalog.descriptions.length,
    proposedCount: catalog.descriptions.filter((item) => item.status === "proposed").length,
    approvedCount: catalog.descriptions.filter((item) => item.status === "approved").length,
    publicCount: projection.descriptions.length,
    canonicalOutputSha256: createHash("sha256").update(canonicalJson(projection), "utf8").digest("hex"),
  });
}

export function auditHistoricalPlaceDescriptionRepository(root = fileURLToPath(new URL("..", import.meta.url))) {
  const errors = [];
  try {
    const source = JSON.parse(readFileSync(join(root, EDO_SOURCE_DATA_PATH), "utf8"));
    const rights = JSON.parse(readFileSync(join(root, DESCRIPTION_RIGHTS_PATH), "utf8"));
    const rawCatalog = JSON.parse(readFileSync(join(root, DESCRIPTION_CATALOG_PATH), "utf8"));
    const storedProjection = JSON.parse(readFileSync(join(root, DESCRIPTION_PUBLIC_PROJECTION_PATH), "utf8"));
    const catalog = validateHistoricalPlaceDescriptionCatalog(rawCatalog, source, rights);
    const expected = createHistoricalPlaceDescriptionPublicProjection(rawCatalog, rights, source);
    validateHistoricalPlaceDescriptionPublicProjection(storedProjection, expected);
    errors.push(...auditHistoricalPlaceDescriptionPrivateLeakage(root));
    return { errors, catalog, projection: expected, summary: summarizeHistoricalPlaceDescriptions(catalog, expected) };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    return { errors, catalog: null, projection: null, summary: null };
  }
}

function runCli() {
  const audit = auditHistoricalPlaceDescriptionRepository();
  if (audit.errors.length) {
    for (const error of audit.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`HISTORICAL_PLACE_DESCRIPTION_AUDIT_OK ${JSON.stringify(audit.summary)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runCli();
