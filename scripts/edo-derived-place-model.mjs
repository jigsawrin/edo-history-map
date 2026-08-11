import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
import {
  parseStaticEdoPlaces,
  STATIC_EDO_PER_PAGE,
} from "./build-static-place-pages.mjs";
import {
  calculateEdoStaticLegacyLayoutSha256,
  validateEdoStaticPlaceProjection,
} from "./edo-static-place-projection.mjs";

export const EDO_DERIVED_PLACE_SCHEMA_VERSION = 1;
export const EDO_DERIVED_PLACE_SNAPSHOT = Object.freeze({
  schemaVersion: 1,
  snapshotStatus: "non-runtime-foundation",
  sourceDataSha256: EDO_SOURCE_SHA256,
  sourceFeatureCount: 8788,
  sourceIdentityGroupCount: 825,
  sourceIdentityMemberCount: 1693,
  curationCandidateCount: 1,
  derivedPlaceCount: 8788,
  reverseMappedSourceRecordCount: 8788,
  multiMemberDerivedPlaceCount: 0,
  hiddenDerivedPlaceCount: 0,
  renamedDerivedPlaceCount: 0,
  annotatedDerivedPlaceCount: 0,
  mapApplicableDerivedPlaceCount: 8788,
  searchApplicableDerivedPlaceCount: 8788,
  cardApplicableDerivedPlaceCount: 8788,
  staticPageApplicableDerivedPlaceCount: 8788,
  runtimeApplicableDerivedPlaceCount: 8788,
  canonicalOutputSha256: "514085bdab22f2a09363f256de4626d7c1124a85d051df64575ef2857e69d160",
});

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
  "mapApplicableDerivedPlaceCount", "searchApplicableDerivedPlaceCount",
  "cardApplicableDerivedPlaceCount", "staticPageApplicableDerivedPlaceCount",
  "runtimeApplicableDerivedPlaceCount", "canonicalOutputSha256",
];
const SEARCH_PROJECTION_KEYS = ["schemaVersion", "sourceDataSha256", "sourceFeatureCount", "eligibleSourceCount", "overrides"];
const SEARCH_OVERRIDE_KEYS = ["sourceRecordId", "sourceIndex", "featureSha256", "displayName", "hidden"];
const EDO_SEARCH_PROJECTION_PATH = "src/place-search/edo-search-projection.json";
const MAP_PROJECTION_KEYS = ["schemaVersion", "sourceDataSha256", "sourceFeatureCount", "applicableSourceCount", "visibleMarkerCount", "overrides"];
const MAP_OVERRIDE_KEYS = ["sourceRecordId", "sourceIndex", "featureSha256", "hidden"];
const EDO_MAP_PROJECTION_PATH = "src/edo-map-projection.json";
const CARD_PROJECTION_KEYS = ["schemaVersion", "sourceDataSha256", "sourceFeatureCount", "applicableSourceCount", "renderableCardCount", "overrides"];
const CARD_OVERRIDE_KEYS = ["sourceRecordId", "sourceIndex", "featureSha256", "displayName", "hidden"];
const EDO_CARD_PROJECTION_PATH = "src/edo-card-projection.json";
const EDO_STATIC_PROJECTION_PATH = "scripts/edo-static-place-projection.json";
const PRIVATE_MARKERS = [
  "edo-derived-place-model",
  "deriveEdoPlaces",
  "EDO_DERIVED_PLACE_SNAPSHOT",
  "derivedPlaceId",
  "sourceIdentityGroupId",
  "canonicalOutputSha256",
];
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f<>]/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PUBLIC_DERIVED_PATH = /(?:^|[/\\])[^/\\]*(?:edo[-_.]?derived[-_.]?place|derived[-_.]?place[-_.]?model)[^/\\]*(?:$|[/\\])/iu;
const PUBLIC_TEXT_FILE = /\.(?:cjs|css|htm|html|js|json|jsx|map|md|mjs|mts|svg|ts|tsx|txt|xml)$/iu;
const RUNTIME_TEXT_FILE = /\.(?:js|json|jsx|mjs|mts|ts|tsx)$/iu;

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

export function isEdoDerivedPlaceSearchEligible(place) {
  return place.memberSourceRecordIds.length === 1 &&
    place.reverseMapping.length === 1 &&
    place.reverseMapping[0].sourceRecordId === place.memberSourceRecordIds[0] &&
    place.curation.hide.decision !== "approved" &&
    place.reviewState !== "needs-human-review" &&
    ["source-record", "approved-rename"].includes(place.displayName.basis);
}

export function isEdoDerivedPlaceStaticEligible(place) {
  const reverse = place.reverseMapping[0];
  return place.memberSourceRecordIds.length === 1 &&
    place.reverseMapping.length === 1 &&
    reverse?.sourceRecordId === place.memberSourceRecordIds[0] &&
    Number.isInteger(reverse?.sourceIndex) &&
    SHA256.test(reverse?.sourceFeatureSha256 ?? "") &&
    place.reviewState !== "needs-human-review" &&
    ["source-record", "approved-rename"].includes(place.displayName.basis) &&
    place.displayName.sourceRecordId === reverse.sourceRecordId &&
    ["none", "approved"].includes(place.curation.rename.decision) &&
    ["none", "approved"].includes(place.curation.hide.decision) &&
    place.rights.license === "CC BY 4.0" &&
    place.rights.sourceUrl === place.evidence[0]?.sourceUrl;
}

export function isEdoDerivedPlaceMapEligible(place) {
  const reverse = place.reverseMapping[0];
  return place.memberSourceRecordIds.length === 1 && place.reverseMapping.length === 1 &&
    reverse?.sourceRecordId === place.memberSourceRecordIds[0] && Number.isInteger(reverse?.sourceIndex) &&
    SHA256.test(reverse?.sourceFeatureSha256 ?? "") && place.reviewState !== "needs-human-review" &&
    ["source-record", "approved-rename"].includes(place.displayName.basis) &&
    place.displayName.sourceRecordId === reverse.sourceRecordId &&
    ["none", "approved"].includes(place.curation.rename.decision) &&
    ["none", "approved"].includes(place.curation.hide.decision) &&
    place.rights.license === "CC BY 4.0" && place.rights.sourceUrl === place.evidence[0]?.sourceUrl;
}

export function isEdoDerivedPlaceCardEligible(place) {
  const reverse = place.reverseMapping[0];
  return place.memberSourceRecordIds.length === 1 && place.reverseMapping.length === 1 &&
    reverse?.sourceRecordId === place.memberSourceRecordIds[0] && Number.isInteger(reverse?.sourceIndex) &&
    SHA256.test(reverse?.sourceFeatureSha256 ?? "") && place.reviewState !== "needs-human-review" &&
    ["source-record", "approved-rename"].includes(place.displayName.basis) &&
    place.displayName.sourceRecordId === reverse.sourceRecordId &&
    ["none", "approved"].includes(place.curation.rename.decision) &&
    ["none", "approved"].includes(place.curation.hide.decision) &&
    place.rights.license === "CC BY 4.0" && place.rights.sourceUrl === place.evidence[0]?.sourceUrl;
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
    const place = {
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
      applicability: { map: false, search: false, card: false, "static-page": false },
      reviewState: decisions.hide || decisions.rename || decisions.annotations.length ? "curation-approved" : "source-only",
      reverseMapping: [{ sourceRecordId: target.entryId, sourceIndex, sourceFeatureSha256: target.sourceFeatureSha256 }],
    };
    place.applicability.search = isEdoDerivedPlaceSearchEligible(place);
    place.applicability["static-page"] = isEdoDerivedPlaceStaticEligible(place);
    place.applicability.map = isEdoDerivedPlaceMapEligible(place);
    place.applicability.card = isEdoDerivedPlaceCardEligible(place);
    return place;
  });
}

export function createEdoCardProjection(places) {
  const overrides = places.filter((place) =>
    place.applicability.card &&
    (place.curation.rename.decision === "approved" || place.curation.hide.decision === "approved")
  ).map((place) => {
    const hidden = place.curation.hide.decision === "approved";
    return {
      sourceRecordId: place.reverseMapping[0].sourceRecordId,
      sourceIndex: place.reverseMapping[0].sourceIndex,
      featureSha256: place.reverseMapping[0].sourceFeatureSha256,
      displayName: hidden ? null : place.displayName.value,
      hidden,
    };
  });
  const applicableSourceCount = places.filter((place) => place.applicability.card).length;
  const hiddenCount = overrides.filter((item) => item.hidden).length;
  return {
    schemaVersion: 1,
    sourceDataSha256: EDO_SOURCE_SHA256,
    sourceFeatureCount: EDO_SOURCE_FEATURE_COUNT,
    applicableSourceCount,
    renderableCardCount: applicableSourceCount - hiddenCount,
    overrides,
  };
}

export function validateEdoDerivedCardProjection(projection, places, sourceGeoJson) {
  exactKeys(projection, CARD_PROJECTION_KEYS, "card projection");
  assert(projection.schemaVersion === 1 && projection.sourceDataSha256 === EDO_SOURCE_SHA256 &&
    projection.sourceFeatureCount === sourceGeoJson.features.length &&
    Number.isInteger(projection.applicableSourceCount) && Number.isInteger(projection.renderableCardCount) &&
    Array.isArray(projection.overrides), "card projection is stale or invalid");
  let previousIndex = -1;
  const ids = new Set();
  for (const [index, item] of projection.overrides.entries()) {
    const label = `card projection overrides[${index}]`;
    exactKeys(item, CARD_OVERRIDE_KEYS, label);
    assert(Number.isInteger(item.sourceIndex) && item.sourceIndex > previousIndex, `${label} must be ordered and unique`);
    const place = places[item.sourceIndex];
    const feature = sourceGeoJson.features[item.sourceIndex];
    assert(place?.applicability.card, `${label} targets a card-inapplicable place`);
    assert(typeof item.sourceRecordId === "string" && !ids.has(item.sourceRecordId) &&
      item.sourceRecordId === place.reverseMapping[0]?.sourceRecordId, `${label} source ID is invalid or duplicated`);
    assert(feature?.properties?.id === item.sourceRecordId &&
      calculateEdoSourceFeatureSha256(feature) === item.featureSha256 &&
      item.featureSha256 === place.reverseMapping[0]?.sourceFeatureSha256, `${label} source binding is invalid`);
    const hidden = place.curation.hide.decision === "approved";
    const renamed = place.curation.rename.decision === "approved";
    assert(item.hidden === hidden, `${label} hide is not approved`);
    if (hidden) assert(item.displayName === null, `${label} hidden place must not expose a display name`);
    else {
      assert(renamed, `${label} rename is not approved`);
      safeText(item.displayName, `${label}.displayName`);
      assert(item.displayName === place.displayName.value, `${label} displayName is not authorized`);
    }
    ids.add(item.sourceRecordId);
    previousIndex = item.sourceIndex;
  }
  assert(JSON.stringify(projection) === JSON.stringify(createEdoCardProjection(places)),
    "card projection does not match Derived card applicability");
}

export function createEdoMapProjection(places) {
  const overrides = places.filter((place) => place.applicability.map && place.curation.hide.decision === "approved").map((place) => ({
    sourceRecordId: place.reverseMapping[0].sourceRecordId,
    sourceIndex: place.reverseMapping[0].sourceIndex,
    featureSha256: place.reverseMapping[0].sourceFeatureSha256,
    hidden: true,
  }));
  const applicableSourceCount = places.filter((place) => place.applicability.map).length;
  return { schemaVersion: 1, sourceDataSha256: EDO_SOURCE_SHA256, sourceFeatureCount: EDO_SOURCE_FEATURE_COUNT,
    applicableSourceCount, visibleMarkerCount: applicableSourceCount - overrides.length, overrides };
}

export function validateEdoDerivedMapProjection(projection, places, sourceGeoJson) {
  exactKeys(projection, MAP_PROJECTION_KEYS, "map projection");
  assert(projection.schemaVersion === 1 && projection.sourceDataSha256 === EDO_SOURCE_SHA256 &&
    projection.sourceFeatureCount === sourceGeoJson.features.length && Array.isArray(projection.overrides), "map projection is stale or invalid");
  let previous = -1;
  for (const [index, item] of projection.overrides.entries()) {
    const label = `map projection overrides[${index}]`;
    exactKeys(item, MAP_OVERRIDE_KEYS, label);
    assert(Number.isInteger(item.sourceIndex) && item.sourceIndex > previous, `${label} must be deterministically ordered`);
    previous = item.sourceIndex;
    const place = places[item.sourceIndex];
    const feature = sourceGeoJson.features[item.sourceIndex];
    assert(place?.applicability.map, `${label} targets a map-inapplicable place`);
    assert(place.curation.hide.decision === "approved" && item.hidden === true, `${label} hide state is not approved`);
    assert(feature?.properties?.id === item.sourceRecordId && calculateEdoSourceFeatureSha256(feature) === item.featureSha256, `${label} source binding is invalid`);
  }
  assert(JSON.stringify(projection) === JSON.stringify(createEdoMapProjection(places)), "map projection does not match Derived map applicability");
}

export function createEdoSearchProjection(places) {
  const overrides = [];
  for (const place of places) {
    const reverse = place.reverseMapping[0];
    const hidden = !place.applicability.search;
    const displayName = place.displayName.basis === "approved-rename" ? place.displayName.value : null;
    if (!hidden && displayName === null) continue;
    overrides.push({
      sourceRecordId: reverse.sourceRecordId,
      sourceIndex: reverse.sourceIndex,
      featureSha256: reverse.sourceFeatureSha256,
      displayName,
      hidden,
    });
  }
  return {
    schemaVersion: 1,
    sourceDataSha256: EDO_SOURCE_SHA256,
    sourceFeatureCount: EDO_SOURCE_FEATURE_COUNT,
    eligibleSourceCount: places.filter((place) => place.applicability.search).length,
    overrides,
  };
}

export function validateEdoSearchProjection(projection, places, sourceGeoJson) {
  exactKeys(projection, SEARCH_PROJECTION_KEYS, "search projection");
  assert(projection.schemaVersion === 1, "search projection schemaVersion must be 1");
  assert(projection.sourceDataSha256 === EDO_SOURCE_SHA256, "search projection source SHA is stale");
  assert(projection.sourceFeatureCount === sourceGeoJson.features.length, "search projection source count is stale");
  assert(Array.isArray(projection.overrides), "search projection overrides must be an array");
  let previousIndex = -1;
  const targets = new Set();
  for (const [index, item] of projection.overrides.entries()) {
    const label = `search projection overrides[${index}]`;
    exactKeys(item, SEARCH_OVERRIDE_KEYS, label);
    assert(Number.isInteger(item.sourceIndex) && item.sourceIndex > previousIndex, `${label} must be deterministically ordered`);
    assert(!targets.has(item.sourceIndex), `${label} target is duplicated`);
    targets.add(item.sourceIndex);
    previousIndex = item.sourceIndex;
    const place = places[item.sourceIndex];
    const reverse = place?.reverseMapping[0];
    assert(reverse?.sourceRecordId === item.sourceRecordId, `${label} sourceIndex/sourceRecordId is invalid`);
    assert(reverse?.sourceFeatureSha256 === item.featureSha256, `${label} feature SHA is invalid`);
    assert(item.displayName === null || item.displayName === place.displayName.value, `${label} rename is not approved`);
    assert(item.hidden === !place.applicability.search, `${label} hide state is not authorized`);
    assert(!item.hidden || item.displayName === null, `${label} search-inapplicable place cannot have a rename`);
  }
  const expected = createEdoSearchProjection(places);
  assert(JSON.stringify(projection) === JSON.stringify(expected), "search projection does not match Derived search applicability");
}

export function createEdoStaticPlaceProjection(places, legacyLayoutSha256) {
  assert(SHA256.test(legacyLayoutSha256), "static projection legacy layout SHA is invalid");
  const overrides = [];
  for (const place of places) {
    const reverse = place.reverseMapping[0];
    const hidden = place.curation.hide.decision === "approved";
    const displayName = !hidden && place.displayName.basis === "approved-rename" ? place.displayName.value : null;
    if (!hidden && displayName === null) continue;
    overrides.push({
      sourceRecordId: reverse.sourceRecordId,
      sourceIndex: reverse.sourceIndex,
      featureSha256: reverse.sourceFeatureSha256,
      displayName,
      hidden,
    });
  }
  return {
    schemaVersion: 1,
    sourceDataSha256: EDO_SOURCE_SHA256,
    sourceFeatureCount: EDO_SOURCE_FEATURE_COUNT,
    eligibleSourceCount: places.filter((place) => place.applicability["static-page"]).length,
    legacyLayoutSha256,
    overrides,
  };
}

export function validateEdoDerivedStaticPlaceProjection(projection, places, sourceGeoJson, staticPlaces) {
  const legacyLayoutSha256 = calculateEdoStaticLegacyLayoutSha256(staticPlaces, STATIC_EDO_PER_PAGE);
  validateEdoStaticPlaceProjection(projection, staticPlaces, {
    sourceDataSha256: EDO_SOURCE_SHA256,
    perPage: STATIC_EDO_PER_PAGE,
  });
  for (const [index, item] of projection.overrides.entries()) {
    const place = places[item.sourceIndex];
    const label = `static projection overrides[${index}]`;
    assert(place?.applicability["static-page"], `${label} targets a static-inapplicable place`);
    assert(item.hidden === (place.curation.hide.decision === "approved"), `${label} hide state is not approved`);
    const approvedName = place.displayName.basis === "approved-rename" ? place.displayName.value : null;
    assert(item.displayName === (item.hidden ? null : approvedName), `${label} rename is not approved`);
    const feature = sourceGeoJson.features[item.sourceIndex];
    assert(feature?.properties?.id === item.sourceRecordId && calculateEdoSourceFeatureSha256(feature) === item.featureSha256, `${label} source binding is invalid`);
  }
  const expected = createEdoStaticPlaceProjection(places, legacyLayoutSha256);
  assert(JSON.stringify(projection) === JSON.stringify(expected), "static projection does not match Derived static applicability");
}

export function validateEdoDerivedPlaces(places, sourceGeoJson, identityCatalog, curationCatalog) {
  validateEdoPlaceSourceIdentityCatalog(identityCatalog, sourceGeoJson);
  validateEdoPlaceCurationCatalog(curationCatalog, sourceGeoJson);
  const expectedPlaces = deriveEdoPlaces(sourceGeoJson, identityCatalog, curationCatalog);
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
    assert(
      JSON.stringify(place) === JSON.stringify(expectedPlaces[index]),
      `${label} does not match the authoritative source, identity, and curation inputs`,
    );
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
    mapApplicableDerivedPlaceCount: places.filter((place) => place.applicability.map).length,
    searchApplicableDerivedPlaceCount: places.filter((place) => place.applicability.search).length,
    cardApplicableDerivedPlaceCount: places.filter((place) => place.applicability.card).length,
    staticPageApplicableDerivedPlaceCount: places.filter((place) => place.applicability["static-page"]).length,
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
      const rel = relative(root, path).replace(/\\/gu, "/");
      if (PUBLIC_DERIVED_PATH.test(`/${rel}`)) {
        errors.push(`non-runtime derived place file path leaked into ${rel}`);
        continue;
      }
      if (!PUBLIC_TEXT_FILE.test(path)) continue;
      const text = readFileSync(path, "utf8");
      if (PRIVATE_MARKERS.some((marker) => text.includes(marker))) errors.push(`non-runtime derived place marker leaked into ${rel}`);
    }
  }
  for (const path of filesUnder(resolve(root, "src"))) {
    if (!RUNTIME_TEXT_FILE.test(path)) continue;
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
    const places = deriveEdoPlaces(source, identity, curation);
    validateEdoDerivedPlaces(places, source, identity, curation);
    summary = summarizeEdoDerivedPlaces(places, identity, curation);
    validateEdoDerivedPlaceSnapshot(EDO_DERIVED_PLACE_SNAPSHOT, summary);
    const projection = JSON.parse(readFileSync(resolve(root, EDO_SEARCH_PROJECTION_PATH), "utf8"));
    validateEdoSearchProjection(projection, places, source);
    const mapProjection = JSON.parse(readFileSync(resolve(root, EDO_MAP_PROJECTION_PATH), "utf8"));
    validateEdoDerivedMapProjection(mapProjection, places, source);
    const cardProjection = JSON.parse(readFileSync(resolve(root, EDO_CARD_PROJECTION_PATH), "utf8"));
    validateEdoDerivedCardProjection(cardProjection, places, source);
    const staticPlaces = parseStaticEdoPlaces(readFileSync(resolve(root, EDO_SOURCE_DATA_PATH), "utf8"));
    const staticProjection = JSON.parse(readFileSync(resolve(root, EDO_STATIC_PROJECTION_PATH), "utf8"));
    validateEdoDerivedStaticPlaceProjection(staticProjection, places, source, staticPlaces);
    assert(summary.sourceIdentityGroupCount === EDO_SOURCE_IDENTITY_EXPECTED.groups, "source identity group count changed");
    assert(summary.sourceIdentityMemberCount === EDO_SOURCE_IDENTITY_EXPECTED.members, "source identity member count changed");
    assert(summary.multiMemberDerivedPlaceCount === 0, "identity groups must not automatically merge derived places");
    assert(summary.mapApplicableDerivedPlaceCount === summary.derivedPlaceCount, "every current source record must be map-applicable");
    assert(summary.searchApplicableDerivedPlaceCount === summary.derivedPlaceCount, "every current source record must be search-applicable");
    assert(summary.cardApplicableDerivedPlaceCount === summary.derivedPlaceCount, "every current source record must be card-applicable");
    assert(summary.staticPageApplicableDerivedPlaceCount === summary.derivedPlaceCount, "every current source record must be static-page applicable");
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
