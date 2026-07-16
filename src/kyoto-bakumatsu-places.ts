import { LIMITS } from "./config";
import { KYOTO_SOURCE_REGISTRY } from "./kyoto-source-registry";
import { ValidationError } from "./validate";

export const KYOTO_BAKUMATSU_DATA_PATH =
  "data/kyoto-bakumatsu-places.geojson";
export const KYOTO_BAKUMATSU_DATASET_ID =
  "project-kyoto-bakumatsu-places" as const;

export const KYOTO_BOUNDS = Object.freeze({
  minLat: 34.85,
  maxLat: 35.12,
  minLon: 135.65,
  maxLon: 135.85,
});

export const KYOTO_PLACE_CATEGORIES = Object.freeze([
  "court-politics",
  "bakufu",
  "domain-residence",
  "shinsengumi",
  "incident",
  "battle",
  "residence",
  "memorial",
] as const);

export const LOCATION_BASES = Object.freeze([
  "extant-site",
  "official-historic-marker",
  "official-address",
  "historical-area",
  "memorial-location",
] as const);

export const HISTORICAL_SITE_STATUSES = Object.freeze([
  "extant",
  "rebuilt",
  "relocated",
  "destroyed",
  "marker-only",
  "approximate-area",
] as const);

export type KyotoPlaceCategory = (typeof KYOTO_PLACE_CATEGORIES)[number];
export type LocationBasis = (typeof LOCATION_BASES)[number];
export type HistoricalSiteStatus =
  (typeof HISTORICAL_SITE_STATUSES)[number];
export type CoordinateConfidence = "high" | "medium";

export interface KyotoBakumatsuPlace {
  id: string;
  nameJa: string;
  nameEn?: string;
  category: KyotoPlaceCategory;
  longitude: number;
  latitude: number;
  eraId: "bakumatsu";
  dateDisplayJa: string;
  startYear: number;
  endYear: number;
  summaryJa: string;
  locationBasis: LocationBasis;
  historicalSiteStatus: HistoricalSiteStatus;
  coordinateConfidence: CoordinateConfidence;
  locationNoteJa: string;
  sourceIds: readonly string[];
  sourceId: typeof KYOTO_BAKUMATSU_DATASET_ID;
}

const COLLECTION_KEYS = new Set(["type", "features"]);
const FEATURE_KEYS = new Set(["type", "geometry", "properties"]);
const GEOMETRY_KEYS = new Set(["type", "coordinates"]);
const PROPERTY_KEYS = new Set([
  "id",
  "nameJa",
  "nameEn",
  "category",
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
  "sourceId",
]);
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  required: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key) || !allowed.has(key)) {
      throw new ValidationError(`${label} に未許可プロパティがあります`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} の必須プロパティがありません`);
    }
  }
}

function assertDepth(value: unknown, depth = 0): void {
  if (depth > 10) throw new ValidationError("データのネストが深すぎます");
  if (Array.isArray(value)) {
    for (const item of value) assertDepth(item, depth + 1);
  } else if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new ValidationError("危険なプロパティ名があります");
      }
      assertDepth(item, depth + 1);
    }
  }
}

function stringField(
  value: unknown,
  label: string,
  minLength: number,
  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > maxLength ||
    CONTROL_CHARS.test(value) ||
    HTML_PATTERN.test(value) ||
    MARKDOWN_LINK_PATTERN.test(value)
  ) {
    throw new ValidationError(`${label} が不正です`);
  }
  return value;
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`${label} が有限数ではありません`);
  }
  return value;
}

function enumField<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ValidationError(`${label} が許可リスト外です`);
  }
  return value as T;
}

function parseFeature(value: unknown): KyotoBakumatsuPlace {
  if (!isRecord(value)) throw new ValidationError("Feature が不正です");
  assertExactKeys(value, FEATURE_KEYS, ["type", "geometry", "properties"], "Feature");
  if (value["type"] !== "Feature" || !isRecord(value["geometry"])) {
    throw new ValidationError("Point Feature ではありません");
  }
  const geometry = value["geometry"];
  assertExactKeys(geometry, GEOMETRY_KEYS, ["type", "coordinates"], "geometry");
  if (geometry["type"] !== "Point") {
    throw new ValidationError("Point 以外のジオメトリは受け付けません");
  }
  const coordinates = geometry["coordinates"];
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    throw new ValidationError("座標形式が不正です");
  }
  const longitude = numberField(coordinates[0], "longitude");
  const latitude = numberField(coordinates[1], "latitude");
  if (
    latitude < KYOTO_BOUNDS.minLat ||
    latitude > KYOTO_BOUNDS.maxLat ||
    longitude < KYOTO_BOUNDS.minLon ||
    longitude > KYOTO_BOUNDS.maxLon
  ) {
    throw new ValidationError("京都bounds外の座標です");
  }

  if (!isRecord(value["properties"])) {
    throw new ValidationError("properties が不正です");
  }
  const properties = value["properties"];
  assertExactKeys(
    properties,
    PROPERTY_KEYS,
    [
      "id",
      "nameJa",
      "category",
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
      "sourceId",
    ],
    "properties",
  );

  const id = stringField(properties["id"], "id", 1, 64);
  if (!ID_PATTERN.test(id)) throw new ValidationError("id の形式が不正です");
  if (properties["eraId"] !== "bakumatsu") {
    throw new ValidationError("eraId が固定値と一致しません");
  }
  if (properties["sourceId"] !== KYOTO_BAKUMATSU_DATASET_ID) {
    throw new ValidationError("sourceId が固定値と一致しません");
  }
  const startYear = numberField(properties["startYear"], "startYear");
  const endYear = numberField(properties["endYear"], "endYear");
  if (
    !Number.isInteger(startYear) ||
    !Number.isInteger(endYear) ||
    startYear < 1853 ||
    endYear > 1868 ||
    startYear > endYear
  ) {
    throw new ValidationError("年代範囲が不正です");
  }
  const rawSourceIds = properties["sourceIds"];
  if (!Array.isArray(rawSourceIds) || rawSourceIds.length < 1 || rawSourceIds.length > 6) {
    throw new ValidationError("sourceIds が不正です");
  }
  const sourceIds = rawSourceIds.map((sourceId) => {
    const parsed = stringField(sourceId, "sourceId", 1, 64);
    if (!ID_PATTERN.test(parsed) || !Object.hasOwn(KYOTO_SOURCE_REGISTRY, parsed)) {
      throw new ValidationError("未登録のsourceIdです");
    }
    return parsed;
  });
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new ValidationError("sourceIds が重複しています");
  }

  const place: KyotoBakumatsuPlace = {
    id,
    nameJa: stringField(properties["nameJa"], "nameJa", 1, 80),
    category: enumField(
      properties["category"],
      KYOTO_PLACE_CATEGORIES,
      "category",
    ),
    longitude,
    latitude,
    eraId: "bakumatsu",
    dateDisplayJa: stringField(
      properties["dateDisplayJa"],
      "dateDisplayJa",
      1,
      80,
    ),
    startYear,
    endYear,
    summaryJa: stringField(properties["summaryJa"], "summaryJa", 80, 220),
    locationBasis: enumField(
      properties["locationBasis"],
      LOCATION_BASES,
      "locationBasis",
    ),
    historicalSiteStatus: enumField(
      properties["historicalSiteStatus"],
      HISTORICAL_SITE_STATUSES,
      "historicalSiteStatus",
    ),
    coordinateConfidence: enumField(
      properties["coordinateConfidence"],
      ["high", "medium"] as const,
      "coordinateConfidence",
    ),
    locationNoteJa: stringField(
      properties["locationNoteJa"],
      "locationNoteJa",
      20,
      220,
    ),
    sourceIds: Object.freeze(sourceIds),
    sourceId: KYOTO_BAKUMATSU_DATASET_ID,
  };
  if (properties["nameEn"] !== undefined) {
    place.nameEn = stringField(properties["nameEn"], "nameEn", 1, 100);
  }
  return Object.freeze(place);
}

export function parseKyotoBakumatsuGeoJson(
  text: string,
): readonly KyotoBakumatsuPlace[] {
  if (new TextEncoder().encode(text).byteLength > 1024 * 1024) {
    throw new ValidationError("データサイズが上限を超えています");
  }
  if (text.includes("\uFFFD")) {
    throw new ValidationError("UTF-8として正しく読み取れません");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError("JSONとして解析できません");
  }
  assertDepth(parsed);
  if (!isRecord(parsed)) throw new ValidationError("FeatureCollectionではありません");
  assertExactKeys(parsed, COLLECTION_KEYS, ["type", "features"], "FeatureCollection");
  if (parsed["type"] !== "FeatureCollection" || !Array.isArray(parsed["features"])) {
    throw new ValidationError("FeatureCollectionではありません");
  }
  if (parsed["features"].length < 30 || parsed["features"].length > 50) {
    throw new ValidationError("京都地点数が30〜50件ではありません");
  }
  const places = parsed["features"].map(parseFeature);
  const ids = new Set<string>();
  const coordinates = new Set<string>();
  for (const place of places) {
    if (ids.has(place.id)) throw new ValidationError("地点IDが重複しています");
    ids.add(place.id);
    const coordinateKey = `${place.longitude.toFixed(6)},${place.latitude.toFixed(6)}`;
    if (coordinates.has(coordinateKey)) {
      throw new ValidationError("地点座標が重複しています");
    }
    coordinates.add(coordinateKey);
  }
  return Object.freeze(places);
}

function validContentType(value: string | null): boolean {
  if (!value) return false;
  const [mediaType, ...parameters] = value.toLowerCase().split(";").map((part) => part.trim());
  if (mediaType !== "application/geo+json" && mediaType !== "application/json") {
    return false;
  }
  return parameters.every(
    (parameter) => !parameter.startsWith("charset=") || parameter === "charset=utf-8",
  );
}

export async function loadKyotoBakumatsuPlaces(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<readonly KyotoBakumatsuPlace[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.fetchTimeoutMs);
  try {
    const response = await fetch(baseUrl + KYOTO_BAKUMATSU_DATA_PATH, {
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
    });
    if (response.status !== 200 || !validContentType(response.headers.get("content-type"))) {
      throw new ValidationError("京都・幕末データの応答が不正です");
    }
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader !== null && Number(lengthHeader) > 1024 * 1024) {
      throw new ValidationError("データサイズが上限を超えています");
    }
    return parseKyotoBakumatsuGeoJson(await response.text());
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new Error("京都・幕末データを取得できませんでした");
  } finally {
    clearTimeout(timer);
  }
}
