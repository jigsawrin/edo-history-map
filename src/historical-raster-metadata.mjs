import { HISTORICAL_RASTER_GEOREFERENCE_METHODS } from "./historical-raster-schema.mjs";

export const HISTORICAL_RASTER_CONTROL_POINT_SCHEMA_VERSION = 2;
export const HISTORICAL_RASTER_GEOREFERENCE_SCHEMA_VERSION = 2;
export const HISTORICAL_RASTER_CONTROL_POINT_CONFIDENCES = Object.freeze(["high", "medium", "low"]);
export const HISTORICAL_RASTER_CONTROL_POINT_ROLES = Object.freeze(["transform", "validation", "hold", "rejected"]);
export const HISTORICAL_RASTER_CONTROL_POINT_FEATURE_TYPES = Object.freeze(["castle-gate", "moat-corner", "bridge", "temple", "shrine", "stone-wall", "river-junction", "road-junction", "other"]);
export const HISTORICAL_RASTER_CURRENT_EXISTENCE = Object.freeze(["extant", "archaeological-remains", "officially-located-lost-site", "uncertain"]);
export const HISTORICAL_RASTER_MOVED_STATUSES = Object.freeze(["not-moved", "possibly-moved", "moved", "unknown"]);
export const HISTORICAL_RASTER_QUALITY_GATE_VERSION = 1;

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const HTTPS = /^https:\/\//u;
const SHA256 = /^[0-9a-f]{64}$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f<>]/u;
const CONTROL_KEYS = new Set(["schemaVersion", "rasterId", "imageWidth", "imageHeight", "points"]);
const V2_POINT_KEYS = new Set(["id", "role", "pixelX", "pixelY", "latitude", "longitude", "historicalLabelJa", "modernLabelJa", "featureType", "basisJa", "confidence", "currentExistence", "movedStatus", "sourceIds", "evidenceUrls", "rejectionReasonJa"]);
const V1_GEOREFERENCE_KEYS = new Set(["schemaVersion", "rasterId", "method", "controlPointCount", "software", "softwareVersion", "meanErrorMeters", "medianErrorMeters", "maximumErrorMeters", "geographicCoverageJa", "distortionNoteJa", "adjacentSheetNoteJa", "controlPointsSha256", "transformationParametersSha256"]);
const V2_GEOREFERENCE_KEYS = new Set([...V1_GEOREFERENCE_KEYS, "validationPointCount", "validationMeanErrorMeters", "validationMedianErrorMeters", "validationP90ErrorMeters", "validationMaximumErrorMeters", "qualityGateVersion", "qualityGatePassed"]);

function fail(message) { throw new Error(message); }
function object(value, label, keys) { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}がオブジェクトではありません`); for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label}.${key}は未定義項目です`); for (const key of keys) if (!Object.hasOwn(value, key) && key !== "rejectionReasonJa") fail(`${label}.${key}がありません`); return value; }
function id(value, label) { if (typeof value !== "string" || !ID.test(value)) fail(`${label}が不正です`); return value; }
function text(value, label, max = 1000) { if (typeof value !== "string" || !value || value.trim() !== value || value.length > max || FORBIDDEN_TEXT.test(value)) fail(`${label}が不正です`); return value; }
function optionalText(value, label, max = 1000) { return value === undefined ? undefined : text(value, label, max); }
function integer(value, label, min, max) { if (!Number.isInteger(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function finite(value, label, min, max) { if (!Number.isFinite(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function enumValue(value, label, values) { if (!values.includes(value)) fail(`${label}が不正です`); return value; }
function sha(value, label) { if (typeof value !== "string" || !SHA256.test(value)) fail(`${label}がSHA-256ではありません`); return value; }
function nullableError(value, label) { return value === null ? null : finite(value, label, 0, 100000); }
function https(value, label) { if (typeof value !== "string" || !HTTPS.test(value)) fail(`${label}がHTTPS URLではありません`); let url; try { url = new globalThis.URL(value); } catch { fail(`${label}がHTTPS URLではありません`); } if (url.protocol !== "https:" || url.username || url.password) fail(`${label}がHTTPS URLではありません`); return value; }

export function migrateHistoricalRasterControlPointsV1(input) {
  if (!input || input.schemaVersion !== 1) return input;
  return { ...input, schemaVersion: 2, points: input.points.map((point) => ({ ...point, role: "hold", historicalLabelJa: point.id, modernLabelJa: point.id, featureType: "other", currentExistence: "uncertain", movedStatus: "unknown", evidenceUrls: [], rejectionReasonJa: "schema v1にはroleとevidence URLがないため、再審査までholdとします。" })) };
}

export function validateHistoricalRasterControlPoints(input, options = {}) {
  const migrated = migrateHistoricalRasterControlPointsV1(input);
  const value = object(migrated, "controlPoints", CONTROL_KEYS);
  if (value.schemaVersion !== 2) fail("controlPoints.schemaVersionが不正です");
  const imageWidth = integer(value.imageWidth, "controlPoints.imageWidth", 1, 100000);
  const imageHeight = integer(value.imageHeight, "controlPoints.imageHeight", 1, 100000);
  if (!Array.isArray(value.points) || value.points.length === 0 || value.points.length > 10000) fail("controlPoints.pointsの件数が不正です");
  const ids = new Set(); const pixelsByRole = new Set(); const coordinatesByRole = new Set();
  const approvedSources = options.approvedSourceIds ? new Set(options.approvedSourceIds) : null;
  const points = value.points.map((inputPoint, index) => {
    const point = object(inputPoint, `controlPoints.points[${index}]`, V2_POINT_KEYS);
    const pointId = id(point.id, `controlPoints.points[${index}].id`);
    const role = enumValue(point.role, `controlPoints.points[${index}].role`, HISTORICAL_RASTER_CONTROL_POINT_ROLES);
    const pixelX = finite(point.pixelX, `controlPoints.points[${index}].pixelX`, 0, imageWidth);
    const pixelY = finite(point.pixelY, `controlPoints.points[${index}].pixelY`, 0, imageHeight);
    if (pixelX >= imageWidth || pixelY >= imageHeight) fail("基準点pixel座標が画像外です");
    const latitude = finite(point.latitude, `controlPoints.points[${index}].latitude`, -90, 90);
    const longitude = finite(point.longitude, `controlPoints.points[${index}].longitude`, -180, 180);
    const pixelRole = `${role}:${pixelX}:${pixelY}`; const coordinateRole = `${role}:${latitude}:${longitude}`;
    if (ids.has(pointId) || pixelsByRole.has(pixelRole) || coordinatesByRole.has(coordinateRole)) fail("基準点IDまたは同一role内の点が重複しています");
    ids.add(pointId); pixelsByRole.add(pixelRole); coordinatesByRole.add(coordinateRole);
    const confidence = enumValue(point.confidence, `controlPoints.points[${index}].confidence`, HISTORICAL_RASTER_CONTROL_POINT_CONFIDENCES);
    const currentExistence = enumValue(point.currentExistence, `controlPoints.points[${index}].currentExistence`, HISTORICAL_RASTER_CURRENT_EXISTENCE);
    const movedStatus = enumValue(point.movedStatus, `controlPoints.points[${index}].movedStatus`, HISTORICAL_RASTER_MOVED_STATUSES);
    if ((role === "transform" || role === "validation") && confidence === "low") fail(`${pointId}: transform/validationにlowは使えません`);
    if (role === "transform" && (movedStatus === "moved" || currentExistence === "uncertain")) fail(`${pointId}: 移設または不確実な点はtransformに使えません`);
    if (!Array.isArray(point.sourceIds) || point.sourceIds.length === 0 || new Set(point.sourceIds).size !== point.sourceIds.length) fail(`${pointId}: sourceIdsが不正です`);
    const sourceIds = point.sourceIds.map((sourceId, sourceIndex) => id(sourceId, `controlPoints.points[${index}].sourceIds[${sourceIndex}]`));
    if (approvedSources && (role === "transform" || role === "validation") && sourceIds.some((sourceId) => !approvedSources.has(sourceId))) fail(`${pointId}: 未承認sourceです`);
    if (!Array.isArray(point.evidenceUrls) || ((role === "transform" || role === "validation") && point.evidenceUrls.length === 0) || new Set(point.evidenceUrls).size !== point.evidenceUrls.length) fail(`${pointId}: evidenceUrlsが不正です`);
    const evidenceUrls = point.evidenceUrls.map((url, urlIndex) => https(url, `controlPoints.points[${index}].evidenceUrls[${urlIndex}]`));
    const rejectionReasonJa = optionalText(point.rejectionReasonJa, `controlPoints.points[${index}].rejectionReasonJa`, 500);
    if ((role === "hold" || role === "rejected") && !rejectionReasonJa) fail(`${pointId}: hold/rejectedには不採用理由が必要です`);
    return Object.freeze({ id: pointId, role, pixelX, pixelY, latitude, longitude, historicalLabelJa: text(point.historicalLabelJa, `${pointId}.historicalLabelJa`, 160), modernLabelJa: text(point.modernLabelJa, `${pointId}.modernLabelJa`, 160), featureType: enumValue(point.featureType, `${pointId}.featureType`, HISTORICAL_RASTER_CONTROL_POINT_FEATURE_TYPES), basisJa: text(point.basisJa, `${pointId}.basisJa`, 500), confidence, currentExistence, movedStatus, sourceIds: Object.freeze(sourceIds), evidenceUrls: Object.freeze(evidenceUrls), ...(rejectionReasonJa ? { rejectionReasonJa } : {}) });
  });
  const transformPixels = new Set(points.filter((point) => point.role === "transform").map((point) => `${point.pixelX}:${point.pixelY}`));
  const validationPixels = new Set(points.filter((point) => point.role === "validation").map((point) => `${point.pixelX}:${point.pixelY}`));
  const transformCoordinates = new Set(points.filter((point) => point.role === "transform").map((point) => `${point.latitude}:${point.longitude}`));
  const validationCoordinates = new Set(points.filter((point) => point.role === "validation").map((point) => `${point.latitude}:${point.longitude}`));
  if ([...transformPixels].some((key) => validationPixels.has(key)) || [...transformCoordinates].some((key) => validationCoordinates.has(key))) fail("transform点とvalidation点が重複しています");
  return Object.freeze({ schemaVersion: 2, rasterId: id(value.rasterId, "controlPoints.rasterId"), imageWidth, imageHeight, points: Object.freeze(points) });
}

export function hasDistributedControlPoints(controlPoints, role = "transform") {
  const points = controlPoints.points.filter((point) => point.role === role);
  if (points.length < 4) return false;
  const xs = points.map((point) => point.pixelX); const ys = points.map((point) => point.pixelY);
  if (Math.max(...xs) - Math.min(...xs) < controlPoints.imageWidth * 0.6 || Math.max(...ys) - Math.min(...ys) < controlPoints.imageHeight * 0.6) return false;
  return new Set(points.map((point) => `${point.pixelX < controlPoints.imageWidth / 2 ? 0 : 1}:${point.pixelY < controlPoints.imageHeight / 2 ? 0 : 1}`)).size === 4;
}

export function greatCircleDistanceMeters(left, right) {
  for (const [value, label, min, max] of [[left.latitude, "left.latitude", -90, 90], [left.longitude, "left.longitude", -180, 180], [right.latitude, "right.latitude", -90, 90], [right.longitude, "right.longitude", -180, 180]]) finite(value, label, min, max);
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(right.latitude - left.latitude); const dLon = radians(right.longitude - left.longitude);
  const lat1 = radians(left.latitude); const lat2 = radians(right.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function summarizeResidualMeters(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value) || value < 0)) fail("残差配列が不正です");
  const sorted = [...values].sort((a, b) => a - b); const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const middle = Math.floor(sorted.length / 2); const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  const p90 = sorted[Math.max(0, Math.ceil(sorted.length * 0.9) - 1)];
  return Object.freeze({ count: values.length, mean, median, p90, maximum: sorted.at(-1), values: Object.freeze([...values]) });
}

export function summarizeValidationResiduals(residuals) {
  const validation = residuals.filter((residual) => residual.role === "validation");
  return summarizeResidualMeters(validation.map((residual) => greatCircleDistanceMeters(residual.expected, residual.actual)));
}

export function evaluateHistoricalRasterQualityGate(input) {
  const failures = [];
  if (input.rightsApproved !== true) failures.push("rights-approved");
  if (input.commercialUseCompatible !== true) failures.push("commercial-use");
  if (input.attributionComplete !== true) failures.push("attribution");
  if (!Number.isInteger(input.transformPointCount) || input.transformPointCount < 8) failures.push("transform-count");
  if (!Number.isInteger(input.validationPointCount) || input.validationPointCount < 4) failures.push("validation-count");
  if (!input.transformDistributed) failures.push("transform-distribution");
  if (!input.validationDistributed) failures.push("validation-distribution");
  if (!Number.isFinite(input.validationMeanErrorMeters) || input.validationMeanErrorMeters > 150) failures.push("validation-mean");
  if (!Number.isFinite(input.validationMedianErrorMeters) || input.validationMedianErrorMeters > 100) failures.push("validation-median");
  if (!Number.isFinite(input.validationMaximumErrorMeters) || input.validationMaximumErrorMeters > 350) failures.push("validation-maximum");
  if (!input.visualIntegrityPassed) failures.push("visual-integrity");
  if (!input.textReadable) failures.push("text-readable");
  if (!input.boundsConfirmed) failures.push("bounds");
  if (!Number.isFinite(input.totalTileBytes) || input.totalTileBytes < 0 || input.totalTileBytes > 100 * 1024 * 1024) failures.push("tile-capacity");
  if (!input.packageVerified) failures.push("package-verification");
  return Object.freeze({ qualityGateVersion: 1, passed: failures.length === 0, failures: Object.freeze(failures) });
}

export function validateHistoricalRasterGeoreference(input) {
  const keys = input?.schemaVersion === 1 ? V1_GEOREFERENCE_KEYS : V2_GEOREFERENCE_KEYS;
  const value = object(input, "georeference", keys);
  if (![1, 2].includes(value.schemaVersion)) fail("georeference.schemaVersionが不正です");
  if (!HISTORICAL_RASTER_GEOREFERENCE_METHODS.includes(value.method)) fail("georeference.methodが不正です");
  const base = { schemaVersion: value.schemaVersion, rasterId: id(value.rasterId, "georeference.rasterId"), method: value.method, controlPointCount: integer(value.controlPointCount, "georeference.controlPointCount", 1, 10000), software: text(value.software, "georeference.software", 160), softwareVersion: text(value.softwareVersion, "georeference.softwareVersion", 80), meanErrorMeters: nullableError(value.meanErrorMeters, "georeference.meanErrorMeters"), medianErrorMeters: nullableError(value.medianErrorMeters, "georeference.medianErrorMeters"), maximumErrorMeters: nullableError(value.maximumErrorMeters, "georeference.maximumErrorMeters"), geographicCoverageJa: text(value.geographicCoverageJa, "georeference.geographicCoverageJa", 500), distortionNoteJa: text(value.distortionNoteJa, "georeference.distortionNoteJa", 1000), adjacentSheetNoteJa: text(value.adjacentSheetNoteJa, "georeference.adjacentSheetNoteJa", 1000), controlPointsSha256: sha(value.controlPointsSha256, "georeference.controlPointsSha256"), transformationParametersSha256: sha(value.transformationParametersSha256, "georeference.transformationParametersSha256") };
  if (base.maximumErrorMeters !== null && [base.meanErrorMeters, base.medianErrorMeters].some((error) => error !== null && error > base.maximumErrorMeters)) fail("georeferenceの誤差値順序が不正です");
  if (value.schemaVersion === 1) return Object.freeze(base);
  const result = { ...base, validationPointCount: integer(value.validationPointCount, "georeference.validationPointCount", 1, 10000), validationMeanErrorMeters: finite(value.validationMeanErrorMeters, "georeference.validationMeanErrorMeters", 0, 100000), validationMedianErrorMeters: finite(value.validationMedianErrorMeters, "georeference.validationMedianErrorMeters", 0, 100000), validationP90ErrorMeters: finite(value.validationP90ErrorMeters, "georeference.validationP90ErrorMeters", 0, 100000), validationMaximumErrorMeters: finite(value.validationMaximumErrorMeters, "georeference.validationMaximumErrorMeters", 0, 100000), qualityGateVersion: integer(value.qualityGateVersion, "georeference.qualityGateVersion", 1, 1), qualityGatePassed: value.qualityGatePassed === true };
  if (result.qualityGatePassed && (result.controlPointCount < 8 || result.validationPointCount < 4)) fail("qualityGatePassedには8 transform点と4 validation点が必要です");
  if (result.validationMeanErrorMeters > result.validationMaximumErrorMeters || result.validationMedianErrorMeters > result.validationMaximumErrorMeters || result.validationP90ErrorMeters > result.validationMaximumErrorMeters) fail("validation誤差値順序が不正です");
  return Object.freeze(result);
}
