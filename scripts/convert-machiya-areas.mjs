import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDecoder } from "node:util";

const EXPECTED_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';
const SOURCE_ID = "codh-edo-machiya-areas";
const SOURCE_BOUNDS = {
  minLon: 139.4,
  maxLon: 140.05,
  minLat: 35.4,
  maxLat: 35.95,
};
const LIMITS = {
  maxInputBytes: 4 * 1024 * 1024,
  maxRecords: 200,
  maxPartsPerRecord: 500,
  maxPointsPerRecord: 5000,
  maxTotalPoints: 50000,
  maxStringLength: 100,
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function roundCoordinate(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function sanitizeSourceText(value) {
  return [...String(value)]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !((code >= 0 && code <= 31) || (code >= 127 && code <= 159));
    })
    .join("")
    .normalize("NFC")
    .trim()
    .slice(0, LIMITS.maxStringLength);
}

function signedArea(ring) {
  let twiceArea = 0;
  for (let index = 0; index + 1 < ring.length; index++) {
    const current = ring[index];
    const next = ring[index + 1];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return twiceArea / 2;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const currentPoint = ring[current];
    const previousPoint = ring[previous];
    if (
      currentPoint[1] > point[1] !== previousPoint[1] > point[1] &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) +
          currentPoint[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function orientRing(ring, counterclockwise) {
  const isCounterclockwise = signedArea(ring) > 0;
  return isCounterclockwise === counterclockwise ? ring : [...ring].reverse();
}

function ringsToGeometry(rings, warnings, recordNumber) {
  const outers = [];
  const holes = [];
  for (const ring of rings) {
    const area = signedArea(ring);
    if (area < 0) outers.push({ ring, holes: [], area: Math.abs(area) });
    else if (area > 0) holes.push(ring);
    else {
      warnings.push(`record ${recordNumber}: 面積0の閉じたringを外周として保持`);
      outers.push({ ring, holes: [], area: 0 });
    }
  }
  assert(outers.length > 0, `record ${recordNumber}: 外周ringがありません`);

  for (const hole of holes) {
    const containing = outers
      .filter((outer) => pointInRing(hole[0], outer.ring))
      .sort((left, right) => left.area - right.area)[0];
    assert(containing, `record ${recordNumber}: 外周に属さない穴ringがあります`);
    containing.holes.push(hole);
  }

  const polygons = outers.map((outer) => [
    orientRing(outer.ring, true),
    ...outer.holes.map((hole) => orientRing(hole, false)),
  ]);
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
}

function parseDbf(buffer) {
  assert(buffer.length >= 33, "DBFヘッダーが短すぎます");
  assert(buffer[0] === 0x03, "対応していないDBF形式です");
  const recordCount = buffer.readUInt32LE(4);
  const headerLength = buffer.readUInt16LE(8);
  const recordLength = buffer.readUInt16LE(10);
  assert(recordCount > 0 && recordCount <= LIMITS.maxRecords, "DBFレコード数が上限外です");
  assert(headerLength >= 33 && headerLength <= buffer.length, "DBFヘッダー長が不正です");
  assert(recordLength > 1, "DBFレコード長が不正です");
  assert(headerLength + recordCount * recordLength <= buffer.length, "DBFが途中で切れています");

  const fields = [];
  for (let offset = 32; offset + 32 <= headerLength; offset += 32) {
    if (buffer[offset] === 0x0d) break;
    const zero = buffer.indexOf(0, offset);
    const name = buffer
      .subarray(offset, zero < 0 || zero > offset + 11 ? offset + 11 : zero)
      .toString("ascii");
    const type = String.fromCharCode(buffer[offset + 11]);
    const length = buffer[offset + 16];
    assert(name && (type === "C" || type === "N") && length > 0, "DBFフィールド定義が不正です");
    fields.push({ name, type, length });
  }
  assert(fields.some((field) => field.name === "fid"), "DBFにfidがありません");
  assert(fields.some((field) => field.name === "map"), "DBFにmapがありません");

  const decoder = new TextDecoder("utf-8", { fatal: true });
  const rows = [];
  for (let rowIndex = 0; rowIndex < recordCount; rowIndex++) {
    const rowOffset = headerLength + rowIndex * recordLength;
    assert(buffer[rowOffset] === 0x20 || buffer[rowOffset] === 0x2a, "DBF削除フラグが不正です");
    let fieldOffset = rowOffset + 1;
    const values = {};
    for (const field of fields) {
      const raw = buffer.subarray(fieldOffset, fieldOffset + field.length);
      values[field.name] = decoder.decode(raw).trim();
      fieldOffset += field.length;
    }
    rows.push({ deleted: buffer[rowOffset] === 0x2a, values });
  }
  return rows;
}

function parseShp(buffer) {
  assert(buffer.length >= 100 && buffer.length <= LIMITS.maxInputBytes, "SHPサイズが上限外です");
  assert(buffer.readInt32BE(0) === 9994, "SHP file codeが不正です");
  assert(buffer.readInt32BE(24) * 2 === buffer.length, "SHPヘッダーのファイル長が一致しません");
  assert(buffer.readInt32LE(28) === 1000, "対応していないSHP versionです");
  assert(buffer.readInt32LE(32) === 5, "Polygon以外のShapefileは変換できません");

  const headerBounds = [
    buffer.readDoubleLE(36),
    buffer.readDoubleLE(44),
    buffer.readDoubleLE(52),
    buffer.readDoubleLE(60),
  ];
  assert(headerBounds.every(Number.isFinite), "SHP boundsが有限数ではありません");

  const records = [];
  const warnings = [];
  let excludedRings = 0;
  let totalPoints = 0;
  let offset = 100;
  let expectedRecordNumber = 1;
  while (offset + 8 <= buffer.length) {
    const recordNumber = buffer.readInt32BE(offset);
    const contentBytes = buffer.readInt32BE(offset + 4) * 2;
    assert(recordNumber === expectedRecordNumber, "SHPレコード番号が連続していません");
    assert(contentBytes >= 44 && offset + 8 + contentBytes <= buffer.length, "SHPレコードが途中で切れています");
    const body = offset + 8;
    assert(buffer.readInt32LE(body) === 5, `record ${recordNumber}: Polygon以外のgeometryです`);
    const numParts = buffer.readInt32LE(body + 36);
    const numPoints = buffer.readInt32LE(body + 40);
    assert(numParts > 0 && numParts <= LIMITS.maxPartsPerRecord, `record ${recordNumber}: part数が上限外です`);
    assert(numPoints > 0 && numPoints <= LIMITS.maxPointsPerRecord, `record ${recordNumber}: 頂点数が上限外です`);
    totalPoints += numPoints;
    assert(totalPoints <= LIMITS.maxTotalPoints, "SHP総頂点数が上限を超えています");
    const expectedBytes = 44 + numParts * 4 + numPoints * 16;
    assert(contentBytes === expectedBytes, `record ${recordNumber}: Polygonデータ長が一致しません`);

    const partStarts = Array.from({ length: numParts }, (_, index) =>
      buffer.readInt32LE(body + 44 + index * 4),
    );
    assert(partStarts[0] === 0, `record ${recordNumber}: 最初のpartが0から始まりません`);
    for (let index = 0; index < partStarts.length; index++) {
      assert(
        partStarts[index] >= 0 &&
          partStarts[index] < numPoints &&
          (index === 0 || partStarts[index] > partStarts[index - 1]),
        `record ${recordNumber}: part indexが不正です`,
      );
    }

    const pointsOffset = body + 44 + numParts * 4;
    const rings = partStarts.map((start, partIndex) => {
      const end = partStarts[partIndex + 1] ?? numPoints;
      assert(end - start >= 4, `record ${recordNumber}: ringの頂点が4未満です`);
      const ring = Array.from({ length: end - start }, (_, pointIndex) => {
        const pointOffset = pointsOffset + (start + pointIndex) * 16;
        const lon = buffer.readDoubleLE(pointOffset);
        const lat = buffer.readDoubleLE(pointOffset + 8);
        assert(Number.isFinite(lon) && Number.isFinite(lat), `record ${recordNumber}: NaN/Infinity座標です`);
        assert(lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90, `record ${recordNumber}: 世界座標範囲外です`);
        return [roundCoordinate(lon), roundCoordinate(lat)];
      });
      const first = ring[0];
      const last = ring.at(-1);
      assert(first[0] === last[0] && first[1] === last[1], `record ${recordNumber}: ringが閉じていません`);
      const distinct = new Set(ring.slice(0, -1).map((point) => point.join(",")));
      if (distinct.size < 3 || signedArea(ring) === 0) {
        excludedRings++;
        warnings.push(
          `record ${recordNumber} part ${partIndex + 1}: 小数6桁丸め後に縮退したringを除外`,
        );
        return null;
      }
      return ring;
    }).filter((ring) => ring !== null);
    assert(rings.length > 0, `record ${recordNumber}: 有効なringがありません`);
    records.push({ recordNumber, rings, numPoints });
    offset += 8 + contentBytes;
    expectedRecordNumber++;
  }
  assert(offset === buffer.length, "SHP末尾に不正なバイトがあります");
  assert(records.length > 0 && records.length <= LIMITS.maxRecords, "SHPレコード数が上限外です");
  return { records, headerBounds, totalPoints, warnings, excludedRings };
}

function geometryCoordinates(geometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function isInsideSourceBounds(geometry) {
  return geometryCoordinates(geometry).every((polygon) =>
    polygon.every((ring) =>
      ring.every(
        ([lon, lat]) =>
          lon >= SOURCE_BOUNDS.minLon &&
          lon <= SOURCE_BOUNDS.maxLon &&
          lat >= SOURCE_BOUNDS.minLat &&
          lat <= SOURCE_BOUNDS.maxLat,
      ),
    ),
  );
}

export function convertMachiyaShapefile({ shp, dbf, prj, cpg }) {
  assert(prj.trim() === EXPECTED_PRJ, "座標参照系が公式配布物のWGS 84定義と一致しません");
  assert(cpg.trim().toUpperCase() === "UTF-8", "DBF文字コードがUTF-8ではありません");
  const parsedShp = parseShp(shp);
  const rows = parseDbf(dbf);
  assert(rows.length === parsedShp.records.length, "SHPとDBFのレコード数が一致しません");

  const warnings = [...parsedShp.warnings];
  let excluded = 0;
  const features = [];
  for (let index = 0; index < parsedShp.records.length; index++) {
    const record = parsedShp.records[index];
    const row = rows[index];
    if (row.deleted) {
      excluded++;
      warnings.push(`record ${record.recordNumber}: DBFで削除済みのため除外`);
      continue;
    }
    const geometry = ringsToGeometry(record.rings, warnings, record.recordNumber);
    if (!isInsideSourceBounds(geometry)) {
      excluded++;
      warnings.push(`record ${record.recordNumber}: 東京23区周辺bounds外のため除外`);
      continue;
    }
    const sourceSheetId = sanitizeSourceText(row.values.fid);
    const sourceSheetName = sanitizeSourceText(row.values.map);
    assert(/^\d{1,3}$/.test(sourceSheetId), `record ${record.recordNumber}: fidが不正です`);
    assert(sourceSheetName.length > 0, `record ${record.recordNumber}: mapが空です`);
    features.push({
      type: "Feature",
      geometry,
      properties: {
        id: `machiya-${sourceSheetId.padStart(2, "0")}`,
        sourceSheetId,
        sourceSheetName,
        category: "machiya-area",
        eraId: "edo-late",
        positionConfidence: "estimated",
        sourceId: SOURCE_ID,
      },
    });
  }
  features.sort(
    (left, right) =>
      Number(left.properties.sourceSheetId) - Number(right.properties.sourceSheetId) ||
      left.properties.id.localeCompare(right.properties.id, "en"),
  );
  const collection = { type: "FeatureCollection", features };
  const text = `${JSON.stringify(collection)}\n`;
  return {
    collection,
    text,
    stats: {
      inputRecords: parsedShp.records.length,
      outputFeatures: features.length,
      excluded,
      excludedRings: parsedShp.excludedRings,
      warnings,
      polygonFeatures: features.filter((feature) => feature.geometry.type === "Polygon").length,
      multiPolygonFeatures: features.filter((feature) => feature.geometry.type === "MultiPolygon").length,
      totalVertices: features.reduce(
        (total, feature) =>
          total +
          geometryCoordinates(feature.geometry).reduce(
            (polygonTotal, polygon) =>
              polygonTotal + polygon.reduce((ringTotal, ring) => ringTotal + ring.length, 0),
            0,
          ),
        0,
      ),
      sourceBounds: parsedShp.headerBounds.map(roundCoordinate),
      outputBytes: Buffer.byteLength(text),
      outputSha256: createHash("sha256").update(text).digest("hex"),
      simplification: "none",
      coordinateRoundingDigits: 6,
    },
  };
}

function companionPath(shpPath, extension) {
  return shpPath.slice(0, -extname(shpPath).length) + extension;
}

export function convertMachiyaShapefileFile(inputPath, outputPath) {
  const shpPath = resolve(inputPath);
  const destination = resolve(outputPath);
  assert(extname(shpPath).toLowerCase() === ".shp", "入力は.shpファイルに限定しています");
  assert(extname(destination).toLowerCase() === ".geojson", "出力は.geojsonファイルに限定しています");
  assert(existsSync(shpPath) && statSync(shpPath).isFile(), "入力Shapefileが見つかりません");
  const paths = {
    dbf: companionPath(shpPath, ".dbf"),
    prj: companionPath(shpPath, ".prj"),
    cpg: companionPath(shpPath, ".cpg"),
  };
  for (const [kind, path] of Object.entries(paths)) {
    assert(existsSync(path) && statSync(path).isFile(), `同名の.${kind}ファイルが見つかりません`);
  }
  const result = convertMachiyaShapefile({
    shp: readFileSync(shpPath),
    dbf: readFileSync(paths.dbf),
    prj: readFileSync(paths.prj, "utf8"),
    cpg: readFileSync(paths.cpg, "utf8"),
  });
  const temporary = `${destination}.tmp`;
  writeFileSync(temporary, result.text, { encoding: "utf8", flag: "w" });
  renameSync(temporary, destination);
  return result.stats;
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const input = process.argv[2];
  const output = process.argv[3] ?? join(process.cwd(), "public", "data", "edo-machiya-areas.geojson");
  if (!input) {
    console.error("使用法: node scripts/convert-machiya-areas.mjs <入力.shp> [出力.geojson]");
    process.exitCode = 1;
  } else {
    try {
      const stats = convertMachiyaShapefileFile(input, output);
      console.log(JSON.stringify(stats, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : "変換に失敗しました");
      process.exitCode = 1;
    }
  }
}
