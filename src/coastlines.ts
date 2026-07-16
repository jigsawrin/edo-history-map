import {
  COASTLINE_DATA_BOUNDS,
  COASTLINE_DATA_PATH,
  COASTLINE_LIMITS,
  DATA_BOUNDS,
} from "./config";

export type CoastlinePosition = [number, number];

export interface CoastlineProperties {
  id: string;
  sourceRecordNumber: number;
  sourceObjectId: "1929";
  category: "coastline";
  eraId: "edo-late";
  positionConfidence: "estimated";
  sourceId: "codh-edo-coastline";
}

export interface CoastlineFeature {
  type: "Feature";
  geometry:
    | { type: "LineString"; coordinates: CoastlinePosition[] }
    | { type: "MultiLineString"; coordinates: CoastlinePosition[][] };
  properties: CoastlineProperties;
}

export interface CoastlineCollection {
  type: "FeatureCollection";
  features: CoastlineFeature[];
}

export class CoastlineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoastlineValidationError";
  }
}

function fail(message: string): never {
  throw new CoastlineValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectStructure(value: unknown, depth = 0): void {
  if (depth > COASTLINE_LIMITS.maxDepth) fail("GeoJSONのネストが深すぎます");
  if (Array.isArray(value)) {
    for (const item of value) inspectStructure(item, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("GeoJSONに不正なオブジェクトがあります");
  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      fail("GeoJSONに禁止されたプロパティがあります");
    }
    inspectStructure(child, depth + 1);
  }
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) fail("GeoJSONに未許可のプロパティがあります");
}

function requiredString(value: unknown, expected?: string): string {
  const controls = typeof value === "string" && [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code >= 0 && code <= 31) || (code >= 127 && code <= 159);
  });
  if (typeof value !== "string" || value.length === 0 || value.length > COASTLINE_LIMITS.maxStringLength || controls) {
    fail("海岸線の文字列プロパティが不正です");
  }
  if (expected !== undefined && value !== expected) fail("海岸線の固定プロパティが一致しません");
  return value;
}

function validatePosition(value: unknown): CoastlinePosition {
  if (!Array.isArray(value) || value.length !== 2) fail("座標は経度・緯度の2要素が必要です");
  const [lon, lat] = value;
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    fail("座標にNaN、Infinityまたはnullがあります");
  }
  if (
    lon < COASTLINE_DATA_BOUNDS.minLon || lon > COASTLINE_DATA_BOUNDS.maxLon ||
    lat < COASTLINE_DATA_BOUNDS.minLat || lat > COASTLINE_DATA_BOUNDS.maxLat
  ) fail("海岸線が許可bounds外です");
  return [lon, lat];
}

function validateLine(value: unknown): CoastlinePosition[] {
  if (!Array.isArray(value) || value.length < 2) fail("LineStringの頂点が2未満です");
  const line = value.map(validatePosition);
  for (let index = 1; index < line.length; index++) {
    if (line[index - 1]?.[0] === line[index]?.[0] && line[index - 1]?.[1] === line[index]?.[1]) {
      fail("LineStringに連続する重複座標があります");
    }
  }
  return line;
}

function validateProperties(value: unknown): CoastlineProperties {
  if (!isRecord(value)) fail("海岸線propertiesがありません");
  exactKeys(value, ["id", "sourceRecordNumber", "sourceObjectId", "category", "eraId", "positionConfidence", "sourceId"]);
  if (!Number.isInteger(value.sourceRecordNumber) || (value.sourceRecordNumber as number) < 1 || (value.sourceRecordNumber as number) > 5000) {
    fail("海岸線の元レコード番号が不正です");
  }
  return {
    id: requiredString(value.id),
    sourceRecordNumber: value.sourceRecordNumber as number,
    sourceObjectId: requiredString(value.sourceObjectId, "1929") as "1929",
    category: requiredString(value.category, "coastline") as "coastline",
    eraId: requiredString(value.eraId, "edo-late") as "edo-late",
    positionConfidence: requiredString(value.positionConfidence, "estimated") as "estimated",
    sourceId: requiredString(value.sourceId, "codh-edo-coastline") as "codh-edo-coastline",
  };
}

function intersectsTokyo(lines: CoastlinePosition[][]): boolean {
  return lines.some((line) => line.some(([lon, lat]) =>
    lon >= DATA_BOUNDS.minLon && lon <= DATA_BOUNDS.maxLon &&
    lat >= DATA_BOUNDS.minLat && lat <= DATA_BOUNDS.maxLat));
}

export function validateCoastlineCollection(value: unknown): CoastlineCollection {
  inspectStructure(value);
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    fail("海岸線データはFeatureCollectionではありません");
  }
  exactKeys(value, ["type", "features"]);
  if (value.features.length === 0 || value.features.length > COASTLINE_LIMITS.maxFeatures) fail("海岸線Feature数が不正です");

  const ids = new Set<string>();
  let totalVertices = 0;
  const features = value.features.map((raw): CoastlineFeature => {
    if (!isRecord(raw) || raw.type !== "Feature" || !isRecord(raw.geometry)) fail("海岸線Featureが不正です");
    exactKeys(raw, ["type", "geometry", "properties"]);
    exactKeys(raw.geometry, ["type", "coordinates"]);
    const geometryType = raw.geometry.type;
    let lines: CoastlinePosition[][];
    let geometry: CoastlineFeature["geometry"];
    if (geometryType === "LineString") {
      const coordinates = validateLine(raw.geometry.coordinates);
      lines = [coordinates];
      geometry = { type: "LineString", coordinates };
    } else if (geometryType === "MultiLineString") {
      if (!Array.isArray(raw.geometry.coordinates) || raw.geometry.coordinates.length === 0) fail("MultiLineStringが空です");
      lines = raw.geometry.coordinates.map(validateLine);
      geometry = { type: "MultiLineString", coordinates: lines };
    } else {
      fail("海岸線に未許可のgeometryがあります");
    }
    const vertices = lines.reduce((sum, line) => sum + line.length, 0);
    if (vertices > COASTLINE_LIMITS.maxVerticesPerFeature) fail("Featureの頂点数が上限を超えています");
    totalVertices += vertices;
    if (totalVertices > COASTLINE_LIMITS.maxTotalVertices) fail("総頂点数が上限を超えています");
    if (!intersectsTokyo(lines)) fail("海岸線Featureが東京対象範囲と交差しません");
    const properties = validateProperties(raw.properties);
    if (!/^edo-coastline-\d{4}$/.test(properties.id) || ids.has(properties.id)) fail("海岸線IDが不正または重複しています");
    ids.add(properties.id);
    return { type: "Feature", geometry, properties };
  });
  return { type: "FeatureCollection", features };
}

export function parseCoastlinesGeoJson(text: string): CoastlineCollection {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > COASTLINE_LIMITS.maxBytes) fail("海岸線データサイズが上限を超えています");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("海岸線データをJSONとして解析できません");
  }
  return validateCoastlineCollection(parsed);
}

async function responseTextWithinLimit(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return response.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > COASTLINE_LIMITS.maxBytes) {
      await reader.cancel();
      fail("海岸線データサイズが上限を超えています");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    fail("海岸線データがUTF-8ではありません");
  }
}

export async function loadCoastlines(baseUrl = import.meta.env.BASE_URL): Promise<CoastlineCollection> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), COASTLINE_LIMITS.fetchTimeoutMs);
  try {
    const response = await fetch(`${baseUrl}${COASTLINE_DATA_PATH}`, {
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/geo+json, application/json" },
    });
    if (!response.ok) fail("海岸線データを読み込めませんでした");
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("application/json") && !contentType.includes("application/geo+json")) fail("海岸線データのContent-Typeが不正です");
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > COASTLINE_LIMITS.maxBytes) fail("海岸線データサイズが上限を超えています");
    return parseCoastlinesGeoJson(await responseTextWithinLimit(response));
  } catch (error) {
    if (error instanceof CoastlineValidationError) throw error;
    fail("海岸線データを読み込めませんでした");
  } finally {
    window.clearTimeout(timeout);
  }
}
