import { HISTORICAL_RASTER_GEOREFERENCE_METHODS } from "./historical-raster-schema.mjs";

export const HISTORICAL_RASTER_CONTROL_POINT_SCHEMA_VERSION = 1;
export const HISTORICAL_RASTER_GEOREFERENCE_SCHEMA_VERSION = 1;
export const HISTORICAL_RASTER_CONTROL_POINT_CONFIDENCES = Object.freeze(["high", "medium", "low"]);

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CONTROL_KEYS = new Set(["schemaVersion", "rasterId", "imageWidth", "imageHeight", "points"]);
const POINT_KEYS = new Set(["id", "pixelX", "pixelY", "latitude", "longitude", "basisJa", "confidence", "sourceIds"]);
const GEOREFERENCE_KEYS = new Set([
  "schemaVersion", "rasterId", "method", "controlPointCount", "software",
  "softwareVersion", "meanErrorMeters", "medianErrorMeters",
  "maximumErrorMeters", "geographicCoverageJa", "distortionNoteJa",
  "adjacentSheetNoteJa", "controlPointsSha256",
  "transformationParametersSha256",
]);
const SHA256 = /^[0-9a-f]{64}$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f<>]/u;

function fail(message) { throw new Error(message); }
function object(value, label, keys) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}がオブジェクトではありません`); for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label}.${key}は未定義項目です`); for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label}.${key}がありません`); return value; }
function id(value, label) { if (typeof value !== "string" || !ID.test(value)) fail(`${label}が不正です`); return value; }
function text(value, label, max = 1000) { if (typeof value !== "string" || !value || value.trim() !== value || value.length > max || FORBIDDEN_TEXT.test(value)) fail(`${label}が不正です`); return value; }
function integer(value, label, min, max) { if (!Number.isInteger(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function finite(value, label, min, max) { if (!Number.isFinite(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function sha(value, label) { if (typeof value !== "string" || !SHA256.test(value)) fail(`${label}がSHA-256ではありません`); return value; }
function nullableError(value, label) { return value === null ? null : finite(value, label, 0, 100000); }

export function validateHistoricalRasterControlPoints(input) {
  const value = object(input, "controlPoints", CONTROL_KEYS);
  if (value.schemaVersion !== HISTORICAL_RASTER_CONTROL_POINT_SCHEMA_VERSION) fail("controlPoints.schemaVersionが不正です");
  const imageWidth = integer(value.imageWidth, "controlPoints.imageWidth", 1, 100000);
  const imageHeight = integer(value.imageHeight, "controlPoints.imageHeight", 1, 100000);
  if (!Array.isArray(value.points) || value.points.length === 0 || value.points.length > 10000) fail("controlPoints.pointsの件数が不正です");
  const ids = new Set(); const pixels = new Set(); const coordinates = new Set();
  const points = value.points.map((inputPoint, index) => {
    const point = object(inputPoint, `controlPoints.points[${index}]`, POINT_KEYS);
    const pointId = id(point.id, `controlPoints.points[${index}].id`);
    const pixelX = finite(point.pixelX, `controlPoints.points[${index}].pixelX`, 0, imageWidth);
    const pixelY = finite(point.pixelY, `controlPoints.points[${index}].pixelY`, 0, imageHeight);
    if (pixelX >= imageWidth || pixelY >= imageHeight) fail("基準点pixel座標が画像外です");
    const latitude = finite(point.latitude, `controlPoints.points[${index}].latitude`, -90, 90);
    const longitude = finite(point.longitude, `controlPoints.points[${index}].longitude`, -180, 180);
    if (ids.has(pointId) || pixels.has(`${pixelX}:${pixelY}`) || coordinates.has(`${latitude}:${longitude}`)) fail("基準点IDまたは同一点が重複しています");
    ids.add(pointId); pixels.add(`${pixelX}:${pixelY}`); coordinates.add(`${latitude}:${longitude}`);
    if (!HISTORICAL_RASTER_CONTROL_POINT_CONFIDENCES.includes(point.confidence)) fail("基準点confidenceが不正です");
    if (!Array.isArray(point.sourceIds) || point.sourceIds.length === 0 || new Set(point.sourceIds).size !== point.sourceIds.length) fail("基準点sourceIdsが不正です");
    const sourceIds = point.sourceIds.map((sourceId, sourceIndex) => id(sourceId, `controlPoints.points[${index}].sourceIds[${sourceIndex}]`));
    return Object.freeze({ id: pointId, pixelX, pixelY, latitude, longitude, basisJa: text(point.basisJa, `controlPoints.points[${index}].basisJa`, 500), confidence: point.confidence, sourceIds: Object.freeze(sourceIds) });
  });
  return Object.freeze({ schemaVersion: HISTORICAL_RASTER_CONTROL_POINT_SCHEMA_VERSION, rasterId: id(value.rasterId, "controlPoints.rasterId"), imageWidth, imageHeight, points: Object.freeze(points) });
}

export function hasDistributedControlPoints(controlPoints) {
  if (controlPoints.points.length < 4) return false;
  const xs = controlPoints.points.map((point) => point.pixelX);
  const ys = controlPoints.points.map((point) => point.pixelY);
  if (Math.max(...xs) - Math.min(...xs) < controlPoints.imageWidth * 0.6 || Math.max(...ys) - Math.min(...ys) < controlPoints.imageHeight * 0.6) return false;
  const halves = new Set(controlPoints.points.map((point) => `${point.pixelX < controlPoints.imageWidth / 2 ? 0 : 1}:${point.pixelY < controlPoints.imageHeight / 2 ? 0 : 1}`));
  return halves.size === 4;
}

export function validateHistoricalRasterGeoreference(input) {
  const value = object(input, "georeference", GEOREFERENCE_KEYS);
  if (value.schemaVersion !== HISTORICAL_RASTER_GEOREFERENCE_SCHEMA_VERSION) fail("georeference.schemaVersionが不正です");
  if (!HISTORICAL_RASTER_GEOREFERENCE_METHODS.includes(value.method)) fail("georeference.methodが不正です");
  const meanErrorMeters = nullableError(value.meanErrorMeters, "georeference.meanErrorMeters");
  const medianErrorMeters = nullableError(value.medianErrorMeters, "georeference.medianErrorMeters");
  const maximumErrorMeters = nullableError(value.maximumErrorMeters, "georeference.maximumErrorMeters");
  if (maximumErrorMeters !== null && [meanErrorMeters, medianErrorMeters].some((error) => error !== null && error > maximumErrorMeters)) fail("georeferenceの誤差値順序が不正です");
  return Object.freeze({
    schemaVersion: HISTORICAL_RASTER_GEOREFERENCE_SCHEMA_VERSION,
    rasterId: id(value.rasterId, "georeference.rasterId"),
    method: value.method,
    controlPointCount: integer(value.controlPointCount, "georeference.controlPointCount", 1, 10000),
    software: text(value.software, "georeference.software", 160),
    softwareVersion: text(value.softwareVersion, "georeference.softwareVersion", 80),
    meanErrorMeters, medianErrorMeters, maximumErrorMeters,
    geographicCoverageJa: text(value.geographicCoverageJa, "georeference.geographicCoverageJa", 500),
    distortionNoteJa: text(value.distortionNoteJa, "georeference.distortionNoteJa", 1000),
    adjacentSheetNoteJa: text(value.adjacentSheetNoteJa, "georeference.adjacentSheetNoteJa", 1000),
    controlPointsSha256: sha(value.controlPointsSha256, "georeference.controlPointsSha256"),
    transformationParametersSha256: sha(value.transformationParametersSha256, "georeference.transformationParametersSha256"),
  });
}
