import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  calculateEdoSourceFeatureSha256,
  EDO_SOURCE_DATA_PATH,
  EDO_SOURCE_DATASET_ID,
  EDO_SOURCE_FEATURE_COUNT,
  EDO_SOURCE_SHA256,
} from "./edo-place-curation-candidates.mjs";

export const EDO_SOURCE_IDENTITY_CATALOG_PATH =
  "data-curation/edo-place-source-identity-relations.json";
export const EDO_SOURCE_IDENTITY_CATALOG_SHA256 =
  "dcbf603181e36325139b3f951f436c16ec6a4747ae2b9c4742841dba4ab38558";
export const EDO_SOURCE_IDENTITY_CATALOG_BYTE_LENGTH = 1239092;
export const EDO_SOURCE_CSV_OFFICIAL_URL =
  "https://codh.rois.ac.jp/edo-maps/dataset/owariya.csv";
export const EDO_SOURCE_CSV_SHA256 =
  "b83960ac1e4f1061c84a23580ed41282be230ff2f3f4f0335308434ac6620161";
export const EDO_SOURCE_CSV_BYTE_LENGTH = 1554363;
export const EDO_SOURCE_CSV_HEADER = Object.freeze([
  "entry_id",
  "body",
  "prefix",
  "suffix",
  "ne_class",
  "latitude",
  "longitude",
  "description",
  "variant",
  "source",
  "preferred_id",
  "preferred_entry_id",
]);
export const EDO_SOURCE_IDENTITY_EXPECTED = Object.freeze({
  groups: 825,
  members: 1693,
  preferred: 825,
  nonpreferred: 868,
  sizeDistribution: Object.freeze({ 2: 784, 3: 39, 4: 2 }),
  nameDifferentGroups: 205,
  categoryDifferentGroups: 12,
  sameSheetMemberGroups: 2,
  anomalies: 2,
});
export const EDO_SOURCE_IDENTITY_ANOMALIES = Object.freeze({
  "20-358": "hqugGh",
  "20-369": "ONCq65",
});
export const EDO_SOURCE_IDENTITY_ANOMALY_IDS = Object.freeze(
  Object.keys(EDO_SOURCE_IDENTITY_ANOMALIES),
);

const TOP_KEYS = [
  "schemaVersion",
  "catalogStatus",
  "sourceDatasetId",
  "sourceDataPath",
  "sourceDataSha256",
  "sourceFeatureCount",
  "sourceCsv",
  "groups",
  "sourceAnomalies",
];
const SOURCE_CSV_KEYS = [
  "officialUrl",
  "sha256",
  "byteLength",
  "relationColumns",
];
const GROUP_KEYS = [
  "groupId",
  "codhPreferredId",
  "preferredEntryId",
  "members",
];
const MEMBER_KEYS = [
  "role",
  "declaredPreferredId",
  "declaredPreferredEntryId",
  "target",
];
const TARGET_KEYS = [
  "sourceIndex",
  "entryId",
  "sourceFeatureSha256",
  "name",
  "category",
  "sheet",
  "sourceUrl",
  "longitude",
  "latitude",
];
const ANOMALY_KEYS = [
  "type",
  "disposition",
  "declaredPreferredId",
  "declaredPreferredEntryId",
  "target",
];
const LEAKAGE_MARKERS = [
  "edo-place-source-identity-relations.json",
  "codhPreferredId",
  "declaredPreferredEntryId",
  "preserved-not-grouped",
];
const ID_PATTERN = /^\d+-\d{3}$/u;
const CODH_PREFERRED_ID_PATTERN = /^[A-Za-z0-9]{6}$/u;
// eslint-disable-next-line no-control-regex
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f<>]/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function exactKeys(value, expected, label) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  assert(
    actual.length === sortedExpected.length &&
      actual.every((key, index) => key === sortedExpected[index]),
    `${label} has unknown or missing keys`,
  );
}

function safeText(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label} must be non-empty text`);
  assert(value === value.trim(), `${label} must be trimmed`);
  assert(!UNSAFE_TEXT.test(value), `${label} contains unsafe text`);
}

function validateSourceUrl(value, label) {
  safeText(value, label);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a URL`);
  }
  assert(
    url.protocol === "https:" &&
      url.hostname === "codh.rois.ac.jp" &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/edo-maps/owariya/"),
    `${label} must be a credential-free CODH HTTPS URL`,
  );
}

export function parseEdoSourceIdentityCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const input = String(text).replace(/^\uFEFF/u, "");
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  assert(!quoted, "CSV has an unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  assert(rows.length > 0, "CSV is empty");
  const header = rows[0];
  assert(
    header.length === EDO_SOURCE_CSV_HEADER.length &&
      header.every((name, index) => name === EDO_SOURCE_CSV_HEADER[index]),
    "CSV header does not exactly match the protected 12-column schema",
  );
  return rows.slice(1).map((values, rowIndex) => {
    assert(values.length === header.length, `CSV row ${rowIndex + 2} has the wrong column count`);
    return Object.fromEntries(header.map((name, index) => [name, values[index]]));
  });
}

function targetSnapshot(feature, sourceIndex) {
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

function sourceMap(sourceGeoJson) {
  assert(
    sourceGeoJson?.type === "FeatureCollection" &&
      Array.isArray(sourceGeoJson.features),
    "source GeoJSON must be a FeatureCollection",
  );
  const map = new Map();
  sourceGeoJson.features.forEach((feature, sourceIndex) => {
    const id = feature?.properties?.id;
    assert(typeof id === "string" && !map.has(id), `source GeoJSON entry ID is invalid or duplicated: ${id}`);
    map.set(id, { feature, sourceIndex });
  });
  return map;
}

function validateCsvRows(rows, sourceGeoJson) {
  const byId = new Map();
  for (const row of rows) {
    assert(ID_PATTERN.test(row.entry_id), `invalid CSV entry ID: ${row.entry_id}`);
    assert(!byId.has(row.entry_id), `duplicate CSV entry ID: ${row.entry_id}`);
    byId.set(row.entry_id, row);
  }
  const sourceById = sourceMap(sourceGeoJson);
  assert(byId.size === sourceById.size, "CSV and source GeoJSON entry counts differ");
  for (const [id, row] of byId) {
    const source = sourceById.get(id);
    assert(source, `CSV entry is missing from source GeoJSON: ${id}`);
    const { feature } = source;
    assert(feature.properties.name === row.body, `CSV/source name mismatch: ${id}`);
    assert(feature.properties.category === row.ne_class, `CSV/source category mismatch: ${id}`);
    assert(feature.properties.sheet === row.description, `CSV/source sheet mismatch: ${id}`);
    assert(feature.properties.source === row.source, `CSV/source URL mismatch: ${id}`);
    assert(
      feature.geometry.coordinates[0] === Number(Number(row.longitude).toFixed(6)) &&
        feature.geometry.coordinates[1] === Number(Number(row.latitude).toFixed(6)),
      `CSV/source coordinate mismatch: ${id}`,
    );
  }
  for (const id of sourceById.keys()) {
    assert(byId.has(id), `source GeoJSON entry is missing from CSV: ${id}`);
  }
  return { byId, sourceById };
}

function relationGraph(rows, byId) {
  const anomalies = [];
  const nonpreferredRows = [];
  for (const row of rows) {
    const hasPreferredId = row.preferred_id !== "";
    const hasPreferredEntryId = row.preferred_entry_id !== "";
    assert(hasPreferredId === hasPreferredEntryId, `partial preferred relation: ${row.entry_id}`);
    if (!hasPreferredEntryId) continue;
    assert(CODH_PREFERRED_ID_PATTERN.test(row.preferred_id), `invalid preferred_id: ${row.entry_id}`);
    assert(ID_PATTERN.test(row.preferred_entry_id), `invalid preferred_entry_id: ${row.entry_id}`);
    assert(byId.has(row.preferred_entry_id), `dangling preferred entry: ${row.entry_id}`);
    if (row.entry_id === row.preferred_entry_id) {
      anomalies.push(row);
    } else {
      nonpreferredRows.push(row);
    }
  }
  for (const row of nonpreferredRows) {
    const preferred = byId.get(row.preferred_entry_id);
    assert(preferred.preferred_entry_id === "", `preferred chain or cycle: ${row.entry_id}`);
  }
  return { anomalies, nonpreferredRows };
}

export function generateEdoPlaceSourceIdentityCatalog(
  csvBytes,
  sourceGeoJson,
  options = {},
) {
  const bytes = Buffer.isBuffer(csvBytes) ? csvBytes : Buffer.from(csvBytes);
  const constraints = {
    csvSha256: options.csvSha256 ?? EDO_SOURCE_CSV_SHA256,
    csvByteLength: options.csvByteLength ?? EDO_SOURCE_CSV_BYTE_LENGTH,
    featureCount: options.featureCount ?? EDO_SOURCE_FEATURE_COUNT,
    sourceDataSha256: options.sourceDataSha256 ?? EDO_SOURCE_SHA256,
    expected: options.expected ?? EDO_SOURCE_IDENTITY_EXPECTED,
    anomalyIds: options.anomalyIds ?? EDO_SOURCE_IDENTITY_ANOMALY_IDS,
  };
  assert(bytes.length === constraints.csvByteLength, "CSV byte length does not match the protected value");
  assert(
    createHash("sha256").update(bytes).digest("hex") === constraints.csvSha256,
    "CSV SHA-256 does not match the protected value",
  );
  const rows = parseEdoSourceIdentityCsv(bytes.toString("utf8"));
  assert(rows.length === constraints.featureCount, "CSV row count does not match the protected value");
  const { byId, sourceById } = validateCsvRows(rows, sourceGeoJson);
  const { anomalies, nonpreferredRows } = relationGraph(rows, byId);
  const anomalyIds = anomalies.map((row) => row.entry_id).sort();
  assert(
    anomalyIds.length === constraints.anomalyIds.length &&
      anomalyIds.every((id, index) => id === [...constraints.anomalyIds].sort()[index]),
    "self-preference anomalies do not match the protected set",
  );
  const grouped = new Map();
  for (const row of nonpreferredRows) {
    const item = grouped.get(row.preferred_entry_id) ?? {
      codhPreferredId: row.preferred_id,
      rows: [],
    };
    assert(item.codhPreferredId === row.preferred_id, `preferred_id mismatch for ${row.preferred_entry_id}`);
    item.rows.push(row);
    grouped.set(row.preferred_entry_id, item);
  }
  const groups = [...grouped.entries()]
    .map(([preferredEntryId, item]) => {
      const preferredSource = sourceById.get(preferredEntryId);
      assert(preferredSource, `preferred source entry not found: ${preferredEntryId}`);
      const members = [
        {
          role: "preferred",
          declaredPreferredId: null,
          declaredPreferredEntryId: null,
          target: targetSnapshot(preferredSource.feature, preferredSource.sourceIndex),
        },
        ...item.rows
          .map((row) => {
            const source = sourceById.get(row.entry_id);
            return {
              role: "nonpreferred",
              declaredPreferredId: row.preferred_id,
              declaredPreferredEntryId: row.preferred_entry_id,
              target: targetSnapshot(source.feature, source.sourceIndex),
            };
          })
          .sort((a, b) => a.target.sourceIndex - b.target.sourceIndex),
      ];
      return {
        groupId: `codh-preferred-entry-${preferredEntryId}`,
        codhPreferredId: item.codhPreferredId,
        preferredEntryId,
        members,
      };
    })
    .sort(
      (a, b) =>
        a.members[0].target.sourceIndex - b.members[0].target.sourceIndex,
    );
  const sourceAnomalies = anomalies
    .map((row) => {
      const source = sourceById.get(row.entry_id);
      return {
        type: "self-preference",
        disposition: "preserved-not-grouped",
        declaredPreferredId: row.preferred_id,
        declaredPreferredEntryId: row.preferred_entry_id,
        target: targetSnapshot(source.feature, source.sourceIndex),
      };
    })
    .sort((a, b) => a.target.sourceIndex - b.target.sourceIndex);
  const catalog = {
    schemaVersion: 1,
    catalogStatus: "verified-source-derived",
    sourceDatasetId: EDO_SOURCE_DATASET_ID,
    sourceDataPath: EDO_SOURCE_DATA_PATH,
    sourceDataSha256: constraints.sourceDataSha256,
    sourceFeatureCount: constraints.featureCount,
    sourceCsv: {
      officialUrl: EDO_SOURCE_CSV_OFFICIAL_URL,
      sha256: constraints.csvSha256,
      byteLength: constraints.csvByteLength,
      relationColumns: ["preferred_id", "preferred_entry_id"],
    },
    groups,
    sourceAnomalies,
  };
  validateEdoPlaceSourceIdentityCatalog(catalog, sourceGeoJson, {
    expected: constraints.expected,
    anomalyIds: constraints.anomalyIds,
    featureCount: constraints.featureCount,
    sourceDataSha256: constraints.sourceDataSha256,
    csvSha256: constraints.csvSha256,
    csvByteLength: constraints.csvByteLength,
  });
  return catalog;
}

function validateTarget(target, sourceGeoJson, label) {
  exactKeys(target, TARGET_KEYS, label);
  assert(Number.isInteger(target.sourceIndex), `${label}.sourceIndex must be an integer`);
  const feature = sourceGeoJson.features[target.sourceIndex];
  assert(feature, `${label}.sourceIndex is out of range`);
  const expected = targetSnapshot(feature, target.sourceIndex);
  for (const key of TARGET_KEYS) {
    assert(target[key] === expected[key], `${label}.${key} does not match source GeoJSON`);
  }
  safeText(target.entryId, `${label}.entryId`);
  safeText(target.name, `${label}.name`);
  safeText(target.category, `${label}.category`);
  safeText(target.sheet, `${label}.sheet`);
  validateSourceUrl(target.sourceUrl, `${label}.sourceUrl`);
}

export function summarizeEdoPlaceSourceIdentityRelations(catalog) {
  const sizeDistribution = {};
  let members = 0;
  let preferred = 0;
  let nonpreferred = 0;
  let nameDifferentGroups = 0;
  let categoryDifferentGroups = 0;
  let sameSheetMemberGroups = 0;
  for (const group of catalog.groups) {
    members += group.members.length;
    sizeDistribution[group.members.length] =
      (sizeDistribution[group.members.length] ?? 0) + 1;
    preferred += group.members.filter((member) => member.role === "preferred").length;
    nonpreferred += group.members.filter((member) => member.role === "nonpreferred").length;
    if (new Set(group.members.map((member) => member.target.name)).size > 1) {
      nameDifferentGroups++;
    }
    if (new Set(group.members.map((member) => member.target.category)).size > 1) {
      categoryDifferentGroups++;
    }
    if (new Set(group.members.map((member) => member.target.sheet)).size < group.members.length) {
      sameSheetMemberGroups++;
    }
  }
  return {
    groups: catalog.groups.length,
    members,
    preferred,
    nonpreferred,
    sizeDistribution,
    nameDifferentGroups,
    categoryDifferentGroups,
    sameSheetMemberGroups,
    anomalies: catalog.sourceAnomalies.length,
  };
}

export function validateEdoPlaceSourceIdentityCatalog(
  catalog,
  sourceGeoJson,
  options = {},
) {
  const expected = options.expected ?? EDO_SOURCE_IDENTITY_EXPECTED;
  const anomalyIds = options.anomalyIds ?? EDO_SOURCE_IDENTITY_ANOMALY_IDS;
  const anomalyPreferredIds = options.anomalyPreferredIds ??
    (options.anomalyIds ? null : EDO_SOURCE_IDENTITY_ANOMALIES);
  const featureCount = options.featureCount ?? EDO_SOURCE_FEATURE_COUNT;
  const sourceDataSha256 = options.sourceDataSha256 ?? EDO_SOURCE_SHA256;
  const csvSha256 = options.csvSha256 ?? EDO_SOURCE_CSV_SHA256;
  const csvByteLength = options.csvByteLength ?? EDO_SOURCE_CSV_BYTE_LENGTH;
  exactKeys(catalog, TOP_KEYS, "catalog");
  assert(catalog.schemaVersion === 1, "catalog.schemaVersion must be 1");
  assert(catalog.catalogStatus === "verified-source-derived", "catalogStatus is invalid");
  assert(catalog.sourceDatasetId === EDO_SOURCE_DATASET_ID, "sourceDatasetId is invalid");
  assert(catalog.sourceDataPath === EDO_SOURCE_DATA_PATH, "sourceDataPath is invalid");
  assert(catalog.sourceDataSha256 === sourceDataSha256, "sourceDataSha256 is invalid");
  assert(catalog.sourceFeatureCount === featureCount, "sourceFeatureCount is invalid");
  assert(sourceGeoJson.features.length === featureCount, "source GeoJSON feature count is invalid");
  exactKeys(catalog.sourceCsv, SOURCE_CSV_KEYS, "catalog.sourceCsv");
  assert(catalog.sourceCsv.officialUrl === EDO_SOURCE_CSV_OFFICIAL_URL, "officialUrl is invalid");
  assert(catalog.sourceCsv.sha256 === csvSha256, "source CSV SHA is invalid");
  assert(catalog.sourceCsv.byteLength === csvByteLength, "source CSV byte length is invalid");
  assert(
    JSON.stringify(catalog.sourceCsv.relationColumns) ===
      JSON.stringify(["preferred_id", "preferred_entry_id"]),
    "relationColumns are invalid",
  );
  assert(Array.isArray(catalog.groups), "groups must be an array");
  const groupIds = new Set();
  const preferredEntryIds = new Set();
  const preferredOpaqueIds = new Set();
  const memberEntryIds = new Set();
  const memberSourceIndices = new Set();
  let previousPreferredSourceIndex = -1;
  for (const [groupIndex, group] of catalog.groups.entries()) {
    const label = `groups[${groupIndex}]`;
    exactKeys(group, GROUP_KEYS, label);
    safeText(group.groupId, `${label}.groupId`);
    assert(group.groupId === `codh-preferred-entry-${group.preferredEntryId}`, `${label}.groupId mismatch`);
    assert(!groupIds.has(group.groupId), "duplicate groupId");
    groupIds.add(group.groupId);
    assert(ID_PATTERN.test(group.preferredEntryId), `${label}.preferredEntryId is invalid`);
    assert(!preferredEntryIds.has(group.preferredEntryId), "duplicate preferredEntryId");
    preferredEntryIds.add(group.preferredEntryId);
    assert(CODH_PREFERRED_ID_PATTERN.test(group.codhPreferredId), `${label}.codhPreferredId is invalid`);
    assert(!preferredOpaqueIds.has(group.codhPreferredId), "duplicate codhPreferredId");
    preferredOpaqueIds.add(group.codhPreferredId);
    assert(Array.isArray(group.members) && group.members.length >= 2, `${label} must have at least two members`);
    assert(group.members[0]?.role === "preferred", `${label} preferred member must be first`);
    assert(group.members.filter((member) => member.role === "preferred").length === 1, `${label} must have exactly one preferred member`);
    assert(group.members.some((member) => member.role === "nonpreferred"), `${label} must have nonpreferred members`);
    const coordinates = new Set();
    let previousNonpreferredSourceIndex = -1;
    for (const [memberIndex, member] of group.members.entries()) {
      const memberLabel = `${label}.members[${memberIndex}]`;
      exactKeys(member, MEMBER_KEYS, memberLabel);
      assert(["preferred", "nonpreferred"].includes(member.role), `${memberLabel}.role is invalid`);
      validateTarget(member.target, sourceGeoJson, `${memberLabel}.target`);
      assert(!memberEntryIds.has(member.target.entryId), `duplicate member entry ID: ${member.target.entryId}`);
      assert(!memberSourceIndices.has(member.target.sourceIndex), `duplicate member sourceIndex: ${member.target.sourceIndex}`);
      memberEntryIds.add(member.target.entryId);
      memberSourceIndices.add(member.target.sourceIndex);
      coordinates.add(`${member.target.longitude},${member.target.latitude}`);
      if (member.role === "preferred") {
        assert(memberIndex === 0 && member.target.entryId === group.preferredEntryId, `${memberLabel} preferred target mismatch`);
        assert(member.declaredPreferredId === null && member.declaredPreferredEntryId === null, `${memberLabel} preferred declarations must be null`);
        assert(member.target.sourceIndex > previousPreferredSourceIndex, "groups must be ordered by preferred sourceIndex");
        previousPreferredSourceIndex = member.target.sourceIndex;
      } else {
        assert(member.declaredPreferredId === group.codhPreferredId, `${memberLabel}.declaredPreferredId mismatch`);
        assert(member.declaredPreferredEntryId === group.preferredEntryId, `${memberLabel}.declaredPreferredEntryId mismatch`);
        assert(member.target.sourceIndex > previousNonpreferredSourceIndex, `${label} nonpreferred members must be sourceIndex ordered`);
        previousNonpreferredSourceIndex = member.target.sourceIndex;
      }
    }
    assert(coordinates.size === 1, `${label} coordinates differ`);
  }
  assert(Array.isArray(catalog.sourceAnomalies), "sourceAnomalies must be an array");
  const actualAnomalyIds = [];
  for (const [index, anomaly] of catalog.sourceAnomalies.entries()) {
    const label = `sourceAnomalies[${index}]`;
    exactKeys(anomaly, ANOMALY_KEYS, label);
    assert(anomaly.type === "self-preference", `${label}.type is invalid`);
    assert(anomaly.disposition === "preserved-not-grouped", `${label}.disposition is invalid`);
    assert(CODH_PREFERRED_ID_PATTERN.test(anomaly.declaredPreferredId), `${label}.declaredPreferredId is invalid`);
    assert(anomaly.declaredPreferredEntryId === anomaly.target.entryId, `${label} is not a self-preference`);
    if (anomalyPreferredIds) {
      assert(
        anomaly.declaredPreferredId === anomalyPreferredIds[anomaly.target.entryId],
        `${label}.declaredPreferredId does not match the protected value`,
      );
    }
    validateTarget(anomaly.target, sourceGeoJson, `${label}.target`);
    assert(!memberEntryIds.has(anomaly.target.entryId), `${label} is also a group member`);
    actualAnomalyIds.push(anomaly.target.entryId);
  }
  actualAnomalyIds.sort();
  const sortedExpectedAnomalies = [...anomalyIds].sort();
  assert(
    actualAnomalyIds.length === sortedExpectedAnomalies.length &&
      actualAnomalyIds.every((id, index) => id === sortedExpectedAnomalies[index]),
    "source anomalies do not match the protected set",
  );
  const prohibitedPair = ["12-182", "24-133"];
  assert(
    !catalog.groups.some((group) =>
      prohibitedPair.every((id) =>
        group.members.some((member) => member.target.entryId === id),
      ),
    ),
    "12-182 and 24-133 must not be grouped",
  );
  const summary = summarizeEdoPlaceSourceIdentityRelations(catalog);
  for (const key of [
    "groups",
    "members",
    "preferred",
    "nonpreferred",
    "nameDifferentGroups",
    "categoryDifferentGroups",
    "sameSheetMemberGroups",
    "anomalies",
  ]) {
    assert(summary[key] === expected[key], `summary ${key} does not match the protected value`);
  }
  assert(
    JSON.stringify(summary.sizeDistribution) ===
      JSON.stringify(expected.sizeDistribution),
    "group size distribution does not match the protected value",
  );
  return catalog;
}

function walkFiles(root) {
  if (!existsSync(root)) return [];
  const result = [];
  for (const name of readdirSync(root)) {
    const full = join(root, name);
    if (statSync(full).isDirectory()) result.push(...walkFiles(full));
    else result.push(full);
  }
  return result;
}

export function auditEdoPlaceSourceIdentityLeakage(root) {
  const errors = [];
  for (const area of ["public", "dist"]) {
    for (const file of walkFiles(join(root, area))) {
      const rel = relative(root, file).replace(/\\/gu, "/");
      if (!/\.(?:js|html|json)$/u.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (LEAKAGE_MARKERS.some((marker) => text.includes(marker))) {
        errors.push(`${rel}: Edo source identity relation catalog leaked into a Web artifact`);
      }
    }
  }
  for (const file of walkFiles(join(root, "src"))) {
    if (!/\.(?:ts|json)$/u.test(file)) continue;
    const text = readFileSync(file, "utf8");
    if (LEAKAGE_MARKERS.some((marker) => text.includes(marker))) {
      errors.push(`${relative(root, file).replace(/\\/gu, "/")}: runtime imports Edo source identity relation data`);
    }
  }
  return errors;
}

export function auditEdoPlaceSourceIdentityRepository(root = process.cwd()) {
  const errors = [];
  let catalog = null;
  try {
    const sourceBytes = readFileSync(resolve(root, EDO_SOURCE_DATA_PATH));
    assert(
      createHash("sha256").update(sourceBytes).digest("hex") === EDO_SOURCE_SHA256,
      "protected Edo GeoJSON SHA-256 changed",
    );
    const sourceGeoJson = JSON.parse(sourceBytes.toString("utf8"));
    const catalogBytes = readFileSync(
      resolve(root, EDO_SOURCE_IDENTITY_CATALOG_PATH),
    );
    assert(
      catalogBytes.length === EDO_SOURCE_IDENTITY_CATALOG_BYTE_LENGTH,
      "Edo source identity catalog byte length changed",
    );
    assert(
      createHash("sha256").update(catalogBytes).digest("hex") ===
        EDO_SOURCE_IDENTITY_CATALOG_SHA256,
      "Edo source identity catalog SHA-256 changed",
    );
    catalog = JSON.parse(catalogBytes.toString("utf8"));
    validateEdoPlaceSourceIdentityCatalog(catalog, sourceGeoJson);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  errors.push(...auditEdoPlaceSourceIdentityLeakage(root));
  return { catalog, errors };
}

function buildMode(args) {
  const csvPath = args[1];
  assert(csvPath && !csvPath.startsWith("--"), "usage: --build <owariya.csv path> [--output <path>]");
  const outputIndex = args.indexOf("--output");
  const outputPath =
    outputIndex >= 0
      ? args[outputIndex + 1]
      : resolve(process.cwd(), EDO_SOURCE_IDENTITY_CATALOG_PATH);
  assert(outputPath, "--output requires a path");
  const csvBytes = readFileSync(resolve(csvPath));
  const sourceBytes = readFileSync(resolve(process.cwd(), EDO_SOURCE_DATA_PATH));
  assert(
    createHash("sha256").update(sourceBytes).digest("hex") === EDO_SOURCE_SHA256,
    "protected Edo GeoJSON SHA-256 changed",
  );
  const catalog = generateEdoPlaceSourceIdentityCatalog(
    csvBytes,
    JSON.parse(sourceBytes.toString("utf8")),
  );
  const output = `${JSON.stringify(catalog, null, 2)}\n`;
  const outputBytes = Buffer.from(output, "utf8");
  assert(
    outputBytes.length === EDO_SOURCE_IDENTITY_CATALOG_BYTE_LENGTH,
    "generated Edo source identity catalog byte length changed",
  );
  assert(
    createHash("sha256").update(outputBytes).digest("hex") ===
      EDO_SOURCE_IDENTITY_CATALOG_SHA256,
    "generated Edo source identity catalog SHA-256 changed",
  );
  writeFileSync(resolve(outputPath), output, "utf8");
  console.log(`wrote ${catalog.groups.length} source identity groups -> ${resolve(outputPath)}`);
}

function auditMode() {
  const audit = auditEdoPlaceSourceIdentityRepository();
  if (audit.catalog) {
    const summary = summarizeEdoPlaceSourceIdentityRelations(audit.catalog);
    console.log(
      `Edo source identity relations: ${summary.groups} groups, ${summary.members} members, ${summary.nonpreferred} nonpreferred`,
    );
    console.log(
      `differences: name ${summary.nameDifferentGroups}, category ${summary.categoryDifferentGroups}, same-sheet ${summary.sameSheetMemberGroups}`,
    );
    console.log(`source anomalies: ${summary.anomalies}`);
  }
  for (const error of audit.errors) console.error(`ERROR: ${error}`);
  process.exitCode = audit.errors.length === 0 ? 0 : 1;
}

const isCli =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    if (process.argv[2] === "--build") buildMode(process.argv.slice(2));
    else if (process.argv.length === 2) auditMode();
    else throw new Error("unknown arguments");
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
