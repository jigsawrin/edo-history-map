/** アプリ全体の定数。外部通信先はここに列挙されたものだけを許可する。 */

/** 初期表示: 皇居(旧江戸城)付近。実在の個人の現在地ではなく公共のランドマーク。 */
export const INITIAL_CENTER: [number, number] = [35.6852, 139.7528];
export const INITIAL_ZOOM = 14;
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 18;

/** 地理院タイル(国土地理院)。出典明示のみで利用可。 */
export const GSI_TILE_URLS = {
  pale: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  std: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
} as const;

export type BaseLayerKey = keyof typeof GSI_TILE_URLS;

export const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>';

export const CODH_ATTRIBUTION =
  '<a href="https://codh.rois.ac.jp/edo-maps/" target="_blank" rel="noopener noreferrer">江戸マップ地名データセット(CODH) CC BY 4.0</a>';

export const MACHIYA_ATTRIBUTION =
  '<a href="https://codh.rois.ac.jp/edo-maps/rekichizu/index.html.ja" target="_blank" rel="noopener noreferrer">「江戸切絵図」町家領域データセット(CODH) CC BY 4.0</a>';

/** 通信を許可する外部オリジン(タイル画像のみ)。 */
export const ALLOWED_TILE_ORIGIN = "https://cyberjapandata.gsi.go.jp";

/** 歴史情報カードの外部リンクとして許可する URL プレフィックス。 */
export const ALLOWED_LINK_PREFIXES = [
  "https://codh.rois.ac.jp/",
  "https://maps.gsi.go.jp/",
] as const;

/** 歴史GISデータ(ビルドに同梱、同一オリジンから取得)。 */
export const PLACES_DATA_PATH = "data/edo-places.geojson";
export const MACHIYA_DATA_PATH = "data/edo-machiya-areas.geojson";

/** GeoJSON 取り込み時の上限。 */
export const LIMITS = {
  /** fetch レスポンス本文の最大バイト数 */
  maxBytes: 8 * 1024 * 1024,
  /** フィーチャ数の上限 */
  maxFeatures: 10000,
  /** 文字列プロパティ1つあたりの最大文字数 */
  maxStringLength: 300,
  /** 取得タイムアウト(ミリ秒) */
  fetchTimeoutMs: 15000,
} as const;

/** 町家領域GeoJSON専用上限。実データ(28件、8,243頂点、約198KB)に余裕を持たせる。 */
export const MACHIYA_LIMITS = {
  maxBytes: 1024 * 1024,
  maxFeatures: 100,
  maxTotalVertices: 25000,
  maxVerticesPerFeature: 5000,
  maxStringLength: 120,
  maxDepth: 10,
  fetchTimeoutMs: 15000,
} as const;

/** 東京23区周辺の対象範囲(妥当な世界座標でも、この範囲外の点は読み飛ばす)。 */
export const DATA_BOUNDS = {
  minLat: 35.4,
  maxLat: 35.95,
  minLon: 139.4,
  maxLon: 140.05,
} as const;

/** URL クエリパラメータの許可リスト。ここにない値・キーはすべて無視する。 */
export const ALLOWED_QUERY_PARAMS: Readonly<Record<string, readonly string[]>> =
  {
    era: ["modern", "none", "edo-late"],
    base: ["pale", "std"],
  };
