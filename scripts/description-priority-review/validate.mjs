import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  canonicalDescriptionPriorityCatalogSha256,
  DESCRIPTION_PRIORITY_CANDIDATE_COUNT,
  DESCRIPTION_PRIORITY_CATALOG_PATH,
  validateDescriptionPriorityCatalog,
} from "../description-priority/validate.mjs";
import { EDO_SOURCE_DATA_PATH } from "../edo-place-curation-candidates.mjs";

export const DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH = "data-curation/description-priority-review.json";
export const DESCRIPTION_PRIORITY_REVIEW_REPORT_PATH = "data-curation/reports/description-priority-review.md";
export const DESCRIPTION_PRIORITY_REVIEW_SCHEMA_VERSION = 1;
export const FROZEN_DESCRIPTION_PRIORITY_SHA256 = "29d62c0665c5853a0ff17bdca795a0296789a2b979c7909c834469a573449400";
export const REVIEW_STATES = Object.freeze(["unreviewed", "reviewed"]);
export const REVIEW_CLASSIFICATIONS = Object.freeze([
  "good-candidate", "structured-only", "supporting-or-duplicate", "low-value", "uncertain",
]);
export const HUMAN_PRIORITIES = Object.freeze(["high", "medium", "low", "undecided"]);
export const HUMAN_REASON_CODES = Object.freeze([
  "historically-recognizable", "strong-local-context", "event-linked", "person-linked",
  "institution-linked", "transport-linked", "landmark-linked", "generic-name",
  "low-information-name", "supporting-record", "possible-duplicate", "already-well-covered",
  "needs-evidence", "needs-identity-review", "other",
]);

const TOP_KEYS = ["schemaVersion", "catalogStatus", "purpose", "priorityArtifact", "reviewEntries"];
const ARTIFACT_KEYS = ["path", "canonicalSha256", "candidateCount"];
const ENTRY_KEYS = ["sourceIdentity", "prioritySnapshot", "reviewState", "classification", "humanPriority", "humanReasonCodes", "note"];
const IDENTITY_KEYS = ["datasetId", "sourceIndex", "entryId", "sourceFeatureSha256"];
const SNAPSHOT_KEYS = ["sourceName", "category", "suggestedTier", "score"];
const REVIEW_STATE_SET = new Set(REVIEW_STATES);
const CLASSIFICATION_SET = new Set(REVIEW_CLASSIFICATIONS);
const PRIORITY_SET = new Set(HUMAN_PRIORITIES);
const REASON_SET = new Set(HUMAN_REASON_CODES);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert(JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort()), `${label} has unknown or missing fields`);
}

export function descriptionPriorityReviewIdentityKey(identity) {
  return `${identity.datasetId}\u0000${identity.sourceIndex}\u0000${identity.entryId}\u0000${identity.sourceFeatureSha256}`;
}

export function validateFrozenDescriptionPriorityCatalog(priorityCatalog, sourceGeoJson) {
  validateDescriptionPriorityCatalog(priorityCatalog, sourceGeoJson);
  const prioritySha = canonicalDescriptionPriorityCatalogSha256(priorityCatalog);
  assert(prioritySha === FROZEN_DESCRIPTION_PRIORITY_SHA256, "frozen Description Priority artifact SHA-256 mismatch");
  return prioritySha;
}

export function validateDescriptionPriorityReviewCatalog(value, priorityCatalog, sourceGeoJson) {
  const prioritySha = validateFrozenDescriptionPriorityCatalog(priorityCatalog, sourceGeoJson);

  exactKeys(value, TOP_KEYS, "description priority review catalog");
  assert(value.schemaVersion === DESCRIPTION_PRIORITY_REVIEW_SCHEMA_VERSION, "review schemaVersion is invalid");
  assert(value.catalogStatus === "private-description-priority-human-review", "review catalogStatus is invalid");
  assert(value.purpose === "human-calibration-only", "review purpose is invalid");
  exactKeys(value.priorityArtifact, ARTIFACT_KEYS, "priorityArtifact");
  assert(value.priorityArtifact.path === DESCRIPTION_PRIORITY_CATALOG_PATH, "priorityArtifact.path is invalid");
  assert(value.priorityArtifact.canonicalSha256 === FROZEN_DESCRIPTION_PRIORITY_SHA256, "wrong Priority artifact binding");
  assert(value.priorityArtifact.canonicalSha256 === prioritySha, "stored Priority artifact differs from review basis");
  assert(value.priorityArtifact.candidateCount === DESCRIPTION_PRIORITY_CANDIDATE_COUNT, "priorityArtifact.candidateCount is invalid");
  assert(Array.isArray(value.reviewEntries) && value.reviewEntries.length === DESCRIPTION_PRIORITY_CANDIDATE_COUNT, "missing Priority candidate or invalid review entry count");

  const priorityByIdentity = new Map(priorityCatalog.candidates.map((candidate) => [descriptionPriorityReviewIdentityKey(candidate.sourceIdentity), candidate]));
  const seen = new Set();
  for (const [index, entry] of value.reviewEntries.entries()) {
    const label = `reviewEntries[${index}]`;
    exactKeys(entry, ENTRY_KEYS, label);
    exactKeys(entry.sourceIdentity, IDENTITY_KEYS, `${label}.sourceIdentity`);
    const key = descriptionPriorityReviewIdentityKey(entry.sourceIdentity);
    assert(!seen.has(key), `${label} duplicates review identity`);
    seen.add(key);
    const priority = priorityByIdentity.get(key);
    assert(priority, `${label} is not present in the frozen 72-candidate catalog or has wrong source identity`);
    assert(descriptionPriorityReviewIdentityKey(priorityCatalog.candidates[index]?.sourceIdentity) === key, `${label} review ordering is not deterministic`);
    exactKeys(entry.prioritySnapshot, SNAPSHOT_KEYS, `${label}.prioritySnapshot`);
    const expectedSnapshot = {
      sourceName: priority.sourceName,
      category: priority.category,
      suggestedTier: priority.suggestedTier,
      score: priority.score,
    };
    assert(JSON.stringify(entry.prioritySnapshot) === JSON.stringify(expectedSnapshot), `${label} Priority snapshot mismatch`);
    assert(REVIEW_STATE_SET.has(entry.reviewState), `${label}.reviewState is invalid`);
    assert(entry.classification === null || CLASSIFICATION_SET.has(entry.classification), `${label}.classification is invalid`);
    assert(PRIORITY_SET.has(entry.humanPriority), `${label}.humanPriority is invalid`);
    assert(Array.isArray(entry.humanReasonCodes) && new Set(entry.humanReasonCodes).size === entry.humanReasonCodes.length, `${label}.humanReasonCodes is invalid`);
    for (const code of entry.humanReasonCodes) assert(REASON_SET.has(code), `${label} has invalid human reason code`);
    assert(entry.note === null || (typeof entry.note === "string" && entry.note.length > 0 && entry.note.length <= 280 && entry.note.trim() === entry.note), `${label}.note is invalid`);
    if (entry.reviewState === "unreviewed") {
      assert(entry.classification === null && entry.humanPriority === "undecided" && entry.humanReasonCodes.length === 0 && entry.note === null, `${label} unreviewed entry contains substantive human judgment`);
    } else {
      assert(CLASSIFICATION_SET.has(entry.classification), `${label} reviewed status requires a valid human classification`);
    }
  }
  assert(seen.size === priorityByIdentity.size, "missing Priority candidate");
  return value;
}

function runCli() {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const source = JSON.parse(readFileSync(resolve(root, EDO_SOURCE_DATA_PATH), "utf8"));
  const priority = JSON.parse(readFileSync(resolve(root, DESCRIPTION_PRIORITY_CATALOG_PATH), "utf8"));
  const review = JSON.parse(readFileSync(resolve(root, DESCRIPTION_PRIORITY_REVIEW_CATALOG_PATH), "utf8"));
  validateDescriptionPriorityReviewCatalog(review, priority, source);
  console.log(`DESCRIPTION_PRIORITY_REVIEW_VALIDATE_OK ${JSON.stringify({ reviewEntryCount: review.reviewEntries.length, frozenPrioritySha256: FROZEN_DESCRIPTION_PRIORITY_SHA256 })}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
