import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const CURATION_PATH = join(ROOT, "data-curation", "shiga-sengoku-places.json");
export const SOURCE_REGISTRY_PATH = join(ROOT, "src", "shiga-source-registry.json");
export const OUTPUT_PATH = join(ROOT, "public", "data", "shiga-sengoku-places.geojson");

const DATASET_ID = "project-shiga-sengoku-places";
const BOUNDS = Object.freeze({ minLat: 34.8, maxLat: 35.75, minLon: 135.7, maxLon: 136.55 });
const CATEGORIES = new Set(["castle", "battle", "politics", "temple-shrine", "residence", "transport", "memorial", "other"]);
const LOCATION_BASES = new Set(["official-marker", "existing-remains", "official-address", "historical-area", "memorial-site", "reconstructed-site", "archaeological-site"]);
const SITE_STATUSES = new Set(["extant", "ruins", "destroyed", "marker-only", "rebuilt", "relocated", "approximate-area", "memorial", "archaeological-remains"]);
const ALLOWED_SOURCE_ORIGINS = new Set([
  "https://www.pref.shiga.lg.jp",
  "https://geoshape.ex.nii.ac.jp",
  "https://msearch.gsi.go.jp",
  "https://www.city.nagahama.lg.jp",
  "https://bunka.nii.ac.jp",
]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const CURATED_KEYS = new Set([
  "id", "nameJa", "nameEn", "category", "municipalityJa", "eraId", "dateDisplayJa",
  "summaryJa", "locationBasis", "historicalSiteStatus", "coordinateConfidence",
  "locationNoteJa", "longitude", "latitude", "sourceIds",
]);
const REQUIRED_CURATED_KEYS = [...CURATED_KEYS].filter(
  (key) => key !== "nameEn" && key !== "eraId",
);
const SOURCE_KEYS = new Set(["id", "titleJa", "providerJa", "url", "accessedAt", "noteJa"]);

function fail(message) { throw new Error(message); }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }

function assertDepth(value, depth = 0) {
  if (depth > 8) fail("ネストが深すぎます");
  if (Array.isArray(value)) for (const item of value) assertDepth(item, depth + 1);
  else if (isRecord(value)) for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail("危険なプロパティ名があります");
    assertDepth(item, depth + 1);
  }
}

function exactKeys(value, allowed, required, label) {
  if (!isRecord(value)) fail(`${label} がオブジェクトではありません`);
  for (const key of Object.keys(value)) if (FORBIDDEN_KEYS.has(key) || !allowed.has(key)) fail(`${label} に未許可プロパティ ${key} があります`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`${label} に ${key} がありません`);
}

function text(value, label, min, max) {
  if (typeof value !== "string" || value.length < min || value.length > max || CONTROL_CHARS.test(value) || HTML_PATTERN.test(value) || MARKDOWN_LINK_PATTERN.test(value)) fail(`${label} が不正です`);
  return value;
}

function finite(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${label} が有限数ではありません`);
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
  if (!Array.isArray(sourceData) || sourceData.length === 0) fail("出典レジストリが空です");
  const registry = new Map();
  for (const source of sourceData) {
    exactKeys(source, SOURCE_KEYS, ["id", "titleJa", "providerJa", "url", "accessedAt"], "出典");
    const id = text(source.id, "出典ID", 1, 64);
    if (!ID_PATTERN.test(id) || registry.has(id)) fail("出典IDが不正または重複しています");
    const url = new URL(text(source.url, "出典URL", 1, 500));
    if (url.protocol !== "https:" || !ALLOWED_SOURCE_ORIGINS.has(url.origin) || url.username || url.password) fail(`未許可の出典URLです: ${url.origin}`);
    if (source.accessedAt !== "2026-07-17") fail("出典の調査日が不正です");
    text(source.titleJa, "出典名", 1, 180);
    text(source.providerJa, "提供者", 1, 120);
    if (source.noteJa !== undefined) text(source.noteJa, "出典注記", 1, 240);
    registry.set(id, Object.freeze({ ...source }));
  }
  return registry;
}

export function validateCuratedPlaces(curationData, sourceRegistry) {
  if (!Array.isArray(curationData) || curationData.length < 30 || curationData.length > 50) fail("採用地点数は30〜50件でなければなりません");
  const ids = new Set();
  const names = new Set();
  const coordinates = new Set();
  return curationData.map((place, index) => {
    const label = `地点${index + 1}`;
    exactKeys(place, CURATED_KEYS, REQUIRED_CURATED_KEYS, label);
    const id = text(place.id, `${label}.id`, 1, 64);
    if (!ID_PATTERN.test(id) || ids.has(id)) fail("地点IDが不正または重複しています");
    ids.add(id);
    const nameJa = text(place.nameJa, `${label}.nameJa`, 1, 80);
    if (names.has(nameJa)) fail("地点名が重複しています");
    names.add(nameJa);
    if (place.nameEn !== undefined) text(place.nameEn, `${label}.nameEn`, 1, 120);
    if (!CATEGORIES.has(place.category) || place.category === "other") fail(`${label}.categoryが不正です`);
    text(place.municipalityJa, `${label}.municipalityJa`, 1, 30);
    if (place.eraId !== undefined && place.eraId !== "sengoku") fail(`${label}.eraIdが不正です`);
    text(place.dateDisplayJa, `${label}.dateDisplayJa`, 1, 80);
    text(place.summaryJa, `${label}.summaryJa`, 50, 240);
    text(place.locationNoteJa, `${label}.locationNoteJa`, 20, 240);
    if (!LOCATION_BASES.has(place.locationBasis)) fail(`${label}.locationBasisが不正です`);
    if (!SITE_STATUSES.has(place.historicalSiteStatus)) fail(`${label}.historicalSiteStatusが不正です`);
    if (place.coordinateConfidence !== "high" && place.coordinateConfidence !== "medium") fail(`${label}.coordinateConfidenceが不正です`);
    const longitude = Math.round(finite(place.longitude, `${label}.longitude`) * 1e6) / 1e6;
    const latitude = Math.round(finite(place.latitude, `${label}.latitude`) * 1e6) / 1e6;
    if (latitude < BOUNDS.minLat || latitude > BOUNDS.maxLat || longitude < BOUNDS.minLon || longitude > BOUNDS.maxLon) fail(`${label}が滋賀bounds外です`);
    const coordinateKey = `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
    if (coordinates.has(coordinateKey)) fail("地点座標が重複しています");
    coordinates.add(coordinateKey);
    if (!Array.isArray(place.sourceIds) || place.sourceIds.length < 1 || place.sourceIds.length > 6) fail(`${label}.sourceIdsが不正です`);
    const sourceIds = place.sourceIds.map((sourceId) => {
      const value = text(sourceId, `${label}.sourceId`, 1, 64);
      if (!sourceRegistry.has(value)) fail(`${label}に未登録出典があります`);
      return value;
    });
    if (new Set(sourceIds).size !== sourceIds.length) fail(`${label}.sourceIdsが重複しています`);
    return Object.freeze({ ...place, longitude, latitude, sourceIds: Object.freeze(sourceIds) });
  });
}

export function createGeoJson(curatedPlaces) {
  const features = [...curatedPlaces].sort((a, b) => a.id.localeCompare(b.id, "en")).map(({ longitude, latitude, ...properties }) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    properties: { ...properties, eraId: "sengoku", sourceId: DATASET_ID },
  }));
  return { type: "FeatureCollection", features };
}

export function buildShigaGeoJson() {
  const sources = validateSources(readJson(SOURCE_REGISTRY_PATH));
  const places = validateCuratedPlaces(readJson(CURATION_PATH), sources);
  const output = `${JSON.stringify(createGeoJson(places), null, 2)}\n`;
  const sha256 = createHash("sha256").update(output).digest("hex");
  const counts = { category: {}, confidence: { high: 0, medium: 0 }, municipality: {}, locationBasis: {}, historicalSiteStatus: {} };
  for (const place of places) {
    for (const [bucket, key] of [[counts.category, place.category], [counts.municipality, place.municipalityJa], [counts.locationBasis, place.locationBasis], [counts.historicalSiteStatus, place.historicalSiteStatus]]) bucket[key] = (bucket[key] ?? 0) + 1;
    counts.confidence[place.coordinateConfidence] += 1;
  }
  return { output, sha256, featureCount: places.length, sourceCount: sources.size, counts };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const built = buildShigaGeoJson();
  writeFileSync(OUTPUT_PATH, built.output, "utf8");
  console.log(`滋賀・戦国GeoJSON: ${built.featureCount}件`);
  console.log(`出典: ${built.sourceCount}件`);
  console.log(`SHA-256: ${built.sha256}`);
  console.log(JSON.stringify(built.counts, null, 2));
}
