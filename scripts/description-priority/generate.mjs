import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  calculateEdoSourceFeatureSha256,
  EDO_CURATION_CATALOG_PATH,
  EDO_SOURCE_DATA_PATH,
  EDO_SOURCE_DATASET_ID,
  EDO_SOURCE_FEATURE_COUNT,
  EDO_SOURCE_SHA256,
} from "../edo-place-curation-candidates.mjs";
import { EDO_SOURCE_IDENTITY_CATALOG_PATH } from "../edo-place-source-identity-relations.mjs";
import {
  DESCRIPTION_PRIORITY_CANDIDATE_COUNT,
  DESCRIPTION_PRIORITY_CATALOG_PATH,
  DESCRIPTION_PRIORITY_CATEGORIES,
  DESCRIPTION_PRIORITY_GENERATOR_VERSION,
  DESCRIPTION_PRIORITY_PER_CATEGORY,
  DESCRIPTION_PRIORITY_SCHEMA_VERSION,
  DESCRIPTION_PRIORITY_TIERS,
  validateDescriptionPriorityCatalog,
} from "./validate.mjs";

export const DESCRIPTION_PRIORITY_INPUT_PATHS = Object.freeze({
  source: EDO_SOURCE_DATA_PATH,
  relations: EDO_SOURCE_IDENTITY_CATALOG_PATH,
  curation: EDO_CURATION_CATALOG_PATH,
  descriptions: "scripts/historical-place-description-public-projection.json",
  mapPresentation: "src/edo-map-presentation-projection.json",
});

export const DESCRIPTION_PRIORITY_CATEGORY_POINTS = Object.freeze({
  "名所": 30,
  "寺社": 25,
  "施設": 20,
  "海川池": 20,
  "地名": 15,
  "商店": 15,
  "町村字": 10,
  "屋敷地": 5,
  "その他": 5,
});

export const DESCRIPTION_PRIORITY_SCORE_WEIGHTS = Object.freeze({
  base: 10,
  singleSourceIdentity: 10,
  relationPreferred: 5,
  relationSupporting: -20,
  mapAggregate: -10,
  supplemental: -20,
  alreadyCurated: -10,
  alreadyDescribed: -100,
});

export const DESCRIPTION_PRIORITY_SUPPLEMENTAL_NAMES = Object.freeze(["（辻番）", "（木戸）", "（坂道）"]);
const SUPPLEMENTAL_NAMES = new Set(DESCRIPTION_PRIORITY_SUPPLEMENTAL_NAMES);
const CELL_DEGREES = 0.01;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function relationSignals(relations) {
  const bySourceIndex = new Map();
  for (const group of relations.groups) {
    for (const member of group.members) {
      bySourceIndex.set(member.target.sourceIndex, Object.freeze({
        relationGroupMemberCount: group.members.length,
        relationRole: member.role,
      }));
    }
  }
  return bySourceIndex;
}

function aggregateSignals(mapPresentation) {
  const bySourceIndex = new Map();
  for (const group of mapPresentation.groups) {
    for (const sourceIndex of group.memberSourceIndexes) bySourceIndex.set(sourceIndex, group.memberSourceIndexes.length);
  }
  return bySourceIndex;
}

function geographicCell(feature) {
  const [longitude, latitude] = feature.geometry.coordinates;
  return `${Math.floor(longitude / CELL_DEGREES)}:${Math.floor(latitude / CELL_DEGREES)}`;
}

function suggestedTier(signals, score) {
  if (signals.alreadyDescribed || signals.supplemental || signals.relationRole === "nonpreferred" || signals.mapAggregateMemberCount > 1) return "D";
  if (score >= 45) return "A";
  if (score >= 35) return "B";
  return "C";
}

export function scoreDescriptionPriorityRecord({ category, signals }) {
  assert(Object.hasOwn(DESCRIPTION_PRIORITY_CATEGORY_POINTS, category), `unsupported category ${category}`);
  const contributions = [
    { signal: "base", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.base },
    { signal: "category", points: DESCRIPTION_PRIORITY_CATEGORY_POINTS[category] },
  ];
  const reasonCodes = ["workflow-category-weight"];
  if (signals.relationGroupMemberCount === 1) {
    contributions.push({ signal: "singleSourceIdentity", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.singleSourceIdentity });
    reasonCodes.push("single-source-identity");
  } else if (signals.relationRole === "preferred") {
    contributions.push({ signal: "relationPreferred", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.relationPreferred });
    reasonCodes.push("relation-preferred-member");
  } else {
    contributions.push({ signal: "relationSupporting", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.relationSupporting });
    reasonCodes.push("relation-supporting-member");
  }
  if (signals.mapAggregateMemberCount > 1) {
    contributions.push({ signal: "mapAggregate", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.mapAggregate });
    reasonCodes.push("map-aggregate-member");
  }
  if (signals.supplemental) {
    contributions.push({ signal: "supplemental", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.supplemental });
    reasonCodes.push("supplemental-record");
  }
  if (signals.alreadyCurated) {
    contributions.push({ signal: "alreadyCurated", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.alreadyCurated });
    reasonCodes.push("already-curated-record");
  }
  if (signals.alreadyDescribed) {
    contributions.push({ signal: "alreadyDescribed", points: DESCRIPTION_PRIORITY_SCORE_WEIGHTS.alreadyDescribed });
    reasonCodes.push("already-described-record");
  }
  const score = contributions.reduce((sum, contribution) => sum + contribution.points, 0);
  return Object.freeze({
    suggestedTier: suggestedTier(signals, score),
    score,
    reasonCodes: Object.freeze(reasonCodes),
    contributions: Object.freeze(contributions.map(Object.freeze)),
  });
}

function selectDiverseCategoryCandidates(records) {
  const ordered = [...records].sort((a, b) => b.score - a.score || a.sourceIdentity.sourceIndex - b.sourceIdentity.sourceIndex);
  const selected = [];
  const usedCells = new Set();
  for (const record of ordered) {
    if (selected.length === DESCRIPTION_PRIORITY_PER_CATEGORY) break;
    if (!usedCells.has(record.signals.geographicCell)) {
      selected.push(record);
      usedCells.add(record.signals.geographicCell);
    }
  }
  if (selected.length < DESCRIPTION_PRIORITY_PER_CATEGORY) {
    const selectedIndexes = new Set(selected.map((record) => record.sourceIdentity.sourceIndex));
    for (const record of ordered) {
      if (selected.length === DESCRIPTION_PRIORITY_PER_CATEGORY) break;
      if (!selectedIndexes.has(record.sourceIdentity.sourceIndex)) selected.push(record);
    }
  }
  assert(selected.length === DESCRIPTION_PRIORITY_PER_CATEGORY, "category does not have enough candidates");
  return selected.sort((a, b) => b.score - a.score || a.sourceIdentity.sourceIndex - b.sourceIdentity.sourceIndex);
}

export function generateDescriptionPriorityCatalog({ source, relations, curation, descriptions, mapPresentation }) {
  assert(source?.features?.length === EDO_SOURCE_FEATURE_COUNT, "protected source count changed");
  assert(relations.sourceDataSha256 === EDO_SOURCE_SHA256, "relation catalog source hash changed");
  assert(curation.sourceDataSha256 === EDO_SOURCE_SHA256, "curation catalog source hash changed");
  assert(descriptions.sourceDataSha256 === EDO_SOURCE_SHA256, "description projection source hash changed");
  assert(mapPresentation.sourceDataSha256 === EDO_SOURCE_SHA256, "map presentation source hash changed");
  const relationByIndex = relationSignals(relations);
  const aggregateByIndex = aggregateSignals(mapPresentation);
  const curatedIndexes = new Set(curation.candidates.filter((candidate) => candidate.review.status === "approved").map((candidate) => candidate.target.sourceIndex));
  const describedIndexes = new Set(descriptions.descriptions.map((description) => description.sourceIdentity.sourceIndex));
  const recordsByCategory = new Map(DESCRIPTION_PRIORITY_CATEGORIES.map((category) => [category, []]));

  for (const [sourceIndex, feature] of source.features.entries()) {
    const relation = relationByIndex.get(sourceIndex) ?? { relationGroupMemberCount: 1, relationRole: "none" };
    const signals = Object.freeze({
      relationGroupMemberCount: relation.relationGroupMemberCount,
      relationRole: relation.relationRole,
      mapAggregateMemberCount: aggregateByIndex.get(sourceIndex) ?? 1,
      supplemental: SUPPLEMENTAL_NAMES.has(feature.properties.name),
      alreadyDescribed: describedIndexes.has(sourceIndex),
      alreadyCurated: curatedIndexes.has(sourceIndex),
      geographicCell: geographicCell(feature),
    });
    const score = scoreDescriptionPriorityRecord({ category: feature.properties.category, signals });
    const record = Object.freeze({
      sourceIdentity: Object.freeze({
        datasetId: EDO_SOURCE_DATASET_ID,
        sourceIndex,
        entryId: feature.properties.id,
        sourceFeatureSha256: calculateEdoSourceFeatureSha256(feature),
      }),
      sourceName: feature.properties.name,
      category: feature.properties.category,
      suggestedTier: score.suggestedTier,
      score: score.score,
      signals,
      reasonCodes: score.reasonCodes,
      contributions: score.contributions,
    });
    if (!signals.alreadyDescribed) recordsByCategory.get(record.category).push(record);
  }

  const candidates = DESCRIPTION_PRIORITY_CATEGORIES.flatMap((category) => selectDiverseCategoryCandidates(recordsByCategory.get(category)));
  assert(candidates.length === DESCRIPTION_PRIORITY_CANDIDATE_COUNT, "candidate selection count changed");
  const catalog = Object.freeze({
    schemaVersion: DESCRIPTION_PRIORITY_SCHEMA_VERSION,
    catalogStatus: "private-workflow-triage",
    purpose: "human-investigation-order-only",
    sourceDatasetId: EDO_SOURCE_DATASET_ID,
    sourceDataPath: EDO_SOURCE_DATA_PATH,
    sourceDataSha256: EDO_SOURCE_SHA256,
    sourceFeatureCount: EDO_SOURCE_FEATURE_COUNT,
    generatorVersion: DESCRIPTION_PRIORITY_GENERATOR_VERSION,
    selectionContract: Object.freeze({
      candidateCount: DESCRIPTION_PRIORITY_CANDIDATE_COUNT,
      perCategory: DESCRIPTION_PRIORITY_PER_CATEGORY,
      categories: DESCRIPTION_PRIORITY_CATEGORIES,
      geographicCellDegrees: CELL_DEGREES,
      tieBreak: "score-desc-then-sourceIndex-asc",
    }),
    candidates: Object.freeze(candidates),
  });
  return validateDescriptionPriorityCatalog(catalog, source);
}

export function loadDescriptionPriorityInputs(root = resolve(fileURLToPath(new URL("../..", import.meta.url)))) {
  return Object.fromEntries(Object.entries(DESCRIPTION_PRIORITY_INPUT_PATHS).map(([key, path]) => [key, JSON.parse(readFileSync(resolve(root, path), "utf8"))]));
}

function runCli() {
  const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const catalog = generateDescriptionPriorityCatalog(loadDescriptionPriorityInputs(root));
  writeFileSync(resolve(root, DESCRIPTION_PRIORITY_CATALOG_PATH), `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  const tierDistribution = Object.fromEntries(DESCRIPTION_PRIORITY_TIERS.map((tier) => [tier, catalog.candidates.filter((candidate) => candidate.suggestedTier === tier).length]));
  console.log(`DESCRIPTION_PRIORITY_GENERATE_OK ${JSON.stringify({ candidateCount: catalog.candidates.length, tierDistribution })}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
