import { ALLOWED_QUERY_PARAMS } from "./config";

/**
 * URL クエリパラメータを許可リスト方式で読み取る。
 * 許可リストにないキー、許可値以外の値はすべて無視する。
 * 値をそのまま DOM や URL に埋め込むことはない(許可リストの固定文字列のみ返す)。
 */
export function readAllowedParams(search: string): Record<string, string> {
  const out: Record<string, string> = {};
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return out;
  }
  for (const [key, allowed] of Object.entries(ALLOWED_QUERY_PARAMS)) {
    const value = params.get(key);
    if (value !== null && allowed.includes(value)) {
      // 返すのはユーザー入力そのものではなく、許可リスト内の固定文字列
      out[key] = allowed[allowed.indexOf(value)] as string;
    }
  }
  return out;
}
