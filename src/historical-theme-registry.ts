import rawThemes from "../data-curation/historical-themes.json";
import kyotoPlaces from "../data-curation/kyoto-bakumatsu-places.json";
import shigaPlaces from "../data-curation/shiga-sengoku-places.json";
import kyotoSources from "./kyoto-source-registry.json";
import shigaSources from "./shiga-source-registry.json";

export const HISTORICAL_THEME_TYPES = ["person", "event", "group", "concept"] as const;
export type HistoricalThemeType = (typeof HISTORICAL_THEME_TYPES)[number];

export const HISTORICAL_THEME_RELATION_TYPES = [
  "residence",
  "battle",
  "politics",
  "castle",
  "temple-shrine",
  "memorial",
  "incident",
  "activity",
  "associated",
] as const;
export type HistoricalThemeRelationType = (typeof HISTORICAL_THEME_RELATION_TYPES)[number];

export const HISTORICAL_THEME_DATASET_IDS = [
  "project-kyoto-bakumatsu-places",
  "project-shiga-sengoku-places",
] as const;
export type HistoricalThemeDatasetId = (typeof HISTORICAL_THEME_DATASET_IDS)[number];

export interface HistoricalThemePlaceReference {
  readonly datasetId: HistoricalThemeDatasetId;
  readonly placeId: string;
  readonly relationType: HistoricalThemeRelationType;
  readonly relationSummaryJa: string;
  readonly sourceIds: readonly string[];
}

export interface HistoricalThemeDefinition {
  readonly id: string;
  readonly type: HistoricalThemeType;
  readonly titleJa: string;
  readonly titleEn?: string;
  readonly aliasesJa: readonly string[];
  readonly periodDisplayJa: string;
  readonly summaryJa: string;
  readonly relatedPlaces: readonly HistoricalThemePlaceReference[];
}

const THEME_ID = /^(person|event|group|concept)-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SAFE_PLACE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f]|<[^>]*>|\[[^\]]*\]\([^)]*\)/u;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_SUMMARY = 180;
const MAX_RELATION_SUMMARY = 140;

const placeSources = new Map<string, ReadonlySet<string>>();
for (const place of kyotoPlaces) {
  placeSources.set(`project-kyoto-bakumatsu-places:${place.id}`, new Set(place.sourceIds));
}
for (const place of shigaPlaces) {
  placeSources.set(`project-shiga-sengoku-places:${place.id}`, new Set(place.sourceIds));
}
const knownSourceIds = new Set([
  ...kyotoSources.map((source) => source.id),
  ...shigaSources.map((source) => source.id),
]);

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label}は通常のオブジェクトである必要があります`);
  }
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key)) throw new Error(`${label}に危険なキーがあります`);
  }
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > maxLength || FORBIDDEN_TEXT.test(value)) {
    throw new Error(`${label}が不正です`);
  }
  return value;
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  return value === undefined ? undefined : requiredText(value, label, maxLength);
}

function stringList(value: unknown, label: string, known?: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label}は配列である必要があります`);
  const items = value.map((item, index) => requiredText(item, `${label}[${index}]`, 120));
  if (new Set(items).size !== items.length) throw new Error(`${label}に重複があります`);
  if (known && items.some((item) => !known.has(item))) throw new Error(`${label}に未登録IDがあります`);
  return Object.freeze(items);
}

function parseReference(value: unknown, themeId: string, index: number): HistoricalThemePlaceReference {
  const label = `${themeId}.relatedPlaces[${index}]`;
  assertPlainObject(value, label);
  const datasetId = requiredText(value.datasetId, `${label}.datasetId`, 80);
  if (!(HISTORICAL_THEME_DATASET_IDS as readonly string[]).includes(datasetId)) throw new Error(`${label}.datasetIdが不正です`);
  const placeId = requiredText(value.placeId, `${label}.placeId`, 80);
  if (!SAFE_PLACE_ID.test(placeId)) throw new Error(`${label}.placeIdが不正です`);
  const placeKey = `${datasetId}:${placeId}`;
  const allowedSources = placeSources.get(placeKey);
  if (!allowedSources) throw new Error(`${label}.placeIdが存在しません`);
  const relationType = requiredText(value.relationType, `${label}.relationType`, 40);
  if (!(HISTORICAL_THEME_RELATION_TYPES as readonly string[]).includes(relationType)) throw new Error(`${label}.relationTypeが不正です`);
  const sourceIds = stringList(value.sourceIds, `${label}.sourceIds`, knownSourceIds);
  if (sourceIds.length === 0 || sourceIds.some((sourceId) => !allowedSources.has(sourceId))) throw new Error(`${label}.sourceIdsが地点出典と一致しません`);
  return Object.freeze({
    datasetId: datasetId as HistoricalThemeDatasetId,
    placeId,
    relationType: relationType as HistoricalThemeRelationType,
    relationSummaryJa: requiredText(value.relationSummaryJa, `${label}.relationSummaryJa`, MAX_RELATION_SUMMARY),
    sourceIds,
  });
}

export function parseHistoricalThemes(value: unknown): readonly HistoricalThemeDefinition[] {
  if (!Array.isArray(value)) throw new Error("テーマキュレーションは配列である必要があります");
  if (value.length < 15 || value.length > 25) throw new Error("テーマ数は15から25件である必要があります");
  const ids = new Set<string>();
  const themes = value.map((item, index) => {
    const label = `themes[${index}]`;
    assertPlainObject(item, label);
    const id = requiredText(item.id, `${label}.id`, 80);
    if (!THEME_ID.test(id) || ids.has(id)) throw new Error(`${label}.idが不正または重複しています`);
    ids.add(id);
    const type = requiredText(item.type, `${label}.type`, 20);
    if (!(HISTORICAL_THEME_TYPES as readonly string[]).includes(type) || !id.startsWith(`${type}-`)) throw new Error(`${label}.typeが不正です`);
    const aliasesJa = stringList(item.aliasesJa ?? [], `${label}.aliasesJa`);
    const titleJa = requiredText(item.titleJa, `${label}.titleJa`, 80);
    if (aliasesJa.includes(titleJa)) throw new Error(`${label}.aliasesJaにタイトルと同じ値があります`);
    const relatedPlacesRaw = item.relatedPlaces;
    if (!Array.isArray(relatedPlacesRaw) || relatedPlacesRaw.length < 2) throw new Error(`${label}.relatedPlacesは2件以上必要です`);
    const relatedPlaces = relatedPlacesRaw.map((reference, referenceIndex) => parseReference(reference, id, referenceIndex));
    const placeKeys = relatedPlaces.map((reference) => `${reference.datasetId}:${reference.placeId}`);
    if (new Set(placeKeys).size !== placeKeys.length) throw new Error(`${label}.relatedPlacesに重複があります`);
    relatedPlaces.sort((left, right) => compareCodeUnits(left.datasetId, right.datasetId) || compareCodeUnits(left.placeId, right.placeId));
    const titleEn = optionalText(item.titleEn, `${label}.titleEn`, 100);
    return Object.freeze({
      id,
      type: type as HistoricalThemeType,
      titleJa,
      ...(titleEn ? { titleEn } : {}),
      aliasesJa,
      periodDisplayJa: requiredText(item.periodDisplayJa, `${label}.periodDisplayJa`, 80),
      summaryJa: requiredText(item.summaryJa, `${label}.summaryJa`, MAX_SUMMARY),
      relatedPlaces: Object.freeze(relatedPlaces),
    });
  });
  themes.sort((left, right) => compareCodeUnits(left.id, right.id));
  const crossRegionCount = themes.filter((theme) => new Set(theme.relatedPlaces.map((reference) => reference.datasetId)).size > 1).length;
  if (crossRegionCount < 5) throw new Error("地域横断テーマは5件以上必要です");
  return Object.freeze(themes);
}

export const historicalThemeRegistry = parseHistoricalThemes(rawThemes);

export function historicalThemeById(id: string): HistoricalThemeDefinition | undefined {
  return historicalThemeRegistry.find((theme) => theme.id === id);
}

export function themesForPlace(datasetId: HistoricalThemeDatasetId, placeId: string): readonly HistoricalThemeDefinition[] {
  return historicalThemeRegistry.filter((theme) => theme.relatedPlaces.some((reference) => reference.datasetId === datasetId && reference.placeId === placeId));
}

export const HISTORICAL_THEME_TYPE_LABELS: Readonly<Record<HistoricalThemeType, string>> = Object.freeze({
  person: "人物",
  event: "事件・戦い",
  group: "勢力・組織",
  concept: "歴史テーマ",
});

export const HISTORICAL_THEME_RELATION_LABELS: Readonly<Record<HistoricalThemeRelationType, string>> = Object.freeze({
  residence: "居所・滞在",
  battle: "戦闘・軍事",
  politics: "政治",
  castle: "城郭・拠点",
  "temple-shrine": "寺社",
  memorial: "墓所・顕彰",
  incident: "事件",
  activity: "活動",
  associated: "関連",
});
