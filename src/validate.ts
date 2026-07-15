import { DATA_BOUNDS, LIMITS, ALLOWED_LINK_PREFIXES } from "./config";

/** 検証済みの歴史地名1件。プロパティは検証済み文字列のみ。 */
export interface PlaceFeature {
  name: string;
  category: string;
  sheet: string;
  entryId: string;
  sourceUrl: string | null;
  lat: number;
  lon: number;
}

export class ValidationError extends Error {
  override name = "ValidationError";
}

/** U+0000〜U+001F および U+007F の制御文字。 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function inBounds(lat: number, lon: number): boolean {
  return (
    lat >= DATA_BOUNDS.minLat &&
    lat <= DATA_BOUNDS.maxLat &&
    lon >= DATA_BOUNDS.minLon &&
    lon <= DATA_BOUNDS.maxLon
  );
}

/** 文字列プロパティを検証して返す。長すぎる・型違いは拒否。制御文字は除去。 */
function cleanString(v: unknown, field: string): string {
  if (typeof v !== "string") {
    throw new ValidationError(`${field} が文字列ではありません`);
  }
  if (v.length > LIMITS.maxStringLength) {
    throw new ValidationError(`${field} が長すぎます`);
  }
  // 表示は textContent 経由なのでHTMLは無害化されるが、
  // データ段階でも制御文字は持ち込まない。
  return v.replace(CONTROL_CHARS, "");
}

/**
 * 外部リンクとして安全な URL のみ許可する。
 * https の許可リストプレフィックスに一致しないもの(javascript:, data: 等を含む)は null。
 */
export function sanitizeLinkUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > LIMITS.maxStringLength) return null;
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  const normalized = parsed.href;
  return ALLOWED_LINK_PREFIXES.some((p) => normalized.startsWith(p))
    ? normalized
    : null;
}

/**
 * 取得した GeoJSON テキストを検証し、型付きの地名配列へ変換する。
 * サイズ・件数・型・世界座標としての範囲を検証し、不正なら例外を投げる。
 * 世界座標として妥当でも DATA_BOUNDS の対象地域外にある点は読み飛ばす。
 */
export function parsePlacesGeoJson(text: string): PlaceFeature[] {
  if (text.length > LIMITS.maxBytes) {
    throw new ValidationError("データサイズが上限を超えています");
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ValidationError("JSON として解析できません");
  }
  if (
    typeof data !== "object" ||
    data === null ||
    (data as { type?: unknown }).type !== "FeatureCollection" ||
    !Array.isArray((data as { features?: unknown }).features)
  ) {
    throw new ValidationError("FeatureCollection ではありません");
  }
  const features = (data as { features: unknown[] }).features;
  if (features.length > LIMITS.maxFeatures) {
    throw new ValidationError("フィーチャ数が上限を超えています");
  }
  const result: PlaceFeature[] = [];
  for (const f of features) {
    if (typeof f !== "object" || f === null) {
      throw new ValidationError("不正なフィーチャがあります");
    }
    const feat = f as {
      type?: unknown;
      geometry?: { type?: unknown; coordinates?: unknown };
      properties?: Record<string, unknown>;
    };
    if (feat.type !== "Feature" || feat.geometry?.type !== "Point") {
      throw new ValidationError("Point 以外のジオメトリは受け付けません");
    }
    const coords = feat.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2) {
      throw new ValidationError("座標形式が不正です");
    }
    const [lon, lat] = coords;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
      throw new ValidationError("座標が数値ではありません(NaN/Infinity拒否)");
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new ValidationError("緯度経度が範囲外です");
    }
    if (!inBounds(lat, lon)) {
      // 対象地域外の点はエラーにせず読み飛ばす(データ更新で範囲が広がる可能性)
      continue;
    }
    const props = feat.properties ?? {};
    result.push({
      name: cleanString(props["name"], "name"),
      category: cleanString(props["category"] ?? "", "category"),
      sheet: cleanString(props["sheet"] ?? "", "sheet"),
      entryId: cleanString(props["id"] ?? "", "id"),
      sourceUrl: sanitizeLinkUrl(props["source"]),
      lat,
      lon,
    });
  }
  return result;
}
