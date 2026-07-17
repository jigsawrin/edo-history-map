import { LIMITS } from "./config";
import { SHIGA_SOURCE_REGISTRY } from "./shiga-source-registry";
import { ValidationError } from "./validate";

export const SHIGA_SENGOKU_DATA_PATH = "data/shiga-sengoku-places.geojson";
export const SHIGA_SENGOKU_DATASET_ID = "project-shiga-sengoku-places" as const;
export const SHIGA_BOUNDS = Object.freeze({ minLat: 34.8, maxLat: 35.75, minLon: 135.7, maxLon: 136.55 });
export const SHIGA_PLACE_CATEGORIES = Object.freeze([
  "castle", "battle", "politics", "temple-shrine", "residence", "transport", "memorial",
] as const);
export const SHIGA_LOCATION_BASES = Object.freeze([
  "official-marker", "existing-remains", "official-address", "historical-area", "memorial-site", "reconstructed-site", "archaeological-site",
] as const);
export const SHIGA_SITE_STATUSES = Object.freeze([
  "extant", "ruins", "destroyed", "marker-only", "rebuilt", "relocated", "approximate-area", "memorial", "archaeological-remains",
] as const);

export type ShigaPlaceCategory = (typeof SHIGA_PLACE_CATEGORIES)[number];
export type ShigaLocationBasis = (typeof SHIGA_LOCATION_BASES)[number];
export type ShigaHistoricalSiteStatus = (typeof SHIGA_SITE_STATUSES)[number];
export type ShigaCoordinateConfidence = "high" | "medium";

export interface ShigaSengokuPlace {
  readonly id: string;
  readonly nameJa: string;
  readonly nameEn?: string;
  readonly category: ShigaPlaceCategory;
  readonly municipalityJa: string;
  readonly longitude: number;
  readonly latitude: number;
  readonly eraId: "sengoku";
  readonly dateDisplayJa: string;
  readonly summaryJa: string;
  readonly locationBasis: ShigaLocationBasis;
  readonly historicalSiteStatus: ShigaHistoricalSiteStatus;
  readonly coordinateConfidence: ShigaCoordinateConfidence;
  readonly locationNoteJa: string;
  readonly sourceIds: readonly string[];
  readonly sourceId: typeof SHIGA_SENGOKU_DATASET_ID;
}

const COLLECTION_KEYS = new Set(["type", "features"]);
const FEATURE_KEYS = new Set(["type", "geometry", "properties"]);
const GEOMETRY_KEYS = new Set(["type", "coordinates"]);
const PROPERTY_KEYS = new Set([
  "id", "nameJa", "nameEn", "category", "municipalityJa", "eraId", "dateDisplayJa",
  "summaryJa", "locationBasis", "historicalSiteStatus", "coordinateConfidence",
  "locationNoteJa", "sourceIds", "sourceId",
]);
const REQUIRED_PROPERTIES = [...PROPERTY_KEYS].filter((key) => key !== "nameEn");
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, required: readonly string[], label: string): void {
  for (const key of Object.keys(value)) if (FORBIDDEN_KEYS.has(key) || !allowed.has(key)) throw new ValidationError(`${label} に未許可プロパティがあります`);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} の必須プロパティがありません`);
}

function assertDepth(value: unknown, depth = 0): void {
  if (depth > 10) throw new ValidationError("データのネストが深すぎます");
  if (Array.isArray(value)) for (const item of value) assertDepth(item, depth + 1);
  else if (isRecord(value)) for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new ValidationError("危険なプロパティ名があります");
    assertDepth(item, depth + 1);
  }
}

function text(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string" || value.length < min || value.length > max || CONTROL_CHARS.test(value) || HTML_PATTERN.test(value) || MARKDOWN_LINK_PATTERN.test(value)) throw new ValidationError(`${label} が不正です`);
  return value;
}

function number(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ValidationError(`${label} が有限数ではありません`);
  return value;
}

function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new ValidationError(`${label} が許可リスト外です`);
  return value as T;
}

function parseFeature(value: unknown): ShigaSengokuPlace {
  if (!isRecord(value)) throw new ValidationError("Feature が不正です");
  exactKeys(value, FEATURE_KEYS, ["type", "geometry", "properties"], "Feature");
  if (value.type !== "Feature" || !isRecord(value.geometry)) throw new ValidationError("Point Feature ではありません");
  exactKeys(value.geometry, GEOMETRY_KEYS, ["type", "coordinates"], "geometry");
  if (value.geometry.type !== "Point" || !Array.isArray(value.geometry.coordinates) || value.geometry.coordinates.length !== 2) throw new ValidationError("Point座標形式が不正です");
  const longitude = number(value.geometry.coordinates[0], "longitude");
  const latitude = number(value.geometry.coordinates[1], "latitude");
  if (latitude < SHIGA_BOUNDS.minLat || latitude > SHIGA_BOUNDS.maxLat || longitude < SHIGA_BOUNDS.minLon || longitude > SHIGA_BOUNDS.maxLon) throw new ValidationError("滋賀bounds外の座標です");
  if (!isRecord(value.properties)) throw new ValidationError("properties が不正です");
  const properties = value.properties;
  exactKeys(properties, PROPERTY_KEYS, REQUIRED_PROPERTIES, "properties");
  const id = text(properties.id, "id", 1, 64);
  if (!ID_PATTERN.test(id)) throw new ValidationError("id の形式が不正です");
  if (properties.eraId !== "sengoku" || properties.sourceId !== SHIGA_SENGOKU_DATASET_ID) throw new ValidationError("固定IDが一致しません");
  if (!Array.isArray(properties.sourceIds) || properties.sourceIds.length < 1 || properties.sourceIds.length > 6) throw new ValidationError("sourceIds が不正です");
  const sourceIds = properties.sourceIds.map((sourceId) => {
    const parsed = text(sourceId, "sourceId", 1, 64);
    if (!ID_PATTERN.test(parsed) || !Object.hasOwn(SHIGA_SOURCE_REGISTRY, parsed)) throw new ValidationError("未登録のsourceIdです");
    return parsed;
  });
  if (new Set(sourceIds).size !== sourceIds.length) throw new ValidationError("sourceIds が重複しています");
  const place: ShigaSengokuPlace = Object.freeze({
    id,
    nameJa: text(properties.nameJa, "nameJa", 1, 80),
    category: choice(properties.category, SHIGA_PLACE_CATEGORIES, "category"),
    municipalityJa: text(properties.municipalityJa, "municipalityJa", 1, 30),
    longitude, latitude, eraId: "sengoku",
    dateDisplayJa: text(properties.dateDisplayJa, "dateDisplayJa", 1, 80),
    summaryJa: text(properties.summaryJa, "summaryJa", 50, 240),
    locationBasis: choice(properties.locationBasis, SHIGA_LOCATION_BASES, "locationBasis"),
    historicalSiteStatus: choice(properties.historicalSiteStatus, SHIGA_SITE_STATUSES, "historicalSiteStatus"),
    coordinateConfidence: choice(properties.coordinateConfidence, ["high", "medium"] as const, "coordinateConfidence"),
    locationNoteJa: text(properties.locationNoteJa, "locationNoteJa", 20, 240),
    sourceIds: Object.freeze(sourceIds), sourceId: SHIGA_SENGOKU_DATASET_ID,
    ...(properties.nameEn === undefined ? {} : { nameEn: text(properties.nameEn, "nameEn", 1, 120) }),
  });
  return place;
}

export function parseShigaSengokuGeoJson(input: string): readonly ShigaSengokuPlace[] {
  if (new TextEncoder().encode(input).byteLength > 1024 * 1024 || input.includes("\uFFFD")) throw new ValidationError("データサイズまたはUTF-8が不正です");
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new ValidationError("JSONとして解析できません"); }
  assertDepth(parsed);
  if (!isRecord(parsed)) throw new ValidationError("FeatureCollectionではありません");
  exactKeys(parsed, COLLECTION_KEYS, ["type", "features"], "FeatureCollection");
  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features) || parsed.features.length < 30 || parsed.features.length > 50) throw new ValidationError("滋賀地点数が30〜50件ではありません");
  const places = parsed.features.map(parseFeature);
  const ids = new Set<string>(); const coordinates = new Set<string>();
  for (const place of places) {
    if (ids.has(place.id)) throw new ValidationError("地点IDが重複しています");
    ids.add(place.id);
    const coordinate = `${place.longitude.toFixed(6)},${place.latitude.toFixed(6)}`;
    if (coordinates.has(coordinate)) throw new ValidationError("地点座標が重複しています");
    coordinates.add(coordinate);
  }
  return Object.freeze(places);
}

function validContentType(value: string | null): boolean {
  return value?.toLowerCase().split(";")[0]?.trim() === "application/geo+json";
}

export async function loadShigaSengokuPlaces(baseUrl = import.meta.env.BASE_URL): Promise<readonly ShigaSengokuPlace[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LIMITS.fetchTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}${SHIGA_SENGOKU_DATA_PATH}`, { signal: controller.signal, credentials: "omit", redirect: "error" });
    if (response.status !== 200 || response.redirected || !validContentType(response.headers.get("content-type"))) throw new ValidationError("滋賀データの応答が不正です");
    const contentLength = response.headers.get("content-length");
    if (contentLength !== null && Number(contentLength) > 1024 * 1024) throw new ValidationError("データサイズが上限を超えています");
    return parseShigaSengokuGeoJson(await response.text());
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new Error("滋賀・戦国データを取得できませんでした");
  } finally { clearTimeout(timeout); }
}
