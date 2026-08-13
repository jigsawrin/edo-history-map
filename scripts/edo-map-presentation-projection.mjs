import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = join(ROOT, "public/data/edo-places.geojson");
const RELATION_PATH = join(ROOT, "data-curation/edo-place-source-identity-relations.json");
const OUTPUT_PATH = join(ROOT, "src/edo-map-presentation-projection.json");
const EXCLUDED_EXACT_NAMES = new Set(["（辻番）", "（木戸）", "（坂道）"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function groupId(members) {
  const identity = [...members]
    .sort((a, b) => a.sourceIndex - b.sourceIndex || a.entryId.localeCompare(b.entryId))
    .map((member) => `${member.sourceIndex}:${member.entryId}`)
    .join("|");
  return `edo-map-aggregate-${sha256(identity)}`;
}

export function buildEdoMapPresentationProjection(sourceText, relationText) {
  const source = JSON.parse(sourceText);
  const relations = JSON.parse(relationText);
  const features = source.features;
  const groups = [];

  for (const relation of relations.groups) {
    if (!Array.isArray(relation.members) || relation.members.length < 2) continue;
    const targets = relation.members.map((member) => member.target);
    const first = targets[0];
    const exactDuplicate = targets.every((target) =>
      target.name === first.name &&
      target.category === first.category &&
      target.longitude === first.longitude &&
      target.latitude === first.latitude
    );
    if (!exactDuplicate || EXCLUDED_EXACT_NAMES.has(first.name)) continue;

    const members = targets
      .map((target) => ({
        sourceIndex: target.sourceIndex,
        entryId: target.entryId,
      }))
      .sort((a, b) => a.sourceIndex - b.sourceIndex || a.entryId.localeCompare(b.entryId));
    groups.push({
      groupId: groupId(members),
      memberSourceIndexes: members.map((member) => member.sourceIndex),
    });
  }
  groups.sort((a, b) => a.memberSourceIndexes[0] - b.memberSourceIndexes[0] || a.groupId.localeCompare(b.groupId));

  const aggregateMemberCount = groups.reduce((sum, group) => sum + group.memberSourceIndexes.length, 0);
  const markerReductionCount = aggregateMemberCount - groups.length;
  return {
    schemaVersion: 1,
    sourceDataSha256: sha256(sourceText),
    sourceFeatureCount: features.length,
    relationDataSha256: sha256(relationText),
    excludedExactNames: [...EXCLUDED_EXACT_NAMES],
    aggregateGroupCount: groups.length,
    aggregateMemberCount,
    markerReductionCount,
    presentationMarkerCount: features.length - markerReductionCount,
    groups,
  };
}

export function auditEdoMapPresentationProjection(projection) {
  const sourceText = readFileSync(SOURCE_PATH, "utf8");
  const relationText = readFileSync(RELATION_PATH, "utf8");
  const expected = buildEdoMapPresentationProjection(sourceText, relationText);
  if (JSON.stringify(projection) !== JSON.stringify(expected)) {
    throw new Error("Edo map presentation projection is stale or non-deterministic");
  }
  return expected;
}

const sourceText = readFileSync(SOURCE_PATH, "utf8");
const relationText = readFileSync(RELATION_PATH, "utf8");
const projection = buildEdoMapPresentationProjection(sourceText, relationText);
if (process.argv.includes("--build")) {
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(projection, null, 2)}\n`, "utf8");
}
auditEdoMapPresentationProjection(
  process.argv.includes("--build") ? projection : JSON.parse(readFileSync(OUTPUT_PATH, "utf8")),
);
console.log(`EDO_MAP_PRESENTATION_AUDIT_OK ${JSON.stringify({
  groups: projection.aggregateGroupCount,
  members: projection.aggregateMemberCount,
  markerReduction: projection.markerReductionCount,
  presentationMarkers: projection.presentationMarkerCount,
})}`);
