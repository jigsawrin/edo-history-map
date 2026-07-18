export const HISTORICAL_RASTER_MANIFEST_SCHEMA_VERSION = 1;
export const HISTORICAL_RASTER_LIMITS = Object.freeze({
  maxTileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
  maxTileCount: 20000,
  tileSize: 256,
  maxZoom: 22,
});

const SHA256 = /^[0-9a-f]{64}$/u;
const MANIFEST_KEYS = new Set([
  "schemaVersion", "rasterId", "sourceId", "regionId", "eraId",
  "tileScheme", "tileFormat", "tileSize", "minZoom", "maxZoom",
  "maxNativeZoom", "bounds", "originalFileSha256",
  "georeferenceMetadataSha256", "tileCount", "totalBytes", "files",
]);
const BOUNDS_KEYS = new Set(["south", "west", "north", "east"]);
const FILE_KEYS = new Set(["path", "sha256", "bytes", "width", "height"]);

function fail(message) { throw new Error(message); }
function exactObject(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label}がオブジェクトではありません`);
  for (const key of Object.keys(value)) if (!keys.has(key)) fail(`${label}.${key}は未定義項目です`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${label}.${key}がありません`);
  return value;
}
function id(value, label) { if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)) fail(`${label}が不正です`); return value; }
function integer(value, label, min, max) { if (!Number.isInteger(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function finite(value, label, min, max) { if (!Number.isFinite(value) || value < min || value > max) fail(`${label}が範囲外です`); return value; }
function sha(value, label) { if (typeof value !== "string" || !SHA256.test(value)) fail(`${label}がSHA-256ではありません`); return value; }

export function parseHistoricalRasterTilePath(value, format, minZoom, maxZoom) {
  if (typeof value !== "string" || value.length > 240 || value.startsWith("/") || value.includes("\\") || value.includes(":") || value.includes("..") || value.includes("?") || value.includes("#")) fail("tile pathが不正です");
  const match = value.match(/^(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)\/(0|[1-9][0-9]*)\.(png|webp)$/u);
  if (!match || match[4] !== format) fail("tile pathの形式または拡張子が不正です");
  const zoom = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!Number.isSafeInteger(zoom) || zoom < minZoom || zoom > maxZoom) fail("tile pathのzoomが範囲外です");
  const axisLimit = 2 ** zoom;
  if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x >= axisLimit || y >= axisLimit) fail("tile pathのXYZ座標が範囲外です");
  return Object.freeze({ zoom, x, y, format });
}

export function validateHistoricalRasterManifest(input) {
  const value = exactObject(input, "manifest", MANIFEST_KEYS);
  if (value.schemaVersion !== HISTORICAL_RASTER_MANIFEST_SCHEMA_VERSION) fail("manifest.schemaVersionが不正です");
  if (value.tileScheme !== "xyz") fail("manifest.tileSchemeはxyzだけを許可します");
  if (value.tileFormat !== "png" && value.tileFormat !== "webp") fail("manifest.tileFormatが不正です");
  const minZoom = integer(value.minZoom, "manifest.minZoom", 0, HISTORICAL_RASTER_LIMITS.maxZoom);
  const maxZoom = integer(value.maxZoom, "manifest.maxZoom", minZoom, HISTORICAL_RASTER_LIMITS.maxZoom);
  const maxNativeZoom = integer(value.maxNativeZoom, "manifest.maxNativeZoom", minZoom, maxZoom);
  const boundsValue = exactObject(value.bounds, "manifest.bounds", BOUNDS_KEYS);
  const bounds = Object.freeze({
    south: finite(boundsValue.south, "manifest.bounds.south", -90, 90),
    west: finite(boundsValue.west, "manifest.bounds.west", -180, 180),
    north: finite(boundsValue.north, "manifest.bounds.north", -90, 90),
    east: finite(boundsValue.east, "manifest.bounds.east", -180, 180),
  });
  if (bounds.south >= bounds.north || bounds.west >= bounds.east) fail("manifest.boundsの順序が不正です");
  if (!Array.isArray(value.files) || value.files.length === 0 || value.files.length > HISTORICAL_RASTER_LIMITS.maxTileCount) fail("manifest.filesの件数が不正です");
  const paths = new Set();
  const files = value.files.map((inputFile, index) => {
    const file = exactObject(inputFile, `manifest.files[${index}]`, FILE_KEYS);
    parseHistoricalRasterTilePath(file.path, value.tileFormat, minZoom, maxZoom);
    if (paths.has(file.path)) fail("manifest.filesのpathが重複しています");
    paths.add(file.path);
    return Object.freeze({
      path: file.path,
      sha256: sha(file.sha256, `manifest.files[${index}].sha256`),
      bytes: integer(file.bytes, `manifest.files[${index}].bytes`, 1, HISTORICAL_RASTER_LIMITS.maxTileBytes),
      width: integer(file.width, `manifest.files[${index}].width`, HISTORICAL_RASTER_LIMITS.tileSize, HISTORICAL_RASTER_LIMITS.tileSize),
      height: integer(file.height, `manifest.files[${index}].height`, HISTORICAL_RASTER_LIMITS.tileSize, HISTORICAL_RASTER_LIMITS.tileSize),
    });
  });
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (value.tileCount !== files.length) fail("manifest.tileCountがfiles件数と一致しません");
  if (!Number.isSafeInteger(value.totalBytes) || value.totalBytes !== totalBytes || totalBytes > HISTORICAL_RASTER_LIMITS.maxTotalBytes) fail("manifest.totalBytesが不正です");
  return Object.freeze({
    schemaVersion: HISTORICAL_RASTER_MANIFEST_SCHEMA_VERSION,
    rasterId: id(value.rasterId, "manifest.rasterId"),
    sourceId: id(value.sourceId, "manifest.sourceId"),
    regionId: id(value.regionId, "manifest.regionId"),
    eraId: id(value.eraId, "manifest.eraId"),
    tileScheme: "xyz",
    tileFormat: value.tileFormat,
    tileSize: integer(value.tileSize, "manifest.tileSize", HISTORICAL_RASTER_LIMITS.tileSize, HISTORICAL_RASTER_LIMITS.tileSize),
    minZoom,
    maxZoom,
    maxNativeZoom,
    bounds,
    originalFileSha256: sha(value.originalFileSha256, "manifest.originalFileSha256"),
    georeferenceMetadataSha256: sha(value.georeferenceMetadataSha256, "manifest.georeferenceMetadataSha256"),
    tileCount: files.length,
    totalBytes,
    files: Object.freeze(files),
  });
}

export function assertManifestMatchesDefinition(manifest, definition) {
  const expectedBounds = {
    south: definition.bounds[0][0], west: definition.bounds[0][1],
    north: definition.bounds[1][0], east: definition.bounds[1][1],
  };
  for (const [field, expected] of [
    ["rasterId", definition.id], ["sourceId", definition.sourceId],
    ["regionId", definition.regionId], ["eraId", definition.eraId],
    ["tileFormat", definition.tileFormat], ["tileSize", definition.tileSize],
    ["minZoom", definition.minZoom], ["maxZoom", definition.maxZoom],
    ["maxNativeZoom", definition.maxNativeZoom],
  ]) if (manifest[field] !== expected) fail(`manifest.${field}が定義と一致しません`);
  for (const field of Object.keys(expectedBounds)) if (manifest.bounds[field] !== expectedBounds[field]) fail(`manifest.bounds.${field}が定義と一致しません`);
  return manifest;
}
