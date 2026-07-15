/**
 * 江戸マップ地名データセット(CODH, CC BY 4.0)の CSV を
 * 本アプリ用の GeoJSON へ変換する。
 *
 * 使い方:
 *   node scripts/convert-owariya.mjs <owariya.csv のパス>
 *
 * 原データ CSV はリポジトリに含めない(公式配布元から取得する)。
 * 出典: 『江戸マップ地名データセット』(ROIS-DS人文学オープンデータ共同利用センター作成)
 *        doi:10.20676/00000445  CC BY 4.0
 * 加工内容: 項目の抽出(地名・分類・緯度経度・収載図名・詳細URL)、
 *           GeoJSON への変換、東京23区周辺への範囲限定。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BOUNDS = { minLat: 35.4, maxLat: 35.95, minLon: 139.4, maxLon: 140.05 };
const ALLOWED_SOURCE_PREFIX = "https://codh.rois.ac.jp/";
const MAX_FIELD_LENGTH = 300;

const BOM = new RegExp("^\\uFEFF");
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const TRAILING_CR = new RegExp("\\r$");

const csvPath = process.argv[2];
if (!csvPath) {
  console.error("usage: node scripts/convert-owariya.mjs <owariya.csv>");
  process.exit(1);
}

/** 引用符対応の最小限 CSV パーサ */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(TRAILING_CR, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field.replace(TRAILING_CR, ""));
    rows.push(row);
  }
  return rows;
}

const text = readFileSync(csvPath, "utf8").replace(BOM, "");
const rows = parseCsv(text);
const header = rows[0];
const idx = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`column not found: ${name}`);
  return i;
};

const col = {
  id: idx("entry_id"),
  body: idx("body"),
  neClass: idx("ne_class"),
  lat: idx("latitude"),
  lon: idx("longitude"),
  desc: idx("description"),
  source: idx("source"),
};

const clean = (s) =>
  String(s ?? "")
    .replace(CONTROL_CHARS, "")
    .slice(0, MAX_FIELD_LENGTH);

const features = [];
let skipped = 0;
for (const row of rows.slice(1)) {
  if (row.length < header.length) continue;
  const lat = Number(row[col.lat]);
  const lon = Number(row[col.lon]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    skipped++;
    continue;
  }
  if (
    lat < BOUNDS.minLat ||
    lat > BOUNDS.maxLat ||
    lon < BOUNDS.minLon ||
    lon > BOUNDS.maxLon
  ) {
    skipped++;
    continue;
  }
  const source = clean(row[col.source]);
  features.push({
    type: "Feature",
    geometry: {
      type: "Point",
      // 座標は小数6桁(約0.1m)で十分。ファイルサイズ削減。
      coordinates: [Number(lon.toFixed(6)), Number(lat.toFixed(6))],
    },
    properties: {
      id: clean(row[col.id]),
      name: clean(row[col.body]),
      category: clean(row[col.neClass]),
      sheet: clean(row[col.desc]),
      source: source.startsWith(ALLOWED_SOURCE_PREFIX) ? source : "",
    },
  });
}

const geojson = {
  type: "FeatureCollection",
  // 出典メタデータ(機械可読)
  attribution:
    "『江戸マップ地名データセット』(ROIS-DS人文学オープンデータ共同利用センター作成) doi:10.20676/00000445 CC BY 4.0",
  license: "CC-BY-4.0",
  features,
};

const outDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "data",
);
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "edo-places.geojson");
writeFileSync(outPath, JSON.stringify(geojson));
console.log(
  `wrote ${features.length} features (skipped ${skipped}) -> public/data/edo-places.geojson`,
);
