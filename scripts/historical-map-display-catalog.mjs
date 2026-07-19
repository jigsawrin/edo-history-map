import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HISTORICAL_MAP_DISPLAY_CATALOG_SCHEMA_VERSION = 1;
export const HISTORICAL_MAP_DISPLAY_CATALOG_STATUSES = Object.freeze([
  "empty-foundation",
  "reviewed",
]);
export const HISTORICAL_MAP_DISPLAY_ROLES = Object.freeze([
  "overview",
  "regional",
  "detail",
  "reference-only",
]);
export const HISTORICAL_MAP_DISPLAY_MODES = Object.freeze([
  "georeferenced-overlay",
  "reference-panel",
]);
export const HISTORICAL_MAP_DISPLAY_ROTATIONS = Object.freeze([0, 90, 180, 270]);
export const HISTORICAL_MAP_RIGHTS_REVIEW_STATUSES = Object.freeze([
  "approved",
  "pending",
  "rejected",
]);
export const HISTORICAL_MAP_TECHNICAL_REVIEW_STATUSES = Object.freeze([
  "not-started",
  "in-review",
  "approved",
  "rejected",
]);
export const HISTORICAL_MAP_PUBLICATION_STATUSES = Object.freeze([
  "candidate",
  "shortlisted",
  "published",
]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f<>]/u;
const ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "catalogStatus",
  "reviewedAt",
  "maps",
]);
const MAP_KEYS = Object.freeze([
  "id",
  "name",
  "displayRole",
  "displayMode",
  "crop",
  "zoom",
  "regionId",
  "eraId",
  "parentMapId",
  "priority",
  "coveragePolygon",
  "sourceId",
  "rightsReviewStatus",
  "technicalReviewStatus",
  "publicationStatus",
]);
const CROP_KEYS = Object.freeze([
  "sourceWidth",
  "sourceHeight",
  "x",
  "y",
  "width",
  "height",
  "rotationDegrees",
]);
const ZOOM_KEYS = Object.freeze([
  "minimum",
  "maximum",
  "enterDetailAt",
  "leaveDetailBelow",
]);
const CATALOG_RELATIVE_PATH = "data-curation/historical-map-display-catalog.json";
const RUNTIME_SOURCE_EXTENSIONS = Object.freeze([".ts", ".mts", ".js"]);
export const RUNTIME_MAP_DISPLAY_REFERENCE_NEEDLES = Object.freeze([
  "historical-map-display-catalog",
  "data-curation/historical-map-display-catalog.json",
  "loadHistoricalMapDisplayCatalog",
  "validateHistoricalMapDisplayCatalog",
  "summarizeHistoricalMapDisplayCatalog",
  "auditHistoricalMapDisplayCatalogRepository",
]);

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
export function validateMapDisplayLocalizedText(value, label) {
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

function assertInteger(value, label, min, max) {
  assert(Number.isInteger(value) && value >= min && value <= max, `${label}が範囲外です`);
  return value;
}

function assertFinite(value, label, min, max) {
  assert(Number.isFinite(value) && value >= min && value <= max, `${label}が範囲外です`);
  return value;
}

function validateCrop(raw, label) {
  const crop = assertObject(raw, label, CROP_KEYS);
  for (const key of CROP_KEYS) assert(Object.hasOwn(crop, key), `${label}.${key}がありません`);
  const sourceWidth = assertInteger(crop.sourceWidth, `${label}.sourceWidth`, 1, 100000);
  const sourceHeight = assertInteger(crop.sourceHeight, `${label}.sourceHeight`, 1, 100000);
  const x = assertInteger(crop.x, `${label}.x`, 0, sourceWidth);
  const y = assertInteger(crop.y, `${label}.y`, 0, sourceHeight);
  const width = assertInteger(crop.width, `${label}.width`, 1, sourceWidth);
  const height = assertInteger(crop.height, `${label}.height`, 1, sourceHeight);
  assert(x + width <= sourceWidth, `${label}: cropが元画像幅の外側です`);
  assert(y + height <= sourceHeight, `${label}: cropが元画像高さの外側です`);
  assert(
    HISTORICAL_MAP_DISPLAY_ROTATIONS.includes(crop.rotationDegrees),
    `${label}.rotationDegreesは0/90/180/270のみです`,
  );
  return Object.freeze({
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
    rotationDegrees: crop.rotationDegrees,
  });
}

function validateZoom(raw, label) {
  const zoom = assertObject(raw, label, ZOOM_KEYS);
  for (const key of ZOOM_KEYS) assert(Object.hasOwn(zoom, key), `${label}.${key}がありません`);
  const minimum = assertFinite(zoom.minimum, `${label}.minimum`, 0, 24);
  const maximum = assertFinite(zoom.maximum, `${label}.maximum`, 0, 24);
  assert(minimum <= maximum, `${label}: minimumはmaximum以下である必要があります`);
  const enterDetailAt = assertFinite(zoom.enterDetailAt, `${label}.enterDetailAt`, minimum, maximum);
  const leaveDetailBelow = assertFinite(
    zoom.leaveDetailBelow,
    `${label}.leaveDetailBelow`,
    minimum,
    maximum,
  );
  assert(
    enterDetailAt > leaveDetailBelow,
    `${label}: enterDetailAtはleaveDetailBelowより大きい必要があります（ヒステリシス）`,
  );
  return Object.freeze({ minimum, maximum, enterDetailAt, leaveDetailBelow });
}

function validatePosition(position, label) {
  assert(Array.isArray(position) && position.length >= 2, `${label}が不正です`);
  assertFinite(position[0], `${label}[0]`, -180, 180);
  assertFinite(position[1], `${label}[1]`, -90, 90);
  return Object.freeze([position[0], position[1]]);
}

function validateLinearRing(ring, label) {
  assert(Array.isArray(ring) && ring.length >= 4, `${label}は4点以上必要です`);
  const positions = ring.map((position, index) => validatePosition(position, `${label}[${index}]`));
  const first = positions[0];
  const last = positions[positions.length - 1];
  assert(
    first[0] === last[0] && first[1] === last[1],
    `${label}は閉じたリングである必要があります`,
  );
  return Object.freeze(positions);
}

function validateCoveragePolygon(raw, label) {
  assert(raw && typeof raw === "object" && !Array.isArray(raw), `${label}がobjectではありません`);
  assert(
    raw.type === "Polygon" || raw.type === "MultiPolygon",
    `${label}.typeはPolygonまたはMultiPolygonである必要があります`,
  );
  assert(Array.isArray(raw.coordinates), `${label}.coordinatesがありません`);
  if (raw.type === "Polygon") {
    assert(raw.coordinates.length >= 1, `${label}.coordinatesが空です`);
    return Object.freeze({
      type: "Polygon",
      coordinates: Object.freeze(
        raw.coordinates.map((ring, index) => validateLinearRing(ring, `${label}.coordinates[${index}]`)),
      ),
    });
  }
  assert(raw.coordinates.length >= 1, `${label}.coordinatesが空です`);
  return Object.freeze({
    type: "MultiPolygon",
    coordinates: Object.freeze(
      raw.coordinates.map((polygon, polygonIndex) => {
        assert(Array.isArray(polygon) && polygon.length >= 1, `${label}.coordinates[${polygonIndex}]が不正です`);
        return Object.freeze(
          polygon.map((ring, ringIndex) =>
            validateLinearRing(ring, `${label}.coordinates[${polygonIndex}][${ringIndex}]`),
          ),
        );
      }),
    ),
  });
}

function validateMap(raw, index) {
  const label = `maps[${index}]`;
  const value = assertObject(raw, label, MAP_KEYS);
  for (const key of MAP_KEYS) {
    if (key === "parentMapId") continue;
    assert(Object.hasOwn(value, key), `${label}.${key}がありません`);
  }

  const id = assertId(value.id, `${label}.id`);
  const name = validateMapDisplayLocalizedText(value.name, `${label}.name`);
  assert(HISTORICAL_MAP_DISPLAY_ROLES.includes(value.displayRole), `${label}.displayRoleが不正です`);
  assert(HISTORICAL_MAP_DISPLAY_MODES.includes(value.displayMode), `${label}.displayModeが不正です`);
  if (value.displayRole === "reference-only") {
    assert(
      value.displayMode !== "georeferenced-overlay",
      `${label}: reference-onlyはgeoreferenced-overlayにできません`,
    );
  }
  const crop = validateCrop(value.crop, `${label}.crop`);
  const zoom = validateZoom(value.zoom, `${label}.zoom`);
  const regionId = assertId(value.regionId, `${label}.regionId`);
  const eraId = assertId(value.eraId, `${label}.eraId`);
  let parentMapId;
  if (value.parentMapId !== undefined) {
    parentMapId = assertId(value.parentMapId, `${label}.parentMapId`);
    assert(parentMapId !== id, `${label}: parentMapIdの自己参照は禁止です`);
  }
  const priority = assertInteger(value.priority, `${label}.priority`, 0, 100000);
  const coveragePolygon = validateCoveragePolygon(value.coveragePolygon, `${label}.coveragePolygon`);
  const sourceId = assertId(value.sourceId, `${label}.sourceId`);
  assert(
    HISTORICAL_MAP_RIGHTS_REVIEW_STATUSES.includes(value.rightsReviewStatus),
    `${label}.rightsReviewStatusが不正です`,
  );
  assert(
    HISTORICAL_MAP_TECHNICAL_REVIEW_STATUSES.includes(value.technicalReviewStatus),
    `${label}.technicalReviewStatusが不正です`,
  );
  assert(
    HISTORICAL_MAP_PUBLICATION_STATUSES.includes(value.publicationStatus),
    `${label}.publicationStatusが不正です`,
  );
  if (value.publicationStatus === "published") {
    assert(
      value.technicalReviewStatus === "approved",
      `${label}: publishedにはtechnicalReviewStatus=approvedが必要です`,
    );
    assert(
      value.rightsReviewStatus === "approved",
      `${label}: publishedにはrightsReviewStatus=approvedが必要です`,
    );
  }

  return Object.freeze({
    id,
    name,
    displayRole: value.displayRole,
    displayMode: value.displayMode,
    crop,
    zoom,
    regionId,
    eraId,
    ...(parentMapId === undefined ? {} : { parentMapId }),
    priority,
    coveragePolygon,
    sourceId,
    rightsReviewStatus: value.rightsReviewStatus,
    technicalReviewStatus: value.technicalReviewStatus,
    publicationStatus: value.publicationStatus,
  });
}

function assertNoParentCycles(maps) {
  const byId = new Map(maps.map((map) => [map.id, map]));
  for (const map of maps) {
    if (!map.parentMapId) continue;
    assert(byId.has(map.parentMapId), `${map.id}: parentMapId ${map.parentMapId} が存在しません`);
    const seen = new Set([map.id]);
    let current = map.parentMapId;
    while (current) {
      assert(!seen.has(current), `${map.id}: parentMapIdに循環があります`);
      seen.add(current);
      current = byId.get(current)?.parentMapId;
    }
  }
}

export function validateHistoricalMapDisplayCatalog(value) {
  const catalog = assertObject(value, "古地図表示カタログ", ROOT_KEYS);
  assert(
    catalog.schemaVersion === HISTORICAL_MAP_DISPLAY_CATALOG_SCHEMA_VERSION,
    "古地図表示カタログschemaVersionは1である必要があります",
  );
  assert(
    HISTORICAL_MAP_DISPLAY_CATALOG_STATUSES.includes(catalog.catalogStatus),
    "古地図表示カタログcatalogStatusが不正です",
  );
  assert(
    catalog.reviewedAt === null ||
      (typeof catalog.reviewedAt === "string" && DATE_PATTERN.test(catalog.reviewedAt)),
    "古地図表示カタログreviewedAtが不正です",
  );
  assert(Array.isArray(catalog.maps), "古地図表示カタログmapsは配列である必要があります");

  if (catalog.catalogStatus === "empty-foundation") {
    assert(catalog.maps.length === 0, "empty-foundationではmapsを空にする必要があります");
  }
  if (catalog.catalogStatus === "reviewed") {
    assert(
      typeof catalog.reviewedAt === "string" && DATE_PATTERN.test(catalog.reviewedAt),
      "reviewedではreviewedAtが必須です",
    );
  }

  const maps = catalog.maps.map(validateMap);
  const ids = maps.map((map) => map.id);
  assert(new Set(ids).size === ids.length, "古地図表示カタログのidが重複しています");
  assertNoParentCycles(maps);

  return Object.freeze({
    schemaVersion: HISTORICAL_MAP_DISPLAY_CATALOG_SCHEMA_VERSION,
    catalogStatus: catalog.catalogStatus,
    reviewedAt: catalog.reviewedAt,
    maps: Object.freeze(maps),
  });
}

export function loadHistoricalMapDisplayCatalog(root) {
  const path = join(root, CATALOG_RELATIVE_PATH);
  assert(existsSync(path), `${CATALOG_RELATIVE_PATH}がありません`);
  return validateHistoricalMapDisplayCatalog(JSON.parse(readFileSync(path, "utf8")));
}

export function summarizeHistoricalMapDisplayCatalog(catalog) {
  const count = (statusField, status) =>
    catalog.maps.filter((map) => map[statusField] === status).length;
  const runtimeEligibleCount = catalog.maps.filter(
    (map) => map.publicationStatus === "published",
  ).length;
  return Object.freeze({
    schemaVersion: catalog.schemaVersion,
    catalogStatus: catalog.catalogStatus,
    mapCount: catalog.maps.length,
    publishedCount: count("publicationStatus", "published"),
    technicalApprovedCount: count("technicalReviewStatus", "approved"),
    runtimeEligibleCount,
    // Empty or unpublished catalogs never imply runtime/public connection.
    runtimeConnected: false,
  });
}

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  let rootStat;
  try {
    rootStat = lstatSync(dir);
  } catch {
    return out;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let entryStat;
    try {
      entryStat = lstatSync(full);
    } catch {
      continue;
    }
    if (entryStat.isSymbolicLink()) continue;
    if (entryStat.isDirectory()) collectFiles(full, out);
    else if (entryStat.isFile()) out.push(full);
  }
  return out;
}

function hasRuntimeSourceExtension(filePath) {
  return RUNTIME_SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

export function findRuntimeHistoricalMapDisplayCatalogReferences(root) {
  const srcRoot = join(root, "src");
  const hits = [];
  for (const file of collectFiles(srcRoot)) {
    const normalized = relative(root, file).replace(/\\/gu, "/");
    if (!normalized.startsWith("src/") || !hasRuntimeSourceExtension(normalized)) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const needle of RUNTIME_MAP_DISPLAY_REFERENCE_NEEDLES) {
      if (content.includes(needle)) {
        hits.push(Object.freeze({ file: normalized, needle }));
        break;
      }
    }
  }
  return Object.freeze(hits);
}

export function auditHistoricalMapDisplayCatalogRepository(root) {
  const errors = [];
  let catalog = null;
  try {
    catalog = loadHistoricalMapDisplayCatalog(root);
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "古地図表示カタログを解析できません");
  }

  if (catalog && catalog.maps.length === 0) {
    // Empty catalogs must stay disconnected from runtime/public surfaces.
  } else if (catalog && catalog.maps.length > 0) {
    const runtimeEligible = catalog.maps.filter((map) => map.publicationStatus === "published");
    if (runtimeEligible.length > 0) {
      // Future published maps still require a separate runtime wiring PR.
      // This foundation rejects silent promotion while keeping validator ready.
    }
  }

  const publicCatalogPath = join(root, "public", "data", "historical-map-display-catalog.json");
  if (existsSync(publicCatalogPath)) {
    errors.push("古地図表示カタログをpublicへ配信してはいけません");
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

  for (const hit of findRuntimeHistoricalMapDisplayCatalogReferences(root)) {
    errors.push(`runtime(${hit.file})が古地図表示カタログを参照しています: ${hit.needle}`);
  }

  const distPath = join(root, "dist");
  if (existsSync(distPath)) {
    const leaked = collectFiles(distPath).some((file) => {
      const normalized = file.replace(/\\/gu, "/");
      return (
        normalized.includes("historical-map-display-catalog") ||
        normalized.includes("test-fixture-display-map")
      );
    });
    if (leaked) errors.push("古地図表示カタログまたはtest fixtureがdistへ混入しています");
  }

  for (const file of collectFiles(join(root, "public"))) {
    const normalized = relative(root, file).replace(/\\/gu, "/");
    if (normalized.endsWith(".map")) errors.push(`source mapがpublicにあります: ${normalized}`);
    const base = normalized.split("/").pop()?.toLowerCase() ?? "";
    if (/^(service-worker|sw)(\.|$)/u.test(base) || base.startsWith("workbox")) {
      errors.push(`Service Worker関連ファイルがあります: ${normalized}`);
    }
  }

  return Object.freeze({ errors: Object.freeze(errors), catalog });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditHistoricalMapDisplayCatalogRepository(root);
  if (result.catalog) {
    const summary = summarizeHistoricalMapDisplayCatalog(result.catalog);
    console.log(
      `古地図表示カタログ: schema ${summary.schemaVersion}、${summary.mapCount}件、status ${summary.catalogStatus}`,
    );
  }
  for (const message of result.errors) console.error(`ERROR: ${message}`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
