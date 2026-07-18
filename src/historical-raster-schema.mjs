export const HISTORICAL_RASTER_REVIEW_STATUSES = Object.freeze([
  "approved",
  "pending",
  "rejected",
]);
export const HISTORICAL_RASTER_TILE_FORMATS = Object.freeze(["png", "webp"]);
export const HISTORICAL_RASTER_GEOREFERENCE_METHODS = Object.freeze([
  "projective",
  "polynomial-1",
  "polynomial-2",
  "thin-plate-spline",
  "map-warper-export",
  "other",
]);
export const HISTORICAL_RASTER_SEAM_POLICIES = Object.freeze([
  "single-sheet",
  "manual-selection",
  "fixed-priority",
]);

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f<>]/u;
const DEFINITION_KEYS = new Set([
  "id", "regionId", "eraId", "titleJa", "titleEn", "sheetLabelJa", "sheetLabelEn",
  "sourceId", "attributionId", "localTilePath", "tileManifestPath",
  "tileFormat", "tileSize", "minZoom", "maxZoom", "maxNativeZoom",
  "bounds", "defaultOpacity", "georeferenceMethod", "controlPointCount",
  "estimatedErrorMeters", "maximumErrorMeters", "sourceDateDisplayJa",
  "qualityGateVersion", "qualityGatePassed",
  "geographicCoverageJa", "georeferenceNoteJa", "contextNoteJa",
  "seamPolicy", "priority", "reviewStatus",
]);

function fail(message) { throw new Error(message); }
function plainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}がオブジェクトではありません`);
  for (const key of Object.keys(value)) if (!DEFINITION_KEYS.has(key)) fail(`${label}.${key}は未定義項目です`);
  return value;
}
function text(value, label, max = 1000, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "string" || !value || value.trim() !== value || value.length > max || FORBIDDEN_TEXT.test(value)) fail(`${label}が不正です`);
  return value;
}
function id(value, label) { const result = text(value, label, 100); if (!ID.test(result)) fail(`${label}の形式が不正です`); return result; }
function integer(value, label, min, max) { if (!Number.isInteger(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function finite(value, label, min, max) { if (!Number.isFinite(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function enumValue(value, label, values) { if (!values.includes(value)) fail(`${label}が不正です`); return value; }
function safeLocalPath(value, label, expectedSuffix) {
  const path = text(value, label, 240);
  if (!path.startsWith("data/historical-rasters/") || path.startsWith("/") || path.includes("\\") || path.includes(":") || path.includes("..") || path.includes("?") || path.includes("#") || path.split("/").some((part) => !part)) fail(`${label}は固定ローカルパスではありません`);
  if (!path.endsWith(expectedSuffix)) fail(`${label}の末尾が不正です`);
  return path;
}
function bounds(value, label) {
  if (!Array.isArray(value) || value.length !== 2 || value.some((point) => !Array.isArray(point) || point.length !== 2)) fail(`${label}が不正です`);
  const south = finite(value[0][0], `${label}.south`, -90, 90);
  const west = finite(value[0][1], `${label}.west`, -180, 180);
  const north = finite(value[1][0], `${label}.north`, -90, 90);
  const east = finite(value[1][1], `${label}.east`, -180, 180);
  if (south >= north || west >= east) fail(`${label}の順序が不正です`);
  return Object.freeze([Object.freeze([south, west]), Object.freeze([north, east])]);
}

export function validateHistoricalRasterDefinition(input, label = "historicalRaster") {
  const value = plainObject(input, label);
  const tileFormat = enumValue(value.tileFormat, `${label}.tileFormat`, HISTORICAL_RASTER_TILE_FORMATS);
  const minZoom = integer(value.minZoom, `${label}.minZoom`, 0, 22);
  const maxZoom = integer(value.maxZoom, `${label}.maxZoom`, minZoom, 22);
  const maxNativeZoom = integer(value.maxNativeZoom, `${label}.maxNativeZoom`, minZoom, maxZoom);
  const estimatedErrorMeters = value.estimatedErrorMeters === null ? null : finite(value.estimatedErrorMeters, `${label}.estimatedErrorMeters`, 0, 100000);
  const maximumErrorMeters = value.maximumErrorMeters === null ? null : finite(value.maximumErrorMeters, `${label}.maximumErrorMeters`, 0, 100000);
  if (estimatedErrorMeters !== null && maximumErrorMeters !== null && estimatedErrorMeters > maximumErrorMeters) fail(`${label}の推定誤差が最大誤差を超えています`);
  const definition = {
    id: id(value.id, `${label}.id`),
    regionId: id(value.regionId, `${label}.regionId`),
    eraId: id(value.eraId, `${label}.eraId`),
    titleJa: text(value.titleJa, `${label}.titleJa`, 160),
    ...(value.titleEn === undefined ? {} : { titleEn: text(value.titleEn, `${label}.titleEn`, 160, true) }),
    sheetLabelJa: text(value.sheetLabelJa, `${label}.sheetLabelJa`, 160),
    ...(value.sheetLabelEn === undefined ? {} : { sheetLabelEn: text(value.sheetLabelEn, `${label}.sheetLabelEn`, 160, true) }),
    sourceId: id(value.sourceId, `${label}.sourceId`),
    attributionId: id(value.attributionId, `${label}.attributionId`),
    localTilePath: safeLocalPath(value.localTilePath, `${label}.localTilePath`, `/{z}/{x}/{y}.${tileFormat}`),
    tileManifestPath: safeLocalPath(value.tileManifestPath, `${label}.tileManifestPath`, "/tile-manifest.json"),
    tileFormat,
    tileSize: integer(value.tileSize, `${label}.tileSize`, 256, 256),
    minZoom,
    maxZoom,
    maxNativeZoom,
    bounds: bounds(value.bounds, `${label}.bounds`),
    defaultOpacity: finite(value.defaultOpacity, `${label}.defaultOpacity`, 0, 1),
    georeferenceMethod: enumValue(value.georeferenceMethod, `${label}.georeferenceMethod`, HISTORICAL_RASTER_GEOREFERENCE_METHODS),
    controlPointCount: integer(value.controlPointCount, `${label}.controlPointCount`, 0, 10000),
    estimatedErrorMeters,
    maximumErrorMeters,
    qualityGateVersion: value.qualityGateVersion === undefined ? undefined : integer(value.qualityGateVersion, `${label}.qualityGateVersion`, 1, 1),
    qualityGatePassed: value.qualityGatePassed === true,
    sourceDateDisplayJa: text(value.sourceDateDisplayJa, `${label}.sourceDateDisplayJa`, 160),
    geographicCoverageJa: text(value.geographicCoverageJa, `${label}.geographicCoverageJa`, 500),
    georeferenceNoteJa: text(value.georeferenceNoteJa, `${label}.georeferenceNoteJa`, 1000),
    contextNoteJa: text(value.contextNoteJa, `${label}.contextNoteJa`, 1000),
    seamPolicy: enumValue(value.seamPolicy, `${label}.seamPolicy`, HISTORICAL_RASTER_SEAM_POLICIES),
    priority: integer(value.priority, `${label}.priority`, 0, 1000000),
    reviewStatus: enumValue(value.reviewStatus, `${label}.reviewStatus`, HISTORICAL_RASTER_REVIEW_STATUSES),
  };
  if (definition.reviewStatus === "approved" && (definition.controlPointCount === 0 || definition.estimatedErrorMeters === null || definition.maximumErrorMeters === null || definition.qualityGateVersion !== 1 || !definition.qualityGatePassed)) fail(`${label}のapproved定義には基準点・誤差評価・品質ゲート合格が必要です`);
  return Object.freeze(definition);
}

export function validateHistoricalRasterDefinitions(input) {
  if (!Array.isArray(input)) fail("古地図ラスターレジストリが配列ではありません");
  const definitions = input.map((value, index) => validateHistoricalRasterDefinition(value, `historicalRasters[${index}]`));
  if (new Set(definitions.map((value) => value.id)).size !== definitions.length) fail("古地図ラスタIDが重複しています");
  return Object.freeze(definitions);
}
