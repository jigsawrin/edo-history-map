/**
 * CODH『江戸末期海岸線／水域データセット』の海岸線 PolyLine Shapefileを
 * 本アプリ用GeoJSONへ変換する。ダウンロードは行わない。
 *
 * 東京対象boundsと交差する元レコードを丸ごと保持し、切断・簡略化・平滑化・
 * 補間・結合は行わない。座標表記のみ公式Geoshape版と同じ小数6桁へ丸める。
 */
import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { extname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

export const COASTLINE_SOURCE_ID = "codh-edo-coastline";
export const REVIEWED_SHP_SHA256 =
  "9752dc2a75af14c1c3f7c9e20921a1cbfd728ba90463c3b62bc6f2c6b89cb392";
export const COASTLINE_TARGET_BOUNDS = Object.freeze({
  minLon: 139.4,
  minLat: 35.4,
  maxLon: 140.05,
  maxLat: 35.95,
});

const MAX_INPUT_BYTES = Object.freeze({
  shp: 16 * 1024 * 1024,
  dbf: 1024 * 1024,
  prj: 4096,
  cpg: 128,
});
const MAX_RECORDS = 5000;
const MAX_PARTS_PER_RECORD = 100;
const MAX_POINTS_PER_RECORD = 500000;
const MAX_TOTAL_POINTS = 1000000;
const MAX_STRING_LENGTH = 120;
const EXPECTED_NULL_RECORDS = Object.freeze([96, 1596]);
const EXPECTED_DUPLICATE_RECORDS = Object.freeze([1806]);
const WGS84_PRJ_TOKENS = [
  'GEOGCS["GCS_WGS_1984"',
  'DATUM["D_WGS_1984"',
  'SPHEROID["WGS_1984",6378137.0,298.257223563]',
  'UNIT["Degree",0.0174532925199433]',
];

export class CoastlineConversionError extends Error {
  constructor(message) {
    super(message);
    this.name = "CoastlineConversionError";
  }
}

function fail(message) {
  throw new CoastlineConversionError(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertBuffer(name, value, maxBytes) {
  if (!Buffer.isBuffer(value) || value.length === 0) fail(`${name}が空です`);
  if (value.length > maxBytes) fail(`${name}がサイズ上限を超えています`);
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 31) || (code >= 127 && code <= 159);
  });
}

function normalizeText(value, field) {
  const normalized = value.normalize("NFC").trim();
  if (!normalized || normalized.length > MAX_STRING_LENGTH || hasControlCharacter(normalized)) {
    fail(`${field}の文字列が不正です`);
  }
  return normalized;
}

function parseDbf(dbf) {
  if (dbf.length < 98) fail("DBFヘッダーが不正です");
  const recordCount = dbf.readUInt32LE(4);
  const headerLength = dbf.readUInt16LE(8);
  const recordLength = dbf.readUInt16LE(10);
  if (recordCount === 0 || recordCount > MAX_RECORDS) fail("DBFレコード数が不正です");
  if (headerLength < 65 || headerLength > dbf.length || recordLength < 2) {
    fail("DBFのヘッダー長またはレコード長が不正です");
  }
  if (headerLength + recordCount * recordLength > dbf.length) fail("DBFが途中で切れています");

  const fields = [];
  for (let offset = 32; offset + 32 <= headerLength && dbf[offset] !== 0x0d; offset += 32) {
    const nameEnd = dbf.indexOf(0, offset);
    const end = nameEnd > offset && nameEnd <= offset + 11 ? nameEnd : offset + 11;
    fields.push({
      name: dbf.subarray(offset, end).toString("ascii"),
      type: String.fromCharCode(dbf[offset + 11]),
      length: dbf[offset + 16],
    });
  }
  if (
    fields.length !== 2 ||
    fields[0]?.name !== "data_name" ||
    fields[0]?.type !== "C" ||
    fields[1]?.name !== "object_id" ||
    fields[1]?.type !== "C"
  ) {
    fail("DBF属性項目が許可リストと一致しません");
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const rows = [];
  for (let index = 0; index < recordCount; index++) {
    const rowOffset = headerLength + index * recordLength;
    if (dbf[rowOffset] === 0x2a) fail("DBFに削除レコードがあります");
    let fieldOffset = rowOffset + 1;
    const row = {};
    for (const field of fields) {
      let decoded;
      try {
        decoded = decoder.decode(dbf.subarray(fieldOffset, fieldOffset + field.length));
      } catch {
        fail("DBFがUTF-8ではありません");
      }
      row[field.name] = normalizeText(decoded, field.name);
      fieldOffset += field.length;
    }
    if (row.data_name !== "coastline" || row.object_id !== "1929") {
      fail("DBFの固定属性値が公式仕様と一致しません");
    }
    rows.push(row);
  }
  return rows;
}

function intersects(bounds, target) {
  return (
    bounds[2] >= target.minLon &&
    bounds[0] <= target.maxLon &&
    bounds[3] >= target.minLat &&
    bounds[1] <= target.maxLat
  );
}

function rounded(value) {
  return Number(value.toFixed(6));
}

function sameNumbers(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function parseShp(shp, rows, targetBounds) {
  if (shp.length < 100) fail("SHPヘッダーが不正です");
  if (shp.readInt32BE(0) !== 9994 || shp.readInt32LE(28) !== 1000) fail("SHP形式が不正です");
  if (shp.readInt32BE(24) * 2 !== shp.length) fail("SHP宣言サイズが実サイズと一致しません");
  if (shp.readInt32LE(32) !== 3) fail("SHPのShape TypeはPolyLineに限定しています");

  const sourceBounds = [36, 44, 52, 60].map((offset) => shp.readDoubleLE(offset));
  if (
    sourceBounds.some((value) => !Number.isFinite(value)) ||
    sourceBounds[0] < -180 || sourceBounds[2] > 180 ||
    sourceBounds[1] < -90 || sourceBounds[3] > 90 ||
    sourceBounds[0] > sourceBounds[2] || sourceBounds[1] > sourceBounds[3]
  ) fail("SHP boundsが不正です");

  const reviewedSource = sha256(shp) === REVIEWED_SHP_SHA256;
  const features = [];
  const nullRecords = [];
  const duplicateRecords = new Set();
  let totalInputVertices = 0;
  let totalInputParts = 0;
  let removedRoundedDuplicateCoordinates = 0;
  let offset = 100;
  let recordIndex = 0;

  while (offset < shp.length) {
    if (offset + 12 > shp.length) fail("SHPレコードヘッダーが途中で切れています");
    const recordNumber = shp.readInt32BE(offset);
    const contentBytes = shp.readInt32BE(offset + 4) * 2;
    const body = offset + 8;
    const end = body + contentBytes;
    recordIndex++;
    if (recordNumber !== recordIndex || contentBytes < 4 || end > shp.length) {
      fail("SHPレコード番号またはサイズが不正です");
    }
    const shapeType = shp.readInt32LE(body);
    if (shapeType === 0) {
      nullRecords.push(recordNumber);
      offset = end;
      continue;
    }
    if (shapeType !== 3 || contentBytes < 44) fail("PolyLine以外のgeometryがあります");

    const bounds = [0, 8, 16, 24].map((delta) => shp.readDoubleLE(body + 4 + delta));
    if (bounds.some((value) => !Number.isFinite(value))) fail("Feature boundsに非数値があります");
    const numParts = shp.readInt32LE(body + 36);
    const numPoints = shp.readInt32LE(body + 40);
    if (numParts < 1 || numParts > MAX_PARTS_PER_RECORD) fail("part数が不正です");
    if (numPoints < 2 || numPoints > MAX_POINTS_PER_RECORD) fail("Featureの頂点数が不正です");
    totalInputParts += numParts;
    totalInputVertices += numPoints;
    if (totalInputVertices > MAX_TOTAL_POINTS) fail("総頂点数が上限を超えています");

    const partsOffset = body + 44;
    const pointsOffset = partsOffset + numParts * 4;
    if (pointsOffset + numPoints * 16 !== end) fail("SHP PolyLineレコードサイズが不正です");
    const starts = Array.from({ length: numParts }, (_, index) => shp.readInt32LE(partsOffset + index * 4));
    if (starts[0] !== 0 || starts.some((start, index) => start < 0 || start >= numPoints || (index > 0 && start <= starts[index - 1]))) {
      fail("SHP part索引が不正です");
    }

    const lines = [];
    let recordHasDuplicate = false;
    for (let part = 0; part < numParts; part++) {
      const start = starts[part];
      const stop = starts[part + 1] ?? numPoints;
      if (stop - start < 2) fail("1点だけのLineStringがあります");
      const line = [];
      let previous = null;
      for (let point = start; point < stop; point++) {
        const lon = shp.readDoubleLE(pointsOffset + point * 16);
        const lat = shp.readDoubleLE(pointsOffset + point * 16 + 8);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) fail("座標にNaNまたはInfinityがあります");
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) fail("座標が世界範囲外です");
        if (previous?.[0] === lon && previous[1] === lat) recordHasDuplicate = true;
        previous = [lon, lat];
        line.push([lon, lat]);
      }
      lines.push(line);
    }
    if (recordHasDuplicate) duplicateRecords.add(recordNumber);

    if (intersects(bounds, targetBounds)) {
      if (recordHasDuplicate) fail("対象範囲のLineStringに連続する重複座標があります");
      const row = rows[recordIndex - 1];
      if (!row) fail("SHPとDBFのレコード数が一致しません");
      const outputLines = lines.map((sourceLine) => {
        const outputLine = [];
        for (const [lon, lat] of sourceLine) {
          const position = [rounded(lon), rounded(lat)];
          const previousPosition = outputLine.at(-1);
          if (
            previousPosition?.[0] === position[0] &&
            previousPosition[1] === position[1]
          ) {
            removedRoundedDuplicateCoordinates++;
            continue;
          }
          outputLine.push(position);
        }
        if (outputLine.length < 2) fail("丸め後にLineStringの頂点が2未満になりました");
        return outputLine;
      });
      features.push({
        type: "Feature",
        geometry: outputLines.length === 1
          ? { type: "LineString", coordinates: outputLines[0] }
          : { type: "MultiLineString", coordinates: outputLines },
        properties: {
          id: `edo-coastline-${String(recordNumber).padStart(4, "0")}`,
          sourceRecordNumber: recordNumber,
          sourceObjectId: row.object_id,
          category: "coastline",
          eraId: "edo-late",
          positionConfidence: "estimated",
          sourceId: COASTLINE_SOURCE_ID,
        },
      });
    }
    offset = end;
  }

  if (offset !== shp.length || recordIndex !== rows.length) fail("SHPとDBFのレコード数が一致しません");
  if (recordIndex > MAX_RECORDS || features.length === 0) fail("出力対象Featureがありません");
  if (nullRecords.length > 0 && (!reviewedSource || !sameNumbers(nullRecords, EXPECTED_NULL_RECORDS))) {
    fail("空geometryを含む未レビューの入力は変換できません");
  }
  const duplicateList = [...duplicateRecords];
  if (duplicateList.length > 0 && (!reviewedSource || !sameNumbers(duplicateList, EXPECTED_DUPLICATE_RECORDS))) {
    fail("連続する重複座標を含む未レビューの入力は変換できません");
  }

  return {
    features,
    sourceBounds,
    records: recordIndex,
    totalInputParts,
    totalInputVertices,
    nullRecords,
    duplicateRecords: duplicateList,
    removedRoundedDuplicateCoordinates,
  };
}

function validateSupportFiles(prj, cpg) {
  let prjText;
  let cpgText;
  try {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    prjText = decoder.decode(prj).trim();
    cpgText = decoder.decode(cpg).trim().toUpperCase();
  } catch {
    fail("PRJまたはCPGがUTF-8ではありません");
  }
  if (!WGS84_PRJ_TOKENS.every((token) => prjText.includes(token))) fail("CRSがWGS 84 (EPSG:4326)ではありません");
  if (cpgText !== "UTF-8") fail("DBF文字コードがUTF-8ではありません");
}

function countOutputVertices(feature) {
  return feature.geometry.type === "LineString"
    ? feature.geometry.coordinates.length
    : feature.geometry.coordinates.reduce((sum, line) => sum + line.length, 0);
}

export function convertHistoricalCoastlineShapefile({ shp, dbf, prj, cpg, targetBounds = COASTLINE_TARGET_BOUNDS }) {
  assertBuffer("SHP", shp, MAX_INPUT_BYTES.shp);
  assertBuffer("DBF", dbf, MAX_INPUT_BYTES.dbf);
  assertBuffer("PRJ", prj, MAX_INPUT_BYTES.prj);
  assertBuffer("CPG", cpg, MAX_INPUT_BYTES.cpg);
  validateSupportFiles(prj, cpg);
  const rows = parseDbf(dbf);
  const parsed = parseShp(shp, rows, targetBounds);
  const collection = { type: "FeatureCollection", features: parsed.features };
  const geojson = `${JSON.stringify(collection)}\n`;
  const outputBuffer = Buffer.from(geojson, "utf8");
  const geometryTypes = Object.fromEntries(
    [...new Set(parsed.features.map((feature) => feature.geometry.type))]
      .sort()
      .map((type) => [type, parsed.features.filter((feature) => feature.geometry.type === type).length]),
  );
  return {
    geojson,
    stats: {
      inputShpSha256: sha256(shp),
      inputRecords: parsed.records,
      inputParts: parsed.totalInputParts,
      inputVertices: parsed.totalInputVertices,
      inputBounds: parsed.sourceBounds,
      excludedNullRecords: parsed.nullRecords,
      excludedDuplicateCoordinateRecords: parsed.duplicateRecords,
      removedRoundedDuplicateCoordinates: parsed.removedRoundedDuplicateCoordinates,
      outputFeatures: parsed.features.length,
      outputGeometryTypes: geometryTypes,
      outputVertices: parsed.features.reduce((sum, feature) => sum + countOutputVertices(feature), 0),
      outputBytes: outputBuffer.length,
      outputSha256: sha256(outputBuffer),
      targetBounds,
      processing: "東京対象boundsと交差する元レコードを丸ごと抽出、小数6桁丸め、丸めで同一になった連続点を除去。切断・簡略化・平滑化・補間・結合なし。",
    },
  };
}

export function convertHistoricalCoastlineFile(inputPath, outputPath) {
  if (extname(inputPath).toLowerCase() !== ".shp") fail("入力拡張子は.shpに限定しています");
  const absolute = resolve(inputPath);
  const parsedPath = parse(absolute);
  const companion = (extension) => join(parsedPath.dir, `${parsedPath.name}${extension}`);
  const result = convertHistoricalCoastlineShapefile({
    shp: readFileSync(absolute),
    dbf: readFileSync(companion(".dbf")),
    prj: readFileSync(companion(".prj")),
    cpg: readFileSync(companion(".cpg")),
  });
  writeFileSync(outputPath, result.geojson, { encoding: "utf8", flag: "w" });
  return result.stats;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  const input = process.argv[2];
  const output = process.argv[3] ?? join(process.cwd(), "public", "data", "edo-coastlines.geojson");
  if (!input) {
    console.error("使用法: node scripts/convert-historical-coastline.mjs <入力.shp> [出力.geojson]");
    process.exitCode = 1;
  } else {
    try {
      const stats = convertHistoricalCoastlineFile(input, output);
      console.log(JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "海岸線変換に失敗しました");
      process.exitCode = 1;
    }
  }
}
