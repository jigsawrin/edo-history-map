import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  calculateEdoSourceFeatureSha256,
  EDO_SOURCE_DATA_PATH,
  EDO_SOURCE_DATASET_ID,
  EDO_SOURCE_FEATURE_COUNT,
  EDO_SOURCE_SHA256,
} from "../edo-place-curation-candidates.mjs";

export const DESCRIPTION_PRIORITY_CATALOG_PATH = "data-curation/description-priority-candidates.json";
export const DESCRIPTION_PRIORITY_SCHEMA_VERSION = 1;
export const DESCRIPTION_PRIORITY_GENERATOR_VERSION = 1;
export const DESCRIPTION_PRIORITY_CANDIDATE_COUNT = 72;
export const DESCRIPTION_PRIORITY_PER_CATEGORY = 8;
export const DESCRIPTION_PRIORITY_CATEGORIES = Object.freeze([
  "名所", "寺社", "施設", "海川池", "地名", "商店", "町村字", "屋敷地", "その他",
]);
export const DESCRIPTION_PRIORITY_TIERS = Object.freeze(["A", "B", "C", "D"]);
export const DESCRIPTION_PRIORITY_RELATION_ROLES = Object.freeze(["none", "preferred", "nonpreferred"]);
export const DESCRIPTION_PRIORITY_REASON_CODES = Object.freeze([
  "workflow-category-weight",
  "no-multi-member-source-relation",
  "relation-preferred-member",
  "relation-supporting-member",
  "map-aggregate-member",
  "supplemental-record",
  "already-curated-record",
  "already-described-record",
]);
export const DESCRIPTION_PRIORITY_SCORE_SIGNALS = Object.freeze([
  "base",
  "category",
  "noMultiMemberSourceRelation",
  "relationPreferred",
  "relationSupporting",
  "mapAggregate",
  "supplemental",
  "alreadyCurated",
  "alreadyDescribed",
]);

const TOP_KEYS = [
  "schemaVersion", "catalogStatus", "purpose", "sourceDatasetId", "sourceDataPath",
  "sourceDataSha256", "sourceFeatureCount", "generatorVersion", "selectionContract", "candidates",
];
const CONTRACT_KEYS = ["candidateCount", "perCategory", "categories", "geographicCellDegrees", "tieBreak"];
const CANDIDATE_KEYS = [
  "sourceIdentity", "sourceName", "category", "suggestedTier", "score", "signals", "reasonCodes", "contributions",
];
const IDENTITY_KEYS = ["datasetId", "sourceIndex", "entryId", "sourceFeatureSha256"];
const SIGNAL_KEYS = [
  "relationGroupMemberCount", "relationRole", "mapAggregateMemberCount", "supplemental",
  "alreadyDescribed", "alreadyCurated", "geographicCell",
];
const CONTRIBUTION_KEYS = ["signal", "points"];
const SHA256 = /^[0-9a-f]{64}$/u;
const TIERS = new Set(DESCRIPTION_PRIORITY_TIERS);
const CATEGORIES = new Set(DESCRIPTION_PRIORITY_CATEGORIES);
const RELATION_ROLES = new Set(DESCRIPTION_PRIORITY_RELATION_ROLES);
const REASON_CODES = new Set(DESCRIPTION_PRIORITY_REASON_CODES);
const SCORE_SIGNALS = new Set(DESCRIPTION_PRIORITY_SCORE_SIGNALS);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(JSON.stringify(actual) === JSON.stringify(wanted), `${label} has unknown or missing fields`);
}

function identityKey(identity) {
  return `${identity.datasetId}\u0000${identity.sourceIndex}\u0000${identity.entryId}\u0000${identity.sourceFeatureSha256}`;
}

function validateIdentity(identity, sourceGeoJson, label) {
  exactKeys(identity, IDENTITY_KEYS, label);
  assert(identity.datasetId === EDO_SOURCE_DATASET_ID, `${label}.datasetId is invalid`);
  assert(Number.isInteger(identity.sourceIndex) && identity.sourceIndex >= 0 && identity.sourceIndex < EDO_SOURCE_FEATURE_COUNT, `${label}.sourceIndex is invalid`);
  assert(typeof identity.entryId === "string" && identity.entryId.length > 0, `${label}.entryId is invalid`);
  assert(SHA256.test(identity.sourceFeatureSha256), `${label}.sourceFeatureSha256 is invalid`);
  const feature = sourceGeoJson.features[identity.sourceIndex];
  assert(feature?.properties?.id === identity.entryId, `${label} source identity does not match source record`);
  assert(calculateEdoSourceFeatureSha256(feature) === identity.sourceFeatureSha256, `${label} sourceFeatureSha256 mismatch`);
  return feature;
}

export function canonicalDescriptionPriorityCatalogSha256(value) {
  return createHash("sha256").update(`${JSON.stringify(value)}\n`, "utf8").digest("hex");
}

export function validateDescriptionPriorityCatalog(value, sourceGeoJson) {
  exactKeys(value, TOP_KEYS, "description priority catalog");
  assert(value.schemaVersion === DESCRIPTION_PRIORITY_SCHEMA_VERSION, "schemaVersion is invalid");
  assert(value.catalogStatus === "private-workflow-triage", "catalogStatus is invalid");
  assert(value.purpose === "human-investigation-order-only", "purpose is invalid");
  assert(value.sourceDatasetId === EDO_SOURCE_DATASET_ID, "sourceDatasetId is invalid");
  assert(value.sourceDataPath === EDO_SOURCE_DATA_PATH, "sourceDataPath is invalid");
  assert(value.sourceDataSha256 === EDO_SOURCE_SHA256, "sourceDataSha256 is invalid");
  assert(value.sourceFeatureCount === EDO_SOURCE_FEATURE_COUNT, "sourceFeatureCount is invalid");
  assert(value.generatorVersion === DESCRIPTION_PRIORITY_GENERATOR_VERSION, "generatorVersion is invalid");
  assert(sourceGeoJson?.type === "FeatureCollection" && sourceGeoJson.features?.length === EDO_SOURCE_FEATURE_COUNT, "source feature count is invalid");

  exactKeys(value.selectionContract, CONTRACT_KEYS, "selectionContract");
  assert(value.selectionContract.candidateCount === DESCRIPTION_PRIORITY_CANDIDATE_COUNT, "candidate count contract is invalid");
  assert(value.selectionContract.perCategory === DESCRIPTION_PRIORITY_PER_CATEGORY, "per-category contract is invalid");
  assert(JSON.stringify(value.selectionContract.categories) === JSON.stringify(DESCRIPTION_PRIORITY_CATEGORIES), "category contract is invalid");
  assert(value.selectionContract.geographicCellDegrees === 0.01, "geographic cell contract is invalid");
  assert(value.selectionContract.tieBreak === "score-desc-then-sourceIndex-asc", "tie-break contract is invalid");
  assert(Array.isArray(value.candidates) && value.candidates.length === DESCRIPTION_PRIORITY_CANDIDATE_COUNT, "candidate count does not match contract");

  const identities = new Set();
  const categoryCounts = new Map(DESCRIPTION_PRIORITY_CATEGORIES.map((category) => [category, 0]));
  let previousCategory = -1;
  let previousScore = Infinity;
  let previousIndex = -1;
  for (const [index, candidate] of value.candidates.entries()) {
    const label = `candidates[${index}]`;
    exactKeys(candidate, CANDIDATE_KEYS, label);
    const feature = validateIdentity(candidate.sourceIdentity, sourceGeoJson, `${label}.sourceIdentity`);
    const key = identityKey(candidate.sourceIdentity);
    assert(!identities.has(key), `${label} duplicates source identity`);
    identities.add(key);
    assert(candidate.sourceName === feature.properties.name, `${label}.sourceName does not match source`);
    assert(candidate.category === feature.properties.category && CATEGORIES.has(candidate.category), `${label}.category is invalid`);
    assert(TIERS.has(candidate.suggestedTier), `${label}.suggestedTier is invalid`);
    assert(Number.isInteger(candidate.score), `${label}.score is invalid`);
    exactKeys(candidate.signals, SIGNAL_KEYS, `${label}.signals`);
    assert(Number.isInteger(candidate.signals.relationGroupMemberCount) && candidate.signals.relationGroupMemberCount >= 1, `${label}.signals.relationGroupMemberCount is invalid`);
    assert(RELATION_ROLES.has(candidate.signals.relationRole), `${label}.signals.relationRole is invalid`);
    assert(Number.isInteger(candidate.signals.mapAggregateMemberCount) && candidate.signals.mapAggregateMemberCount >= 1, `${label}.signals.mapAggregateMemberCount is invalid`);
    assert(typeof candidate.signals.supplemental === "boolean" && typeof candidate.signals.alreadyDescribed === "boolean" && typeof candidate.signals.alreadyCurated === "boolean", `${label}.signals boolean is invalid`);
    assert(/^[-]?\d+:[-]?\d+$/u.test(candidate.signals.geographicCell), `${label}.signals.geographicCell is invalid`);
    assert(candidate.signals.alreadyDescribed === false, `${label} must not contain already-described work`);
    assert(Array.isArray(candidate.reasonCodes) && candidate.reasonCodes.length > 0 && new Set(candidate.reasonCodes).size === candidate.reasonCodes.length, `${label}.reasonCodes is invalid`);
    for (const code of candidate.reasonCodes) assert(REASON_CODES.has(code), `${label} has unknown reasonCode`);
    assert(Array.isArray(candidate.contributions) && candidate.contributions.length > 0, `${label}.contributions is invalid`);
    const contributionSignals = new Set();
    let sum = 0;
    for (const [contributionIndex, contribution] of candidate.contributions.entries()) {
      exactKeys(contribution, CONTRIBUTION_KEYS, `${label}.contributions[${contributionIndex}]`);
      assert(SCORE_SIGNALS.has(contribution.signal) && !contributionSignals.has(contribution.signal), `${label} has unknown or duplicate score signal`);
      assert(Number.isInteger(contribution.points), `${label} contribution points are invalid`);
      contributionSignals.add(contribution.signal);
      sum += contribution.points;
    }
    assert(sum === candidate.score, `${label}.score does not equal contribution sum`);

    const categoryPosition = DESCRIPTION_PRIORITY_CATEGORIES.indexOf(candidate.category);
    assert(categoryPosition >= previousCategory, `${label} category order is not deterministic`);
    if (categoryPosition === previousCategory) {
      assert(candidate.score < previousScore || (candidate.score === previousScore && candidate.sourceIdentity.sourceIndex > previousIndex), `${label} tie ordering is not deterministic`);
    }
    previousCategory = categoryPosition;
    previousScore = candidate.score;
    previousIndex = candidate.sourceIdentity.sourceIndex;
    categoryCounts.set(candidate.category, categoryCounts.get(candidate.category) + 1);
  }
  for (const [category, count] of categoryCounts) assert(count === DESCRIPTION_PRIORITY_PER_CATEGORY, `${category} candidate diversity count is invalid`);
  return value;
}

function runCli() {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const source = JSON.parse(readFileSync(resolve(root, EDO_SOURCE_DATA_PATH), "utf8"));
  const catalog = JSON.parse(readFileSync(resolve(root, DESCRIPTION_PRIORITY_CATALOG_PATH), "utf8"));
  validateDescriptionPriorityCatalog(catalog, source);
  console.log(`DESCRIPTION_PRIORITY_VALIDATE_OK ${JSON.stringify({ candidateCount: catalog.candidates.length, sha256: canonicalDescriptionPriorityCatalogSha256(catalog) })}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
