import sourceData from "./kyoto-source-registry.json";

export type KyotoSourceType =
  | "government"
  | "archive"
  | "museum"
  | "university"
  | "official-site"
  | "academic-publication";

export interface KyotoHistoricalSourceDefinition {
  readonly id: string;
  readonly title: string;
  readonly publisher: string;
  readonly url: string;
  readonly sourceType: KyotoSourceType;
  readonly accessedAt: "2026-07-16";
  readonly usage: "fact-reference";
}

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_TYPES = new Set<KyotoSourceType>([
  "government",
  "archive",
  "museum",
  "university",
  "official-site",
  "academic-publication",
]);
const ALLOWED_ORIGINS = new Set([
  "https://www2.city.kyoto.lg.jp",
  "https://www.pref.kyoto.jp",
  "https://www.doshisha.ac.jp",
  "https://kurodani.jp",
  "https://bunka.nii.ac.jp",
  "https://shimogyo.city.kyoto.lg.jp",
  "https://ja.kyoto.travel",
  "https://myomanji.jp",
]);
const EXPECTED_KEYS = [
  "id",
  "title",
  "publisher",
  "url",
  "sourceType",
  "accessedAt",
  "usage",
] as const;

function parseSource(value: unknown): KyotoHistoricalSourceDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("京都出典定義がオブジェクトではありません");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== EXPECTED_KEYS.length ||
    EXPECTED_KEYS.some((key) => !Object.hasOwn(record, key))
  ) {
    throw new Error("京都出典定義のプロパティが不正です");
  }
  const { id, title, publisher, url, sourceType, accessedAt, usage } = record;
  if (
    typeof id !== "string" ||
    !ID_PATTERN.test(id) ||
    id.length > 64 ||
    typeof title !== "string" ||
    title.length < 1 ||
    title.length > 120 ||
    typeof publisher !== "string" ||
    publisher.length < 1 ||
    publisher.length > 120 ||
    typeof url !== "string" ||
    typeof sourceType !== "string" ||
    !SOURCE_TYPES.has(sourceType as KyotoSourceType) ||
    accessedAt !== "2026-07-16" ||
    usage !== "fact-reference"
  ) {
    throw new Error("京都出典定義の値が不正です");
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("京都出典URLが不正です");
  }
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username !== "" ||
    parsedUrl.password !== "" ||
    !ALLOWED_ORIGINS.has(parsedUrl.origin)
  ) {
    throw new Error("京都出典URLが許可リスト外です");
  }
  return Object.freeze({
    id,
    title,
    publisher,
    url: parsedUrl.href,
    sourceType: sourceType as KyotoSourceType,
    accessedAt,
    usage,
  });
}

const parsedSources = sourceData.map(parseSource);
const sourceIds = new Set<string>();
for (const source of parsedSources) {
  if (sourceIds.has(source.id)) throw new Error("京都出典IDが重複しています");
  sourceIds.add(source.id);
}

export const KYOTO_SOURCE_DEFINITIONS = Object.freeze(parsedSources);
export const KYOTO_SOURCE_REGISTRY: Readonly<
  Record<string, KyotoHistoricalSourceDefinition>
> = Object.freeze(
  Object.fromEntries(parsedSources.map((source) => [source.id, source])),
);
