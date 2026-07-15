/**
 * 現在地の取得。
 * - ボタン操作でユーザーが明示的に同意した場合のみ getCurrentPosition を1回呼ぶ
 * - watchPosition(継続追跡)は使わない
 * - 座標はメモリ内でのみ使用し、ストレージ・URL・ログへ書き込まない
 * - 使用後は参照を破棄できるよう clear() を提供する
 */

export interface GeoResult {
  lat: number;
  lon: number;
  accuracy: number;
}

export type GeoOutcome =
  | { status: "ok"; position: GeoResult }
  | { status: "denied" }
  | { status: "unavailable" }
  | { status: "unsupported" };

export function isGeolocationSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "geolocation" in navigator &&
    typeof navigator.geolocation.getCurrentPosition === "function"
  );
}

export function getCurrentLocation(): Promise<GeoOutcome> {
  if (!isGeolocationSupported()) {
    return Promise.resolve({ status: "unsupported" });
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          status: "ok",
          position: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          },
        });
      },
      (err) => {
        // 座標や内部情報はログへ出さない
        if (err.code === err.PERMISSION_DENIED) {
          resolve({ status: "denied" });
        } else {
          resolve({ status: "unavailable" });
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 0,
      },
    );
  });
}
