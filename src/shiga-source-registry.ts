import sourceData from "./shiga-source-registry.json";

export interface ShigaHistoricalSourceDefinition {
  readonly id: string;
  readonly titleJa: string;
  readonly providerJa: string;
  readonly url: string;
  readonly accessedAt: "2026-07-17";
  readonly noteJa?: string;
}

const ORIGINS = new Set(["https://www.pref.shiga.lg.jp", "https://geoshape.ex.nii.ac.jp", "https://msearch.gsi.go.jp", "https://www.city.nagahama.lg.jp", "https://bunka.nii.ac.jp"]);
const KEYS = new Set(["id", "titleJa", "providerJa", "url", "accessedAt", "noteJa"]);
const REQUIRED = ["id", "titleJa", "providerJa", "url", "accessedAt"];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// eslint-disable-next-line no-control-regex
const UNSAFE = /[<>\u0000-\u001f\u007f]/;

function fixedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !UNSAFE.test(value);
}

function parse(value: unknown): ShigaHistoricalSourceDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("滋賀出典定義が不正です");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !KEYS.has(key)) || REQUIRED.some((key) => !Object.hasOwn(record, key))) throw new Error("滋賀出典定義のプロパティが不正です");
  if (!fixedText(record.id, 64) || !ID.test(record.id) || !fixedText(record.titleJa, 180) || !fixedText(record.providerJa, 120) || !fixedText(record.url, 500) || record.accessedAt !== "2026-07-17" || (record.noteJa !== undefined && !fixedText(record.noteJa, 240))) throw new Error("滋賀出典定義の値が不正です");
  const url = new URL(record.url);
  if (url.protocol !== "https:" || url.username || url.password || !ORIGINS.has(url.origin)) throw new Error("滋賀出典URLが許可リスト外です");
  return Object.freeze({ id: record.id, titleJa: record.titleJa, providerJa: record.providerJa, url: url.href, accessedAt: "2026-07-17", ...(record.noteJa === undefined ? {} : { noteJa: record.noteJa }) });
}

const definitions = sourceData.map(parse);
if (new Set(definitions.map(({ id }) => id)).size !== definitions.length) throw new Error("滋賀出典IDが重複しています");
export const SHIGA_SOURCE_DEFINITIONS = Object.freeze(definitions);
export const SHIGA_SOURCE_REGISTRY: Readonly<Record<string, ShigaHistoricalSourceDefinition>> = Object.freeze(Object.fromEntries(definitions.map((source) => [source.id, source])));
