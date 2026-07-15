import { LIMITS, PLACES_DATA_PATH } from "./config";
import { parsePlacesGeoJson, ValidationError, type PlaceFeature } from "./validate";

/**
 * 同一オリジンの歴史GISデータを取得して検証する。
 * タイムアウト・サイズ上限・スキーマ検証つき。
 * 失敗時はユーザー向けの安全なメッセージ(内部パスや詳細を含まない)を持つ例外を投げる。
 */
export async function loadPlaces(
  baseUrl: string = import.meta.env.BASE_URL,
): Promise<PlaceFeature[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LIMITS.fetchTimeoutMs);
  try {
    const response = await fetch(baseUrl + PLACES_DATA_PATH, {
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error("歴史データを取得できませんでした");
    }
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader !== null && Number(lengthHeader) > LIMITS.maxBytes) {
      throw new ValidationError("データサイズが上限を超えています");
    }
    const text = await response.text();
    return parsePlacesGeoJson(text);
  } catch (e) {
    if (e instanceof ValidationError) throw e;
    throw new Error("歴史データを取得できませんでした");
  } finally {
    clearTimeout(timer);
  }
}
