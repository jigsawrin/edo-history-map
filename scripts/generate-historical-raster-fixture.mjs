import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = join(ROOT, "tests", "fixtures", "historical-rasters", "project-grid");
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function gridPng(accent) {
  const size = 256; const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4); row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = 1 + x * 4; const grid = x % 32 === 0 || y % 32 === 0; const axis = x === 128 || y === 128;
      const color = axis ? accent : grid ? [45, 45, 45] : [248, 245, 232];
      row[offset] = color[0]; row[offset + 1] = color[1]; row[offset + 2] = color[2]; row[offset + 3] = 255;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const controlPoints = {
  schemaVersion: 1, rasterId: "project-grid", imageWidth: 512, imageHeight: 256,
  points: [
    { id: "cp-001", pixelX: 8, pixelY: 8, latitude: 35.70, longitude: 139.70, basisJa: "プロジェクト自作格子の左上検証点", confidence: "high", sourceIds: ["project-generated-fixture"] },
    { id: "cp-002", pixelX: 503, pixelY: 8, latitude: 35.70, longitude: 139.80, basisJa: "プロジェクト自作格子の右上検証点", confidence: "high", sourceIds: ["project-generated-fixture"] },
    { id: "cp-003", pixelX: 8, pixelY: 247, latitude: 35.60, longitude: 139.70, basisJa: "プロジェクト自作格子の左下検証点", confidence: "high", sourceIds: ["project-generated-fixture"] },
    { id: "cp-004", pixelX: 503, pixelY: 247, latitude: 35.60, longitude: 139.80, basisJa: "プロジェクト自作格子の右下検証点", confidence: "high", sourceIds: ["project-generated-fixture"] },
  ],
};
const controlText = json(controlPoints);
const georeference = {
  schemaVersion: 1, rasterId: "project-grid", method: "projective", controlPointCount: 4,
  software: "プロジェクト内決定的fixture生成器", softwareVersion: "1",
  meanErrorMeters: 0, medianErrorMeters: 0, maximumErrorMeters: 0,
  geographicCoverageJa: "テスト専用の架空格子範囲", distortionNoteJa: "実在する古地図ではなく、歪み検証用の自作格子です。",
  adjacentSheetNoteJa: "2タイルの境界だけを検証し、実在シートとの関係はありません。",
  controlPointsSha256: sha256(controlText), transformationParametersSha256: sha256("project-grid-transform-v1\n"),
};
const georeferenceText = json(georeference);
const tiles = [
  ["1/0/0.png", gridPng([176, 35, 35])],
  ["1/1/0.png", gridPng([26, 87, 150])],
];
for (const [path, buffer] of tiles) { const output = join(OUTPUT, "tiles", path); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, buffer); }
writeFileSync(join(OUTPUT, "control-points.json"), controlText, "utf8");
writeFileSync(join(OUTPUT, "georeference.json"), georeferenceText, "utf8");
const files = tiles.map(([path, buffer]) => ({ path, sha256: sha256(buffer), bytes: buffer.length, width: 256, height: 256 }));
const manifest = {
  schemaVersion: 1, rasterId: "project-grid", sourceId: "project-generated-fixture", regionId: "edo", eraId: "edo-late",
  tileScheme: "xyz", tileFormat: "png", tileSize: 256, minZoom: 1, maxZoom: 1, maxNativeZoom: 1,
  bounds: { south: 35.60, west: 139.70, north: 35.70, east: 139.80 },
  originalFileSha256: sha256("project-generated-test-grid-v1\n"), georeferenceMetadataSha256: sha256(georeferenceText),
  tileCount: files.length, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0), files,
};
writeFileSync(join(OUTPUT, "tile-manifest.json"), json(manifest), "utf8");
console.log(`テスト専用古地図fixtureを生成しました: ${files.length}タイル、${manifest.totalBytes} bytes`);
