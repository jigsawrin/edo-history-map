import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertManifestMatchesDefinition,
  HISTORICAL_RASTER_LIMITS,
  validateHistoricalRasterManifest,
} from "../src/historical-raster-manifest.mjs";

function fail(message) { throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function portableRelative(root, path) { return relative(root, path).replaceAll("\\", "/"); }

function pngDimensions(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(signature) || buffer.subarray(12, 16).toString("ascii") !== "IHDR") fail("PNG magic bytesまたはIHDRが不正です");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
}

function webpDimensions(buffer) {
  if (buffer.length < 25 || buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WEBP" || buffer.subarray(12, 16).toString("ascii") !== "VP8L" || buffer[20] !== 0x2f) fail("lossless WebP magic bytesが不正です");
  const width = 1 + ((buffer[21] | (buffer[22] << 8)) & 0x3fff);
  const height = 1 + (((buffer[22] >> 6) | (buffer[23] << 2) | (buffer[24] << 10)) & 0x3fff);
  return { width, height, format: "webp" };
}

export function inspectHistoricalRasterImage(buffer, expectedFormat) {
  const dimensions = expectedFormat === "png" ? pngDimensions(buffer) : webpDimensions(buffer);
  if (dimensions.format !== expectedFormat) fail("画像magic bytesとtileFormatが一致しません");
  if (dimensions.width !== HISTORICAL_RASTER_LIMITS.tileSize || dimensions.height !== HISTORICAL_RASTER_LIMITS.tileSize) fail("タイル画像寸法は256x256である必要があります");
  return Object.freeze(dimensions);
}

function scanTileRoot(tileRoot) {
  const root = realpathSync(tileRoot);
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = join(directory, entry.name);
      const metadata = lstatSync(full);
      if (metadata.isSymbolicLink()) fail(`symlinkは禁止です: ${portableRelative(root, full)}`);
      if (metadata.isDirectory()) walk(full);
      else if (metadata.isFile()) files.push(portableRelative(root, full));
      else fail(`通常ファイル以外は禁止です: ${portableRelative(root, full)}`);
    }
  };
  walk(root);
  return { root, files: files.sort() };
}

export function verifyHistoricalRasterPackage({ manifestPath, tileRoot, definition }) {
  const manifestFull = resolve(manifestPath);
  const rootFull = resolve(tileRoot ?? dirname(manifestFull));
  const manifestMetadata = lstatSync(manifestFull);
  const rootMetadata = lstatSync(rootFull);
  if (manifestMetadata.isSymbolicLink() || !manifestMetadata.isFile()) fail("tile manifestはsymlinkではない通常ファイルである必要があります");
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) fail("tile rootはsymlinkではない通常ディレクトリである必要があります");
  const manifestBuffer = readFileSync(manifestFull);
  if (manifestBuffer.length > 1024 * 1024) fail("tile manifestが大きすぎます");
  const manifest = validateHistoricalRasterManifest(JSON.parse(manifestBuffer.toString("utf8")));
  if (definition) assertManifestMatchesDefinition(manifest, definition);
  const scan = scanTileRoot(rootFull);
  const actualFiles = scan.files.filter((path) => path !== "tile-manifest.json");
  const expectedPaths = new Set(manifest.files.map((file) => file.path));
  for (const path of actualFiles) {
    const lower = path.toLowerCase();
    if (lower.endsWith(".svg") || lower.endsWith(".html") || lower.endsWith(".zip") || (!lower.endsWith(".png") && !lower.endsWith(".webp"))) fail(`禁止または未対応ファイルです: ${path}`);
    if (!expectedPaths.has(path)) fail(`manifest外のorphan tileです: ${path}`);
  }
  if (actualFiles.length !== manifest.files.length) fail("manifest登録済みタイル数と実ファイル数が一致しません");
  let totalBytes = 0;
  for (const file of manifest.files) {
    const full = resolve(scan.root, ...file.path.split("/"));
    if (portableRelative(scan.root, full).startsWith("../")) fail("tile path traversalを検出しました");
    let metadata;
    try { metadata = lstatSync(full); } catch { fail(`manifest登録済みタイルが欠損しています: ${file.path}`); }
    if (metadata.isSymbolicLink() || !metadata.isFile()) fail(`manifest登録先が通常ファイルではありません: ${file.path}`);
    if (realpathSync(full) !== full) fail(`tileの実パスが固定root外です: ${file.path}`);
    const stat = statSync(full);
    if (stat.size !== file.bytes || stat.size > HISTORICAL_RASTER_LIMITS.maxTileBytes) fail(`bytesが一致しません: ${file.path}`);
    const buffer = readFileSync(full);
    if (sha256(buffer) !== file.sha256) fail(`SHA-256が一致しません: ${file.path}`);
    const dimensions = inspectHistoricalRasterImage(buffer, manifest.tileFormat);
    if (dimensions.width !== file.width || dimensions.height !== file.height) fail(`画像寸法がmanifestと一致しません: ${file.path}`);
    totalBytes += stat.size;
  }
  if (totalBytes !== manifest.totalBytes || totalBytes > HISTORICAL_RASTER_LIMITS.maxTotalBytes) fail("総容量がmanifestと一致しないか上限を超えています");
  return Object.freeze({ manifest, manifestSha256: sha256(manifestBuffer), tileCount: manifest.files.length, totalBytes });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath = process.argv[2] ? resolve(process.argv[2]) : join(root, "tests", "fixtures", "historical-rasters", "project-grid", "tile-manifest.json");
  const tileRoot = process.argv[3] ? resolve(process.argv[3]) : join(dirname(manifestPath), "tiles");
  const result = verifyHistoricalRasterPackage({ manifestPath, tileRoot });
  console.log(`古地図ラスターパッケージ検証: ${result.tileCount}タイル、${result.totalBytes} bytes、manifest SHA-256 ${result.manifestSha256}`);
}
