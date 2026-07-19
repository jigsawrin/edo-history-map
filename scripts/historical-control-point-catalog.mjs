import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

export const HISTORICAL_CONTROL_POINT_CATALOG_SCHEMA_VERSION = 1;
export const HISTORICAL_CONTROL_POINT_CATALOG_STATUSES = Object.freeze([
  "empty-foundation",
  "reviewed",
]);
export const HISTORICAL_CONTROL_POINT_FEATURE_TYPES = Object.freeze([
  "castle-gate",
  "moat-corner",
  "bridge",
  "temple",
  "shrine",
  "stone-wall",
  "river-junction",
  "road-junction",
  "other",
]);
export const HISTORICAL_CONTROL_POINT_EXISTENCE = Object.freeze([
  "extant",
  "archaeological-remains",
  "officially-located-lost-site",
  "uncertain",
]);
export const HISTORICAL_CONTROL_POINT_MOVED_STATUSES = Object.freeze([
  "not-moved",
  "possibly-moved",
  "moved",
  "unknown",
]);
export const HISTORICAL_CONTROL_POINT_COORDINATE_ACCURACY = Object.freeze([
  "surveyed",
  "official-gis",
  "official-published-coordinate",
  "official-map-derived",
  "approximate",
  "unknown",
]);
export const HISTORICAL_CONTROL_POINT_ELIGIBILITY = Object.freeze([
  "eligible-candidate",
  "validation-only-candidate",
  "hold",
  "rejected",
]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f<>]/u;
const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "reviewedAt",
  "catalogStatus",
  "entries",
]);
const ENTRY_KEYS = Object.freeze([
  "id",
  "name",
  "description",
  "featureType",
  "currentExistence",
  "movedStatus",
  "latitude",
  "longitude",
  "coordinateAccuracy",
  "eligibility",
  "applicableRegionIds",
  "applicableEraIds",
  "sourceIds",
  "evidenceUrls",
  "identityBasis",
  "coordinateBasis",
  "rejectionReason",
]);
const CATALOG_RELATIVE_PATH = "data-curation/historical-control-point-catalog.json";

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertObject(value, label, allowedKeys) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label}がobjectではありません`);
  for (const key of Object.keys(value)) {
    assert(allowedKeys.includes(key), `${label}.${key}は未定義項目です`);
  }
  return value;
}

function assertId(value, label) {
  assert(typeof value === "string" && ID_PATTERN.test(value), `${label}が不正です`);
  return value;
}

/**
 * LocalizedText validation aligned with src/historical-raster-localization.ts.
 * Kept local so data-curation audit scripts stay independent of runtime imports.
 */
export function validateCatalogLocalizedText(value, label) {
  assertObject(value, label, ["ja", "en"]);
  assert(
    typeof value.ja === "string" &&
      value.ja.trim() === value.ja &&
      value.ja.length > 0 &&
      !FORBIDDEN_TEXT.test(value.ja),
    `${label}.jaが不正です`,
  );
  if (value.en !== undefined) {
    assert(
      typeof value.en === "string" &&
        value.en.trim() === value.en &&
        value.en.length > 0 &&
        !FORBIDDEN_TEXT.test(value.en),
      `${label}.enが不正です`,
    );
  }
  return Object.freeze({
    ja: value.ja,
    ...(value.en === undefined ? {} : { en: value.en }),
  });
}

function assertHttpsUrl(value, label) {
  assert(typeof value === "string", `${label}はHTTPS URLである必要があります`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label}はHTTPS URLである必要があります`);
  }
  assert(
    parsed.protocol === "https:" && !parsed.username && !parsed.password,
    `${label}は認証情報なしのHTTPS URLである必要があります`,
  );
  return value;
}

function assertUniqueIdArray(values, label) {
  assert(Array.isArray(values), `${label}は配列である必要があります`);
  const ids = values.map((value, index) => assertId(value, `${label}[${index}]`));
  assert(new Set(ids).size === ids.length, `${label}に重複があります`);
  return Object.freeze([...ids]);
}

function assertUniqueHttpsArray(values, label) {
  assert(Array.isArray(values), `${label}は配列である必要があります`);
  const urls = values.map((value, index) => assertHttpsUrl(value, `${label}[${index}]`));
  assert(new Set(urls).size === urls.length, `${label}に重複があります`);
  return Object.freeze([...urls]);
}

function assertEligibilityGates(entry, label) {
  const { eligibility, currentExistence, movedStatus, coordinateAccuracy, sourceIds, evidenceUrls } = entry;

  if (eligibility === "eligible-candidate") {
    assert(currentExistence !== "uncertain", `${label}: uncertainはeligible-candidateにできません`);
    assert(movedStatus !== "moved", `${label}: movedはeligible-candidateにできません`);
    assert(movedStatus !== "possibly-moved", `${label}: possibly-movedはeligible-candidateにできません`);
    assert(coordinateAccuracy !== "approximate", `${label}: approximate座標はeligible-candidateにできません`);
    assert(coordinateAccuracy !== "unknown", `${label}: unknown座標はeligible-candidateにできません`);
    assert(sourceIds.length > 0, `${label}: eligible-candidateにはsourceIdsが必要です`);
    assert(evidenceUrls.length > 0, `${label}: eligible-candidateにはevidenceUrlsが必要です`);
  }

  if (eligibility === "validation-only-candidate") {
    assert(currentExistence !== "uncertain", `${label}: uncertainはvalidation-only-candidateにできません`);
    assert(movedStatus !== "moved", `${label}: movedはvalidation-only-candidateにできません`);
    assert(coordinateAccuracy !== "unknown", `${label}: unknown座標はvalidation-only-candidateにできません`);
    assert(sourceIds.length > 0, `${label}: validation-only-candidateにはsourceIdsが必要です`);
    assert(evidenceUrls.length > 0, `${label}: validation-only-candidateにはevidenceUrlsが必要です`);
  }
}

function validateEntry(raw, index) {
  const label = `entries[${index}]`;
  const value = assertObject(raw, label, ENTRY_KEYS);
  for (const key of ENTRY_KEYS) {
    if (key === "rejectionReason") continue;
    assert(Object.hasOwn(value, key), `${label}.${key}がありません`);
  }

  const id = assertId(value.id, `${label}.id`);
  const name = validateCatalogLocalizedText(value.name, `${label}.name`);
  const description = validateCatalogLocalizedText(value.description, `${label}.description`);
  const featureType = value.featureType;
  assert(HISTORICAL_CONTROL_POINT_FEATURE_TYPES.includes(featureType), `${label}.featureTypeが不正です`);
  const currentExistence = value.currentExistence;
  assert(HISTORICAL_CONTROL_POINT_EXISTENCE.includes(currentExistence), `${label}.currentExistenceが不正です`);
  const movedStatus = value.movedStatus;
  assert(HISTORICAL_CONTROL_POINT_MOVED_STATUSES.includes(movedStatus), `${label}.movedStatusが不正です`);
  assert(Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90, `${label}.latitudeが範囲外です`);
  assert(Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180, `${label}.longitudeが範囲外です`);
  const coordinateAccuracy = value.coordinateAccuracy;
  assert(
    HISTORICAL_CONTROL_POINT_COORDINATE_ACCURACY.includes(coordinateAccuracy),
    `${label}.coordinateAccuracyが不正です`,
  );
  const eligibility = value.eligibility;
  assert(HISTORICAL_CONTROL_POINT_ELIGIBILITY.includes(eligibility), `${label}.eligibilityが不正です`);
  const applicableRegionIds = assertUniqueIdArray(value.applicableRegionIds, `${label}.applicableRegionIds`);
  const applicableEraIds = assertUniqueIdArray(value.applicableEraIds, `${label}.applicableEraIds`);
  const sourceIds = assertUniqueIdArray(value.sourceIds, `${label}.sourceIds`);
  const evidenceUrls = assertUniqueHttpsArray(value.evidenceUrls, `${label}.evidenceUrls`);
  assert(sourceIds.length > 0, `${label}.sourceIdsがありません`);
  assert(evidenceUrls.length > 0, `${label}.evidenceUrlsがありません`);
  const identityBasis = validateCatalogLocalizedText(value.identityBasis, `${label}.identityBasis`);
  const coordinateBasis = validateCatalogLocalizedText(value.coordinateBasis, `${label}.coordinateBasis`);

  let rejectionReason;
  if (value.rejectionReason !== undefined) {
    rejectionReason = validateCatalogLocalizedText(value.rejectionReason, `${label}.rejectionReason`);
  }
  if (eligibility === "rejected") {
    assert(rejectionReason !== undefined, `${label}: rejectedにはrejectionReasonが必要です`);
  }

  const entry = {
    id,
    name,
    description,
    featureType,
    currentExistence,
    movedStatus,
    latitude: value.latitude,
    longitude: value.longitude,
    coordinateAccuracy,
    eligibility,
    applicableRegionIds,
    applicableEraIds,
    sourceIds,
    evidenceUrls,
    identityBasis,
    coordinateBasis,
    ...(rejectionReason === undefined ? {} : { rejectionReason }),
  };
  assertEligibilityGates(entry, label);

  // Catalog eligibility never promotes an entry into transform/validation control points.
  assert(
    !Object.hasOwn(value, "role") && !Object.hasOwn(value, "pixelX") && !Object.hasOwn(value, "pixelY"),
    `${label}: 古地図pixel基準点フィールドはカタログに含められません`,
  );

  return Object.freeze(entry);
}

export function validateHistoricalControlPointCatalog(value) {
  const catalog = assertObject(value, "歴史基準点カタログ", ROOT_KEYS);
  assert(
    catalog.schemaVersion === HISTORICAL_CONTROL_POINT_CATALOG_SCHEMA_VERSION,
    "歴史基準点カタログschemaVersionは1である必要があります",
  );
  assert(
    HISTORICAL_CONTROL_POINT_CATALOG_STATUSES.includes(catalog.catalogStatus),
    "歴史基準点カタログcatalogStatusが不正です",
  );
  assert(
    catalog.reviewedAt === null ||
      (typeof catalog.reviewedAt === "string" && DATE_PATTERN.test(catalog.reviewedAt)),
    "歴史基準点カタログreviewedAtが不正です",
  );
  assert(Array.isArray(catalog.entries), "歴史基準点カタログentriesは配列である必要があります");

  if (catalog.catalogStatus === "empty-foundation") {
    assert(catalog.entries.length === 0, "empty-foundationではentriesを空にする必要があります");
  }
  if (catalog.catalogStatus === "reviewed") {
    assert(typeof catalog.reviewedAt === "string" && DATE_PATTERN.test(catalog.reviewedAt), "reviewedではreviewedAtが必須です");
  }

  const entries = catalog.entries.map(validateEntry);
  const ids = entries.map((entry) => entry.id);
  assert(new Set(ids).size === ids.length, "歴史基準点カタログのidが重複しています");

  return Object.freeze({
    schemaVersion: HISTORICAL_CONTROL_POINT_CATALOG_SCHEMA_VERSION,
    reviewedAt: catalog.reviewedAt,
    catalogStatus: catalog.catalogStatus,
    entries: Object.freeze(entries),
  });
}

export function loadHistoricalControlPointCatalog(root) {
  const path = join(root, CATALOG_RELATIVE_PATH);
  assert(existsSync(path), `${CATALOG_RELATIVE_PATH}がありません`);
  return validateHistoricalControlPointCatalog(JSON.parse(readFileSync(path, "utf8")));
}

export function summarizeHistoricalControlPointCatalog(catalog) {
  const count = (eligibility) => catalog.entries.filter((entry) => entry.eligibility === eligibility).length;
  return Object.freeze({
    schemaVersion: catalog.schemaVersion,
    catalogStatus: catalog.catalogStatus,
    entryCount: catalog.entries.length,
    eligibleCandidateCount: count("eligible-candidate"),
    validationOnlyCandidateCount: count("validation-only-candidate"),
    holdCount: count("hold"),
    rejectedCount: count("rejected"),
    // Catalog membership never means transform/validation promotion for a raster pack.
    transformPromotionCount: 0,
  });
}

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) collectFiles(full, out);
    else out.push(full);
  }
  return out;
}

export function auditHistoricalControlPointCatalogRepository(root) {
  const errors = [];
  let catalog = null;
  try {
    catalog = loadHistoricalControlPointCatalog(root);
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "歴史基準点カタログを解析できません");
  }

  const publicCatalogPath = join(root, "public", "data", "historical-control-point-catalog.json");
  if (existsSync(publicCatalogPath)) {
    errors.push("歴史基準点カタログをpublicへ配信してはいけません");
  }

  const publicRasterPath = join(root, "public", "data", "historical-rasters");
  if (existsSync(publicRasterPath)) {
    errors.push("公開古地図ディレクトリが存在します");
  }

  try {
    const runtime = JSON.parse(readFileSync(join(root, "src", "historical-raster-registry.json"), "utf8"));
    if (!Array.isArray(runtime) || runtime.length !== 0) {
      errors.push("本番ラスターレジストリが空ではありません");
    }
  } catch {
    errors.push("本番ラスターレジストリを確認できません");
  }

  const mainSource = readFileSync(join(root, "src", "main.ts"), "utf8");
  if (
    mainSource.includes("historical-control-point-catalog") ||
    mainSource.includes("loadHistoricalControlPointCatalog") ||
    mainSource.includes("validateHistoricalControlPointCatalog")
  ) {
    errors.push("runtime(main.ts)が歴史基準点カタログを参照しています");
  }

  const distPath = join(root, "dist");
  if (existsSync(distPath)) {
    const leaked = collectFiles(distPath).some((file) => {
      const normalized = file.replace(/\\/gu, "/");
      return (
        normalized.includes("historical-control-point-catalog") ||
        normalized.includes("test-fixture-control-point")
      );
    });
    if (leaked) errors.push("歴史基準点カタログまたはtest fixtureがdistへ混入しています");
  }

  return Object.freeze({ errors: Object.freeze(errors), catalog });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditHistoricalControlPointCatalogRepository(root);
  if (result.catalog) {
    const summary = summarizeHistoricalControlPointCatalog(result.catalog);
    console.log(
      `歴史基準点カタログ: schema ${summary.schemaVersion}、${summary.entryCount}件、status ${summary.catalogStatus}`,
    );
  }
  for (const message of result.errors) console.error(`ERROR: ${message}`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
