import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CURATION_PATH = join(
  ROOT,
  "data-curation",
  "kyoto-bakumatsu-places.json",
);
export const SOURCE_REGISTRY_PATH = join(
  ROOT,
  "src",
  "kyoto-source-registry.json",
);
export const OUTPUT_PATH = join(
  ROOT,
  "public",
  "data",
  "kyoto-bakumatsu-places.geojson",
);

const DATASET_ID = "project-kyoto-bakumatsu-places";
const BOUNDS = Object.freeze({
  minLat: 34.85,
  maxLat: 35.12,
  minLon: 135.65,
  maxLon: 135.85,
});
const CATEGORIES = new Set([
  "court-politics",
  "bakufu",
  "domain-residence",
  "shinsengumi",
  "incident",
  "battle",
  "residence",
  "memorial",
]);
const LOCATION_BASES = new Set([
  "extant-site",
  "official-historic-marker",
  "official-address",
  "historical-area",
  "memorial-location",
]);
const SITE_STATUSES = new Set([
  "extant",
  "rebuilt",
  "relocated",
  "destroyed",
  "marker-only",
  "approximate-area",
]);
const SOURCE_TYPES = new Set([
  "government",
  "archive",
  "museum",
  "university",
  "official-site",
  "academic-publication",
]);
const ALLOWED_SOURCE_ORIGINS = new Set([
  "https://www2.city.kyoto.lg.jp",
  "https://www.city.kyoto.lg.jp",
  "https://ja.kyoto.travel",
  "https://kyoto-museums.city.kyoto.lg.jp",
  "https://www.pref.kyoto.jp",
  "https://www.kyoto-arc.or.jp",
  "https://www.doshisha.ac.jp",
  "https://kurodani.jp",
  "https://bunka.nii.ac.jp",
  "https://shimogyo.city.kyoto.lg.jp",
  "https://myomanji.jp",
  "https://www.env.go.jp",
  "https://policies.env.go.jp",
  "https://nijo-jocastle.city.kyoto.lg.jp",
  "https://www.kunaicho.go.jp",
  "https://rmda.kulib.kyoto-u.ac.jp",
  "https://www.ndl.go.jp",
  "https://dl.ndl.go.jp",
  "https://www.archives.go.jp",
  "https://ryozen-museum.or.jp",
  "https://iwakura-tomomi.jp",
]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const CURATED_KEYS = new Set([
  "id",
  "nameJa",
  "nameEn",
  "category",
  "longitude",
  "latitude",
  "eraId",
  "dateDisplayJa",
  "startYear",
  "endYear",
  "summaryJa",
  "locationBasis",
  "historicalSiteStatus",
  "coordinateConfidence",
  "locationNoteJa",
  "sourceIds",
]);
const SOURCE_KEYS = new Set([
  "id",
  "title",
  "publisher",
  "url",
  "sourceType",
  "accessedAt",
  "usage",
]);

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertDepth(value, depth = 0) {
  if (depth > 8) fail("ネストが深すぎます");
  if (Array.isArray(value)) {
    for (const item of value) assertDepth(item, depth + 1);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) fail("危険なプロパティ名があります");
      assertDepth(item, depth + 1);
    }
  }
}

function exactKeys(value, allowed, required, label) {
  if (!isRecord(value)) fail(`${label} がオブジェクトではありません`);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || !allowed.has(key)) {
      fail(`${label} に未許可プロパティ ${key} があります`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} に ${key} がありません`);
  }
}

function text(value, label, min, max) {
  if (
    typeof value !== "string" ||
    value.length < min ||
    value.length > max ||
    CONTROL_CHARS.test(value) ||
    HTML_PATTERN.test(value) ||
    MARKDOWN_LINK_PATTERN.test(value)
  ) {
    fail(`${label} が不正です`);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} が有限数ではありません`);
  }
  return value;
}

function readJson(path) {
  const raw = readFileSync(path, "utf8");
  if (raw.includes("\uFFFD")) fail(`${relative(ROOT, path)} がUTF-8ではありません`);
  const parsed = JSON.parse(raw);
  assertDepth(parsed);
  return parsed;
}

export function validateSources(sourceData) {
  if (!Array.isArray(sourceData) || sourceData.length === 0) {
    fail("出典レジストリが空です");
  }
  const registry = new Map();
  for (const source of sourceData) {
    exactKeys(
      source,
      SOURCE_KEYS,
      ["id", "title", "publisher", "url", "sourceType", "accessedAt", "usage"],
      "出典",
    );
    const id = text(source.id, "出典ID", 1, 64);
    if (!ID_PATTERN.test(id) || registry.has(id)) fail("出典IDが不正または重複しています");
    const url = new URL(text(source.url, "出典URL", 1, 500));
    if (url.protocol !== "https:" || !ALLOWED_SOURCE_ORIGINS.has(url.origin)) {
      fail(`未許可の出典URL originです: ${url.origin}`);
    }
    if (!SOURCE_TYPES.has(source.sourceType)) fail("sourceTypeが不正です");
    if (source.accessedAt !== "2026-07-16" || source.usage !== "fact-reference") {
      fail("出典の調査日または用途が不正です");
    }
    text(source.title, "出典名", 1, 160);
    text(source.publisher, "提供者", 1, 120);
    registry.set(id, source);
  }
  return registry;
}

export function validateCuratedPlaces(curationData, sourceRegistry) {
  if (!Array.isArray(curationData) || curationData.length < 30 || curationData.length > 50) {
    fail("採用地点数は30〜50件でなければなりません");
  }
  const ids = new Set();
  const names = new Set();
  const coordinates = new Set();
  return curationData.map((place, index) => {
    const label = `地点${index + 1}`;
    exactKeys(
      place,
      CURATED_KEYS,
      [...CURATED_KEYS].filter((key) => key !== "nameEn"),
      label,
    );
    const id = text(place.id, `${label}.id`, 1, 64);
    if (!ID_PATTERN.test(id) || ids.has(id)) fail("地点IDが不正または重複しています");
    ids.add(id);
    const nameJa = text(place.nameJa, `${label}.nameJa`, 1, 80);
    if (names.has(nameJa)) fail("地点名が重複しています");
    names.add(nameJa);
    if (place.nameEn !== undefined) text(place.nameEn, `${label}.nameEn`, 1, 100);
    if (!CATEGORIES.has(place.category)) fail(`${label}.categoryが不正です`);
    const longitude = Math.round(finite(place.longitude, `${label}.longitude`) * 1e6) / 1e6;
    const latitude = Math.round(finite(place.latitude, `${label}.latitude`) * 1e6) / 1e6;
    if (
      latitude < BOUNDS.minLat || latitude > BOUNDS.maxLat ||
      longitude < BOUNDS.minLon || longitude > BOUNDS.maxLon
    ) {
      fail(`${label}が京都bounds外です`);
    }
    const coordinateKey = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
    if (coordinates.has(coordinateKey)) fail("地点座標が重複しています");
    coordinates.add(coordinateKey);
    if (place.eraId !== "bakumatsu") fail(`${label}.eraIdが不正です`);
    const startYear = finite(place.startYear, `${label}.startYear`);
    const endYear = finite(place.endYear, `${label}.endYear`);
    if (
      !Number.isInteger(startYear) || !Number.isInteger(endYear) ||
      startYear < 1853 || endYear > 1868 || startYear > endYear
    ) {
      fail(`${label}の年代範囲が不正です`);
    }
    text(place.dateDisplayJa, `${label}.dateDisplayJa`, 1, 80);
    text(place.summaryJa, `${label}.summaryJa`, 80, 220);
    text(place.locationNoteJa, `${label}.locationNoteJa`, 20, 220);
    if (!LOCATION_BASES.has(place.locationBasis)) fail(`${label}.locationBasisが不正です`);
    if (!SITE_STATUSES.has(place.historicalSiteStatus)) fail(`${label}.historicalSiteStatusが不正です`);
    if (place.coordinateConfidence !== "high" && place.coordinateConfidence !== "medium") {
      fail(`${label}.coordinateConfidenceが不正です`);
    }
    if (!Array.isArray(place.sourceIds) || place.sourceIds.length < 1 || place.sourceIds.length > 6) {
      fail(`${label}.sourceIdsが不正です`);
    }
    const sourceIds = place.sourceIds.map((sourceId) => {
      const value = text(sourceId, `${label}.sourceId`, 1, 64);
      if (!sourceRegistry.has(value)) fail(`${label}に未登録出典があります`);
      return value;
    });
    if (new Set(sourceIds).size !== sourceIds.length) fail(`${label}.sourceIdsが重複しています`);
    return { ...place, longitude, latitude, sourceIds };
  });
}

export function createGeoJson(curatedPlaces) {
  const features = [...curatedPlaces]
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
    .map(({ longitude, latitude, ...properties }) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [longitude, latitude] },
      properties: { ...properties, sourceId: DATASET_ID },
    }));
  return { type: "FeatureCollection", features };
}

export function buildKyotoGeoJson() {
  const sources = validateSources(readJson(SOURCE_REGISTRY_PATH));
  const places = validateCuratedPlaces(readJson(CURATION_PATH), sources);
  const output = `${JSON.stringify(createGeoJson(places), null, 2)}\n`;
  const sha256 = createHash("sha256").update(output).digest("hex");
  const counts = {
    category: Object.fromEntries([...CATEGORIES].map((key) => [key, 0])),
    confidence: { high: 0, medium: 0 },
    locationBasis: {},
    historicalSiteStatus: {},
  };
  for (const place of places) {
    counts.category[place.category] += 1;
    counts.confidence[place.coordinateConfidence] += 1;
    counts.locationBasis[place.locationBasis] = (counts.locationBasis[place.locationBasis] ?? 0) + 1;
    counts.historicalSiteStatus[place.historicalSiteStatus] =
      (counts.historicalSiteStatus[place.historicalSiteStatus] ?? 0) + 1;
  }
  return { output, sha256, featureCount: places.length, counts };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const built = buildKyotoGeoJson();
  writeFileSync(OUTPUT_PATH, built.output, "utf8");
  console.log(`京都・幕末GeoJSON: ${built.featureCount}件`);
  console.log(`SHA-256: ${built.sha256}`);
  console.log(JSON.stringify(built.counts, null, 2));
}
