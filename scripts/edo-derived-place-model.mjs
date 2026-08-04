import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculateEdoSourceFeatureSha256,
  EDO_CURATION_CATALOG_PATH,
  EDO_SOURCE_DATA_PATH,
  EDO_SOURCE_DATASET_ID,
  EDO_SOURCE_FEATURE_COUNT,
  EDO_SOURCE_SHA256,
  validateEdoPlaceCurationCatalog,
} from "./edo-place-curation-candidates.mjs";
import {
  EDO_SOURCE_IDENTITY_CATALOG_PATH,
  EDO_SOURCE_IDENTITY_EXPECTED,
  summarizeEdoPlaceSourceIdentityRelations,
  validateEdoPlaceSourceIdentityCatalog,
} from "./edo-place-source-identity-relations.mjs";

export const EDO_DERIVED_PLACE_SNAPSHOT_PATH =
  "audit/edo-derived-place-model.snapshot.json";
export const EDO_DERIVED_PLACE_SCHEMA_VERSION = 1;

const PLACE_KEYS = [
  "schemaVersion", "derivedPlaceId", "sourceDatasetId", "sourceIdentityGroupId",
  "memberSourceRecordIds", "displayRepresentativeSourceRecordId", "displayName",
  "sourceNames", "sourceDifferences", "location", "curation", "evidence", "rights",
  "applicability", "reviewState", "reverseMapping",
];
const DISPLAY_NAME_KEYS = ["value", "basis", "sourceRecordId", "curationCandidateId"];
const DIFFERENCE_KEYS = ["hasNameDifference", "hasCategoryDifference", "hasSheetDifference", "categories", "sheets"];
const LOCATION_KEYS = ["longitude", "latitude", "basisSourceRecordId", "certainty"];
const CURATION_KEYS = ["hide", "rename", "annotations"];
const DECISION_KEYS = ["decision", "candidateId"];
const EVIDENCE_KEYS = ["kind", "id", "sourceUrl"];
const RIGHTS_KEYS = ["license", "attribution", "sourceUrl"];
const APPLICABILITY_KEYS = ["map", "search", "card", "static-page"];
const REVERSE_KEYS = ["sourceRecordId", "sourceIndex", "sourceFeatureSha256"];
const SNAPSHOT_KEYS = [
  "schemaVersion", "snapshotStatus", "sourceDataSha256", "sourceFeatureCount",
  "sourceIdentityGroupCount", "sourceIdentityMemberCount", "curationCandidateCount",
  "derivedPlaceCount", "reverseMappedSourceRecordCount", "multiMemberDerivedPlaceCount",
  "hiddenDerivedPlaceCount", "renamedDerivedPlaceCount", "annotatedDerivedPlaceCount",
  "runtimeApplicableDerivedPlaceCount", "canonicalOutputSha256",
];
const PRIVATE_MARKERS = [
  "edo-derived-place-model.snapshot.json",
  "derivedPlaceId",
  "sourceIdentityGroupId",
  "canonicalOutputSha256",
];
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f<>]/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  assert(actual.length === wanted.length && actual.every((key, index) => key === wanted[index]), `${label} has unknown or missing keys`);
}

function safeText(value, label) {
  assert(typeof value === "string" && value.length > 0 && value === value.trim() && !UNSAFE_TEXT.test(value), `${label} must be safe non-empty text`);
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function targetFromFeature(feature, sourceIndex) {
  return {
    sourceIndex,
    entryId: feature.properties.id,
    sourceFeatureSha256: calculateEdoSourceFeatureSha256(feature),
    name: feature.properties.name,
    category: feature.properties.category,
    sheet: feature.properties.sheet,
    sourceUrl: feature.properties.source,
    longitude: feature.geometry.coordinates[0],
    latitude: feature.geometry.coordinates[1],
  };
}

function approvedBySourceIndex(curationCatalog) {
  const result = new Map();
  for (const candidate of curationCatalog.candidates) {
    if (candidate.review.status !== "approved") continue;
    const item = result.get(candidate.target.sourceIndex) ?? { hide: null, rename: null, annotations: [] };
    if (candidate.proposalType === "hide") item.hide = candidate;
    if (candidate.proposalType === "rename") item.rename = candidate;
    if (candidate.proposalType === "annotation") item.annotations.push(candidate);
    result.set(candidate.target.sourceIndex, item);
  }
  return result;
}

function identityMembership(identityCatalog) {
  const result = new Map();
  for (const group of identityCatalog.groups) {
    for (const member of group.members) result.set(member.target.entryId, group.groupId);
  }
  return result;
}

export function deriveEdoPlaces(sourceGeoJson, identityCatalog, curationCatalog) {
  validateEdoPlaceSourceIdentityCatalog(identityCatalog, sourceGeoJson);
  validateEdoPlaceCurationCatalog(curationCatalog, sourceGeoJson);
  const identities = identityMembership(identityCatalog);
  const curation = approvedBySourceIndex(curationCatalog);
  return sourceGeoJson.features.map((feature, sourceIndex) => {
    const target = targetFromFeature(feature, sourceIndex);
    const decisions = curation.get(sourceIndex) ?? { hide: null, rename: null, annotations: [] };
    const identityGroupId = identities.get(target.entryId) ?? null;
    const evidence = [{ kind: "source-record", id: target.entryId, sourceUrl: target.sourceUrl }];
    if (identityGroupId) evidence.push({ kind: "source-identity-relation", id: identityGroupId, sourceUrl: null });
    for (const candidate of [decisions.hide, decisions.rename, ...decisions.annotations].filter(Boolean)) {
      evidence.push({ kind: "manual-curation", id: candidate.candidateId, sourceUrl: candidate.evidence.urls[0] ?? null });
    }
    const runtimeApplicable = false;
    return {
      schemaVersion: 1,
      derivedPlaceId: `edo-derived-source-${target.entryId}`,
      sourceDatasetId: EDO_SOURCE_DATASET_ID,
      sourceIdentityGroupId: identityGroupId,
      memberSourceRecordIds: [target.entryId],
      displayRepresentativeSourceRecordId: target.entryId,
      displayName: {
        value: decisions.rename?.proposal.displayNameJa ?? target.name,
        basis: decisions.rename ? "approved-rename" : "source-record",
        sourceRecordId: target.entryId,
        curationCandidateId: decisions.rename?.candidateId ?? null,
      },
      sourceNames: [{ sourceRecordId: target.entryId, value: target.name }],
      sourceDifferences: {
        hasNameDifference: false,
        hasCategoryDifference: false,
        hasSheetDifference: false,
        categories: [target.category],
        sheets: [target.sheet],
      },
      location: {
        longitude: target.longitude,
        latitude: target.latitude,
        basisSourceRecordId: target.entryId,
        certainty: "source-point-unassessed",
      },
      curation: {
        hide: { decision: decisions.hide ? "approved" : "none", candidateId: decisions.hide?.candidateId ?? null },
        rename: { decision: decisions.rename ? "approved" : "none", candidateId: decisions.rename?.candidateId ?? null },
        annotations: decisions.annotations.map((item) => ({ candidateId: item.candidateId, text: item.proposal.noteJa })),
      },
      evidence,
      rights: {
        license: "CC BY 4.0",
        attribution: "ROIS-DS Center for Open Data in the Humanities (CODH), Edo Maps Dataset",
        sourceUrl: target.sourceUrl,
      },
      applicability: { map: runtimeApplicable, search: runtimeApplicable, card: runtimeApplicable, "static-page": runtimeApplicable },
      reviewState: decisions.hide || decisions.rename || decisions.annotations.length ? "curation-approved" : "source-only",
      reverseMapping: [{ sourceRecordId: target.entryId, sourceIndex, sourceFeatureSha256: target.sourceFeatureSha256 }],
    };
  });
}

export function validateEdoDerivedPlaces(places, sourceGeoJson, identityCatalog) {
  assert(Array.isArray(places), "derived places must be an array");
  assert(places.length === sourceGeoJson.features.length, "derived place count must preserve every source record");
  const sourceIds = new Set(sourceGeoJson.features.map((feature) => feature.properties.id));
  const identityIds = new Set(identityCatalog.groups.map((group) => group.groupId));
  const derivedIds = new Set();
  const reverseIds = new Set();
  for (const [index, place] of places.entries()) {
    const label = `places[${index}]`;
    exactKeys(place, PLACE_KEYS, label);
    assert(place.schemaVersion === 1, `${label}.schemaVersion must be 1`);
    safeText(place.derivedPlaceId, `${label}.derivedPlaceId`);
    assert(!derivedIds.has(place.derivedPlaceId), `${label}.derivedPlaceId is duplicated`);
    derivedIds.add(place.derivedPlaceId);
    assert(place.sourceDatasetId === EDO_SOURCE_DATASET_ID, `${label}.sourceDatasetId is invalid`);
    assert(place.sourceIdentityGroupId === null || identityIds.has(place.sourceIdentityGroupId), `${label}.sourceIdentityGroupId is invalid`);
    assert(Array.isArray(place.memberSourceRecordIds) && place.memberSourceRecordIds.length >= 1, `${label}.memberSourceRecordIds is invalid`);
    assert(place.memberSourceRecordIds.every((id) => sourceIds.has(id)), `${label}.memberSourceRecordIds contains an unknown record`);
    assert(place.memberSourceRecordIds.includes(place.displayRepresentativeSourceRecordId), `${label}.display representative must be a member`);
    exactKeys(place.displayName, DISPLAY_NAME_KEYS, `${label}.displayName`);
    safeText(place.displayName.value, `${label}.displayName.value`);
    assert(["source-record", "approved-rename"].includes(place.displayName.basis), `${label}.displayName.basis is invalid`);
    assert(place.memberSourceRecordIds.includes(place.displayName.sourceRecordId), `${label}.displayName source is not a member`);
    assert((place.displayName.basis === "source-record") === (place.displayName.curationCandidateId === null), `${label}.displayName curation basis is inconsistent`);
    assert(Array.isArray(place.sourceNames) && place.sourceNames.length === place.memberSourceRecordIds.length, `${label}.sourceNames is incomplete`);
    place.sourceNames.forEach((item, itemIndex) => { exactKeys(item, ["sourceRecordId", "value"], `${label}.sourceNames[${itemIndex}]`); safeText(item.value, `${label}.sourceNames[${itemIndex}].value`); });
    exactKeys(place.sourceDifferences, DIFFERENCE_KEYS, `${label}.sourceDifferences`);
    assert(place.sourceDifferences.hasNameDifference === (new Set(place.sourceNames.map((item) => item.value)).size > 1), `${label}.hasNameDifference is inconsistent`);
    assert(Array.isArray(place.sourceDifferences.categories) && Array.isArray(place.sourceDifferences.sheets), `${label}.source differences lists are invalid`);
    assert(place.sourceDifferences.hasCategoryDifference === (place.sourceDifferences.categories.length > 1), `${label}.hasCategoryDifference is inconsistent`);
    assert(place.sourceDifferences.hasSheetDifference === (place.sourceDifferences.sheets.length > 1), `${label}.hasSheetDifference is inconsistent`);
    assert(JSON.stringify(place.sourceDifferences.categories) === JSON.stringify(sortedUnique(place.sourceDifferences.categories)), `${label}.categories must be sorted and unique`);
    assert(JSON.stringify(place.sourceDifferences.sheets) === JSON.stringify(sortedUnique(place.sourceDifferences.sheets)), `${label}.sheets must be sorted and unique`);
    exactKeys(place.location, LOCATION_KEYS, `${label}.location`);
    assert(Number.isFinite(place.location.longitude) && Number.isFinite(place.location.latitude), `${label}.location coordinates are invalid`);
    assert(place.memberSourceRecordIds.includes(place.location.basisSourceRecordId), `${label}.location basis is not a member`);
    assert(place.location.certainty === "source-point-unassessed", `${label}.location certainty is invalid`);
    exactKeys(place.curation, CURATION_KEYS, `${label}.curation`);
    for (const key of ["hide", "rename"]) { exactKeys(place.curation[key], DECISION_KEYS, `${label}.curation.${key}`); assert(["none", "approved"].includes(place.curation[key].decision), `${label}.curation.${key}.decision is invalid`); assert((place.curation[key].decision === "none") === (place.curation[key].candidateId === null), `${label}.curation.${key} is inconsistent`); }
    assert(Array.isArray(place.curation.annotations), `${label}.curation.annotations must be an array`);
    place.curation.annotations.forEach((item, itemIndex) => { exactKeys(item, ["candidateId", "text"], `${label}.curation.annotations[${itemIndex}]`); safeText(item.text, `${label}.curation.annotations[${itemIndex}].text`); });
    assert(Array.isArray(place.evidence) && place.evidence.length >= 1, `${label}.evidence is required`);
    place.evidence.forEach((item, itemIndex) => { exactKeys(item, EVIDENCE_KEYS, `${label}.evidence[${itemIndex}]`); assert(["source-record", "source-identity-relation", "manual-curation"].includes(item.kind), `${label}.evidence kind is invalid`); safeText(item.id, `${label}.evidence id`); });
    exactKeys(place.rights, RIGHTS_KEYS, `${label}.rights`);
    assert(place.rights.license === "CC BY 4.0", `${label}.rights license is invalid`);
    safeText(place.rights.attribution, `${label}.rights.attribution`);
    safeText(place.rights.sourceUrl, `${label}.rights.sourceUrl`);
    exactKeys(place.applicability, APPLICABILITY_KEYS, `${label}.applicability`);
    assert(Object.values(place.applicability).every((value) => typeof value === "boolean"), `${label}.applicability values must be boolean`);
    assert(["source-only", "needs-human-review", "curation-approved"].includes(place.reviewState), `${label}.reviewState is invalid`);
    assert(Array.isArray(place.reverseMapping) && place.reverseMapping.length === place.memberSourceRecordIds.length, `${label}.reverseMapping is incomplete`);
    for (const [reverseIndex, reverse] of place.reverseMapping.entries()) {
      exactKeys(reverse, REVERSE_KEYS, `${label}.reverseMapping[${reverseIndex}]`);
      assert(place.memberSourceRecordIds.includes(reverse.sourceRecordId), `${label}.reverseMapping source is not a member`);
      assert(!reverseIds.has(reverse.sourceRecordId), `source record is reverse-mapped more than once: ${reverse.sourceRecordId}`);
      reverseIds.add(reverse.sourceRecordId);
      assert(Number.isInteger(reverse.sourceIndex) && SHA256.test(reverse.sourceFeatureSha256), `${label}.reverseMapping target is invalid`);
      const feature = sourceGeoJson.features[reverse.sourceIndex];
      assert(feature?.properties?.id === reverse.sourceRecordId && calculateEdoSourceFeatureSha256(feature) === reverse.sourceFeatureSha256, `${label}.reverseMapping does not match source GeoJSON`);
    }
  }
  assert(reverseIds.size === sourceIds.size && [...sourceIds].every((id) => reverseIds.has(id)), "reverse mapping must cover all source records exactly once");
}

export function canonicalEdoDerivedPlacesSha256(places) {
  return createHash("sha256").update(JSON.stringify(places)).digest("hex");
}

export function summarizeEdoDerivedPlaces(places, identityCatalog, curationCatalog) {
  const identitySummary = summarizeEdoPlaceSourceIdentityRelations(identityCatalog);
  return {
    schemaVersion: 1,
    snapshotStatus: "non-runtime-foundation",
    sourceDataSha256: EDO_SOURCE_SHA256,
    sourceFeatureCount: EDO_SOURCE_FEATURE_COUNT,
    sourceIdentityGroupCount: identitySummary.groups,
    sourceIdentityMemberCount: identitySummary.members,
    curationCandidateCount: curationCatalog.candidates.length,
    derivedPlaceCount: places.length,
    reverseMappedSourceRecordCount: new Set(places.flatMap((place) => place.reverseMapping.map((item) => item.sourceRecordId))).size,
    multiMemberDerivedPlaceCount: places.filter((place) => place.memberSourceRecordIds.length > 1).length,
    hiddenDerivedPlaceCount: places.filter((place) => place.curation.hide.decision === "approved").length,
    renamedDerivedPlaceCount: places.filter((place) => place.curation.rename.decision === "approved").length,
    annotatedDerivedPlaceCount: places.filter((place) => place.curation.annotations.length > 0).length,
    runtimeApplicableDerivedPlaceCount: places.filter((place) => Object.values(place.applicability).some(Boolean)).length,
    canonicalOutputSha256: canonicalEdoDerivedPlacesSha256(places),
  };
}

export function validateEdoDerivedPlaceSnapshot(snapshot, expected) {
  exactKeys(snapshot, SNAPSHOT_KEYS, "snapshot");
  exactKeys(expected, SNAPSHOT_KEYS, "expected snapshot");
  assert(JSON.stringify(snapshot) === JSON.stringify(expected), "derived place snapshot does not match deterministic output");
}

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

export function auditEdoDerivedPlaceLeakage(root) {
  const errors = [];
  for (const area of ["public", "dist"]) {
    for (const path of filesUnder(resolve(root, area))) {
      if (statSync(path).size > 10_000_000) continue;
      const text = readFileSync(path, "utf8");
      if (PRIVATE_MARKERS.some((marker) => text.includes(marker))) errors.push(`non-runtime derived place marker leaked into ${relative(root, path)}`);
    }
  }
  for (const path of filesUnder(resolve(root, "src"))) {
    if (!/\.(?:ts|json)$/u.test(path)) continue;
    const text = readFileSync(path, "utf8");
    if (PRIVATE_MARKERS.some((marker) => text.includes(marker))) {
      errors.push(`runtime source imports non-runtime derived place data: ${relative(root, path)}`);
    }
  }
  return errors;
}

export function auditEdoDerivedPlaceRepository(root = process.cwd()) {
  const errors = [];
  let summary = null;
  try {
    const source = JSON.parse(readFileSync(resolve(root, EDO_SOURCE_DATA_PATH), "utf8"));
    const identity = JSON.parse(readFileSync(resolve(root, EDO_SOURCE_IDENTITY_CATALOG_PATH), "utf8"));
    const curation = JSON.parse(readFileSync(resolve(root, EDO_CURATION_CATALOG_PATH), "utf8"));
    const snapshot = JSON.parse(readFileSync(resolve(root, EDO_DERIVED_PLACE_SNAPSHOT_PATH), "utf8"));
    const places = deriveEdoPlaces(source, identity, curation);
    validateEdoDerivedPlaces(places, source, identity);
    summary = summarizeEdoDerivedPlaces(places, identity, curation);
    validateEdoDerivedPlaceSnapshot(snapshot, summary);
    assert(summary.sourceIdentityGroupCount === EDO_SOURCE_IDENTITY_EXPECTED.groups, "source identity group count changed");
    assert(summary.sourceIdentityMemberCount === EDO_SOURCE_IDENTITY_EXPECTED.members, "source identity member count changed");
    assert(summary.multiMemberDerivedPlaceCount === 0, "identity groups must not automatically merge derived places");
    assert(summary.runtimeApplicableDerivedPlaceCount === 0, "foundation must not be runtime-applicable");
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  errors.push(...auditEdoDerivedPlaceLeakage(root));
  return { errors, summary };
}

const isDirect = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirect) {
  const audit = auditEdoDerivedPlaceRepository();
  if (audit.errors.length) {
    for (const error of audit.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`EDO_DERIVED_PLACE_MODEL_AUDIT_OK ${JSON.stringify(audit.summary)}`);
  }
}
