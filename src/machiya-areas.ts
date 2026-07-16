import {
  DATA_BOUNDS,
  MACHIYA_DATA_PATH,
  MACHIYA_LIMITS,
} from "./config";

export type MachiyaPosition = [number, number];
export type MachiyaRing = MachiyaPosition[];
export type MachiyaPolygonCoordinates = MachiyaRing[];

export interface MachiyaAreaProperties {
  id: string;
  sourceSheetId: string;
  sourceSheetName: string;
  category: "machiya-area";
  eraId: "edo-late";
  positionConfidence: "estimated";
  sourceId: "codh-edo-machiya-areas";
}

export interface MachiyaAreaFeature {
  type: "Feature";
  geometry:
    | { type: "Polygon"; coordinates: MachiyaPolygonCoordinates }
    | { type: "MultiPolygon"; coordinates: MachiyaPolygonCoordinates[] };
  properties: MachiyaAreaProperties;
}

export interface MachiyaAreaCollection {
  type: "FeatureCollection";
  features: MachiyaAreaFeature[];
}

export class MachiyaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MachiyaValidationError";
  }
}

function fail(message: string): never {
  throw new MachiyaValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inspectStructure(value: unknown, depth = 0): void {
  if (depth > MACHIYA_LIMITS.maxDepth) fail("GeoJSONのネストが深すぎます");
  if (Array.isArray(value)) {
    for (const item of value) inspectStructure(item, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail("GeoJSONに不正なオブジェクトがあります");
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") {
      fail("GeoJSONに禁止されたプロパティがあります");
    }
    inspectStructure(child, depth + 1);
  }
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  if (Object.keys(record).some((key) => !allowedSet.has(key))) {
    fail("GeoJSONに未許可のプロパティがあります");
  }
}

function requiredString(value: unknown, expected?: string): string {
  const hasControlCharacter =
    typeof value === "string" &&
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return (code >= 0 && code <= 31) || (code >= 127 && code <= 159);
    });
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MACHIYA_LIMITS.maxStringLength ||
    hasControlCharacter
  ) {
    fail("町家領域の文字列プロパティが不正です");
  }
  if (expected !== undefined && value !== expected) {
    fail("町家領域の固定プロパティが一致しません");
  }
  return value;
}

function validatePosition(value: unknown): MachiyaPosition {
  if (!Array.isArray(value) || value.length !== 2) fail("座標は経度・緯度の2要素が必要です");
  const [lon, lat] = value;
  if (typeof lon !== "number" || typeof lat !== "number" || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    fail("座標にNaN、Infinityまたはnullがあります");
  }
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) fail("緯度経度が世界座標範囲外です");
  if (
    lon < DATA_BOUNDS.minLon ||
    lon > DATA_BOUNDS.maxLon ||
    lat < DATA_BOUNDS.minLat ||
    lat > DATA_BOUNDS.maxLat
  ) {
    fail("町家領域が対象地域bounds外です");
  }
  return [lon, lat];
}

function validateRing(value: unknown): MachiyaRing {
  if (!Array.isArray(value) || value.length < 4) fail("Polygon ringの頂点が4未満です");
  const ring = value.map(validatePosition);
  const first = ring[0];
  const last = ring.at(-1);
  if (!first) fail("Polygon ringが空です");
  if (first[0] !== last?.[0] || first[1] !== last[1]) fail("Polygon ringが閉じていません");
  if (new Set(ring.slice(0, -1).map((point) => point.join(","))).size < 3) {
    fail("Polygon ringの異なる頂点が3未満です");
  }
  return ring;
}

function validatePolygon(value: unknown): MachiyaPolygonCoordinates {
  if (!Array.isArray(value) || value.length === 0) fail("Polygonが空です");
  return value.map(validateRing);
}

function validateProperties(value: unknown): MachiyaAreaProperties {
  if (!isRecord(value)) fail("町家領域propertiesがありません");
  exactKeys(value, [
    "id",
    "sourceSheetId",
    "sourceSheetName",
    "category",
    "eraId",
    "positionConfidence",
    "sourceId",
  ]);
  return {
    id: requiredString(value.id),
    sourceSheetId: requiredString(value.sourceSheetId),
    sourceSheetName: requiredString(value.sourceSheetName),
    category: requiredString(value.category, "machiya-area") as "machiya-area",
    eraId: requiredString(value.eraId, "edo-late") as "edo-late",
    positionConfidence: requiredString(value.positionConfidence, "estimated") as "estimated",
    sourceId: requiredString(value.sourceId, "codh-edo-machiya-areas") as "codh-edo-machiya-areas",
  };
}

function countVertices(geometry: MachiyaAreaFeature["geometry"]): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.reduce(
    (total, polygon) =>
      total + polygon.reduce((polygonTotal, ring) => polygonTotal + ring.length, 0),
    0,
  );
}

export function validateMachiyaAreaCollection(value: unknown): MachiyaAreaCollection {
  inspectStructure(value);
  if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
    fail("町家領域データはFeatureCollectionではありません");
  }
  exactKeys(value, ["type", "features"]);
  if (value.features.length === 0 || value.features.length > MACHIYA_LIMITS.maxFeatures) {
    fail("町家領域Feature数が上限外です");
  }
  const ids = new Set<string>();
  let totalVertices = 0;
  const features = value.features.map((rawFeature) => {
    if (!isRecord(rawFeature) || rawFeature.type !== "Feature") fail("不正な町家領域Featureです");
    exactKeys(rawFeature, ["type", "geometry", "properties"]);
    if (!isRecord(rawFeature.geometry)) fail("町家領域geometryがありません");
    exactKeys(rawFeature.geometry, ["type", "coordinates"]);
    let geometry: MachiyaAreaFeature["geometry"];
    if (rawFeature.geometry.type === "Polygon") {
      geometry = {
        type: "Polygon",
        coordinates: validatePolygon(rawFeature.geometry.coordinates),
      };
    } else if (rawFeature.geometry.type === "MultiPolygon") {
      if (!Array.isArray(rawFeature.geometry.coordinates) || rawFeature.geometry.coordinates.length === 0) {
        fail("MultiPolygonが空です");
      }
      geometry = {
        type: "MultiPolygon",
        coordinates: rawFeature.geometry.coordinates.map(validatePolygon),
      };
    } else {
      fail("町家領域はPolygonまたはMultiPolygonに限定されています");
    }
    const properties = validateProperties(rawFeature.properties);
    if (ids.has(properties.id)) fail("町家領域IDが重複しています");
    ids.add(properties.id);
    const vertices = countVertices(geometry);
    if (vertices > MACHIYA_LIMITS.maxVerticesPerFeature) fail("Feature頂点数が上限を超えています");
    totalVertices += vertices;
    if (totalVertices > MACHIYA_LIMITS.maxTotalVertices) fail("総頂点数が上限を超えています");
    return { type: "Feature" as const, geometry, properties };
  });
  return { type: "FeatureCollection", features };
}

export function parseMachiyaAreasGeoJson(text: string): MachiyaAreaCollection {
  if (new TextEncoder().encode(text).byteLength > MACHIYA_LIMITS.maxBytes) {
    fail("町家領域データサイズが上限を超えています");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    fail("町家領域データがJSONではありません");
  }
  return validateMachiyaAreaCollection(parsed);
}

async function responseTextWithinLimit(response: Response): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MACHIYA_LIMITS.maxBytes) {
      fail("町家領域データサイズが上限を超えています");
    }
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MACHIYA_LIMITS.maxBytes) fail("町家領域データサイズが上限を超えています");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("町家領域データがUTF-8ではありません");
  }
}

export async function loadMachiyaAreas(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<MachiyaAreaCollection> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MACHIYA_LIMITS.fetchTimeoutMs);
  try {
    const response = await fetch(baseUrl + MACHIYA_DATA_PATH, {
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) throw new Error();
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (contentType !== "application/geo+json" && contentType !== "application/json") {
      throw new MachiyaValidationError("町家領域データのContent-Typeが不正です");
    }
    const length = response.headers.get("content-length");
    if (length !== null) {
      const bytes = Number(length);
      if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MACHIYA_LIMITS.maxBytes) {
        throw new MachiyaValidationError("町家領域データサイズが上限を超えています");
      }
    }
    return parseMachiyaAreasGeoJson(await responseTextWithinLimit(response));
  } catch (error) {
    if (error instanceof MachiyaValidationError) throw error;
    throw new Error("町家領域データを読み込めませんでした");
  } finally {
    clearTimeout(timer);
  }
}
