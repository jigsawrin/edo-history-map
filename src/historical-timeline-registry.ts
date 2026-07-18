import rawTimeline from "../data-curation/historical-timeline.json";
import kyotoPlaces from "../data-curation/kyoto-bakumatsu-places.json";
import shigaPlaces from "../data-curation/shiga-sengoku-places.json";
import kyotoSources from "./kyoto-source-registry.json";
import shigaSources from "./shiga-source-registry.json";
import { historicalThemeRegistry, type HistoricalThemeDatasetId } from "./historical-theme-registry";

export const HISTORICAL_TIMELINE_TRACKS = ["shiga-sengoku", "kyoto-bakumatsu"] as const;
export type HistoricalTimelineTrack = (typeof HISTORICAL_TIMELINE_TRACKS)[number];

export const HISTORICAL_TIMELINE_ENTRY_TYPES = [
  "battle", "politics", "construction", "religion", "incident", "movement", "death", "transition", "other",
] as const;
export type HistoricalTimelineEntryType = (typeof HISTORICAL_TIMELINE_ENTRY_TYPES)[number];

export const HISTORICAL_TIMELINE_DATE_PRECISIONS = ["day", "month", "year", "range", "circa"] as const;
export type HistoricalTimelineDatePrecision = (typeof HISTORICAL_TIMELINE_DATE_PRECISIONS)[number];

export const HISTORICAL_TIMELINE_CALENDAR_BASES = ["japanese-lunisolar", "gregorian", "year-only", "mixed"] as const;
export type HistoricalTimelineCalendarBasis = (typeof HISTORICAL_TIMELINE_CALENDAR_BASES)[number];

export interface HistoricalTimelineDate {
  readonly displayJa: string;
  readonly startYear: number;
  readonly startMonth?: number;
  readonly startDay?: number;
  readonly endYear?: number;
  readonly endMonth?: number;
  readonly endDay?: number;
  readonly precision: HistoricalTimelineDatePrecision;
  readonly calendarBasis: HistoricalTimelineCalendarBasis;
  readonly noteJa?: string;
}

export interface HistoricalTimelinePlaceReference {
  readonly datasetId: HistoricalThemeDatasetId;
  readonly placeId: string;
  readonly relationSummaryJa: string;
  readonly sourceIds: readonly string[];
}

export interface HistoricalTimelineEntry {
  readonly id: string;
  readonly order: number;
  readonly track: HistoricalTimelineTrack;
  readonly type: HistoricalTimelineEntryType;
  readonly titleJa: string;
  readonly titleEn?: string;
  readonly aliasesJa: readonly string[];
  readonly date: HistoricalTimelineDate;
  readonly summaryJa: string;
  readonly relatedThemeIds: readonly string[];
  readonly relatedPlaces: readonly HistoricalTimelinePlaceReference[];
}

const TIMELINE_ID = /^timeline-(shiga|kyoto)-[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SAFE_PLACE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f]|<[^>]*>|\[[^\]]*\]\([^)]*\)/u;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ENTRY_KEYS = new Set(["id", "order", "track", "type", "titleJa", "titleEn", "aliasesJa", "date", "summaryJa", "relatedThemeIds", "relatedPlaces"]);
const DATE_KEYS = new Set(["displayJa", "startYear", "startMonth", "startDay", "endYear", "endMonth", "endDay", "precision", "calendarBasis", "noteJa"]);
const PLACE_KEYS = new Set(["datasetId", "placeId", "relationSummaryJa", "sourceIds"]);
const knownThemeIds = new Set(historicalThemeRegistry.map((theme) => theme.id));
const knownSourceIds = new Set([...kyotoSources.map((source) => source.id), ...shigaSources.map((source) => source.id)]);
const placeSources = new Map<string, ReadonlySet<string>>([
  ...kyotoPlaces.map((place) => [`project-kyoto-bakumatsu-places:${place.id}`, new Set(place.sourceIds)] as const),
  ...shigaPlaces.map((place) => [`project-shiga-sengoku-places:${place.id}`, new Set(place.sourceIds)] as const),
]);

function assertPlainObject(value: unknown, label: string, allowedKeys: ReadonlySet<string>): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label}は通常のオブジェクトである必要があります`);
  }
  for (const key of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(key) || !allowedKeys.has(key)) throw new Error(`${label}に許可されていないキーがあります`);
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

function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label}が範囲外です`);
  return value as number;
}

function optionalInteger(value: unknown, label: string, min: number, max: number): number | undefined {
  return value === undefined ? undefined : integer(value, label, min, max);
}

function stringList(value: unknown, label: string, known?: ReadonlySet<string>): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${label}は配列である必要があります`);
  const items = value.map((item, index) => requiredText(item, `${label}[${index}]`, 120));
  if (new Set(items).size !== items.length) throw new Error(`${label}に重複があります`);
  if (known && items.some((item) => !known.has(item))) throw new Error(`${label}に未登録IDがあります`);
  return Object.freeze(items);
}

function compareDateParts(
  start: readonly [number, number | undefined, number | undefined],
  end: readonly [number, number | undefined, number | undefined],
): number {
  for (let index = 0; index < 3; index += 1) {
    const left = start[index];
    const right = end[index];
    if (left === undefined || right === undefined) continue;
    if (left !== right) return left < right ? -1 : 1;
  }
  return 0;
}

function isGregorianLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function gregorianDaysInMonth(year: number, month: number): number {
  if (month === 2) return isGregorianLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validateGregorianDay(
  year: number,
  month: number,
  day: number,
  label: string,
): void {
  if (day > gregorianDaysInMonth(year, month)) {
    throw new Error(`${label}は実在しないグレゴリオ暦日付です`);
  }
}

function parseDate(value: unknown, label: string): HistoricalTimelineDate {
  assertPlainObject(value, label, DATE_KEYS);
  const startYear = integer(value.startYear, `${label}.startYear`, 1467, 1868);
  const startMonth = optionalInteger(value.startMonth, `${label}.startMonth`, 1, 12);
  const startDay = optionalInteger(value.startDay, `${label}.startDay`, 1, 31);
  const endYear = optionalInteger(value.endYear, `${label}.endYear`, 1467, 1868);
  const endMonth = optionalInteger(value.endMonth, `${label}.endMonth`, 1, 12);
  const endDay = optionalInteger(value.endDay, `${label}.endDay`, 1, 31);
  if (startDay !== undefined && startMonth === undefined) throw new Error(`${label}.startDayにはstartMonthが必要です`);
  if (endMonth !== undefined && endYear === undefined) throw new Error(`${label}.endMonthにはendYearが必要です`);
  if (endDay !== undefined && (endYear === undefined || endMonth === undefined)) throw new Error(`${label}.endDayにはendYearとendMonthが必要です`);
  const precision = requiredText(value.precision, `${label}.precision`, 20);
  if (!(HISTORICAL_TIMELINE_DATE_PRECISIONS as readonly string[]).includes(precision)) throw new Error(`${label}.precisionが不正です`);
  if (precision === "day" && (startMonth === undefined || startDay === undefined || endYear !== undefined)) throw new Error(`${label}の日精度が不整合です`);
  if (precision === "month" && (startMonth === undefined || startDay !== undefined || endYear !== undefined)) throw new Error(`${label}の月精度が不整合です`);
  if ((precision === "year" || precision === "circa") && (startMonth !== undefined || startDay !== undefined || endYear !== undefined)) throw new Error(`${label}の年精度が不整合です`);
  if (precision === "range" && endYear === undefined) throw new Error(`${label}の期間にはendYearが必要です`);
  if (endYear !== undefined && compareDateParts([startYear, startMonth, startDay], [endYear, endMonth, endDay]) > 0) throw new Error(`${label}の終了が開始より前です`);
  const calendarBasis = requiredText(value.calendarBasis, `${label}.calendarBasis`, 30);
  if (!(HISTORICAL_TIMELINE_CALENDAR_BASES as readonly string[]).includes(calendarBasis)) throw new Error(`${label}.calendarBasisが不正です`);
  if (
    calendarBasis === "gregorian" &&
    precision === "day" &&
    startMonth !== undefined &&
    startDay !== undefined
  ) {
    validateGregorianDay(startYear, startMonth, startDay, label);
  }
  const noteJa = optionalText(value.noteJa, `${label}.noteJa`, 180);
  return Object.freeze({
    displayJa: requiredText(value.displayJa, `${label}.displayJa`, 100), startYear,
    ...(startMonth === undefined ? {} : { startMonth }), ...(startDay === undefined ? {} : { startDay }),
    ...(endYear === undefined ? {} : { endYear }), ...(endMonth === undefined ? {} : { endMonth }), ...(endDay === undefined ? {} : { endDay }),
    precision: precision as HistoricalTimelineDatePrecision,
    calendarBasis: calendarBasis as HistoricalTimelineCalendarBasis,
    ...(noteJa ? { noteJa } : {}),
  });
}

function parseReference(value: unknown, label: string, track: HistoricalTimelineTrack): HistoricalTimelinePlaceReference {
  assertPlainObject(value, label, PLACE_KEYS);
  const datasetId = requiredText(value.datasetId, `${label}.datasetId`, 80) as HistoricalThemeDatasetId;
  const requiredDataset = track === "shiga-sengoku" ? "project-shiga-sengoku-places" : "project-kyoto-bakumatsu-places";
  if (datasetId !== requiredDataset) throw new Error(`${label}.datasetIdがtrackと一致しません`);
  const placeId = requiredText(value.placeId, `${label}.placeId`, 80);
  if (!SAFE_PLACE_ID.test(placeId)) throw new Error(`${label}.placeIdが不正です`);
  const allowedSources = placeSources.get(`${datasetId}:${placeId}`);
  if (!allowedSources) throw new Error(`${label}.placeIdが存在しません`);
  const sourceIds = stringList(value.sourceIds, `${label}.sourceIds`, knownSourceIds);
  if (sourceIds.length === 0 || sourceIds.some((sourceId) => !allowedSources.has(sourceId))) throw new Error(`${label}.sourceIdsが地点出典と一致しません`);
  return Object.freeze({
    datasetId, placeId,
    relationSummaryJa: requiredText(value.relationSummaryJa, `${label}.relationSummaryJa`, 180),
    sourceIds,
  });
}

export function parseHistoricalTimeline(value: unknown): readonly HistoricalTimelineEntry[] {
  if (!Array.isArray(value)) throw new Error("年表キュレーションは配列である必要があります");
  if (value.length < 24 || value.length > 50) throw new Error("年表項目数は24から50件である必要があります");
  const ids = new Set<string>();
  const orders = new Set<number>();
  let previousOrder = 0;
  let previousYear = 0;
  const entries = value.map((item, index) => {
    const label = `timeline[${index}]`;
    assertPlainObject(item, label, ENTRY_KEYS);
    const id = requiredText(item.id, `${label}.id`, 100);
    if (!TIMELINE_ID.test(id) || ids.has(id)) throw new Error(`${label}.idが不正または重複しています`);
    ids.add(id);
    const order = integer(item.order, `${label}.order`, 1, 10_000);
    if (orders.has(order) || order <= previousOrder) throw new Error(`${label}.orderが重複または昇順ではありません`);
    orders.add(order);
    previousOrder = order;
    const track = requiredText(item.track, `${label}.track`, 30);
    if (!(HISTORICAL_TIMELINE_TRACKS as readonly string[]).includes(track)) throw new Error(`${label}.trackが不正です`);
    if (!id.startsWith(`timeline-${track === "shiga-sengoku" ? "shiga" : "kyoto"}-`)) throw new Error(`${label}.idがtrackと一致しません`);
    const type = requiredText(item.type, `${label}.type`, 30);
    if (!(HISTORICAL_TIMELINE_ENTRY_TYPES as readonly string[]).includes(type)) throw new Error(`${label}.typeが不正です`);
    const date = parseDate(item.date, `${label}.date`);
    if (date.startYear < previousYear) throw new Error(`${label}.date.startYearがorder順で逆行しています`);
    previousYear = date.startYear;
    const aliasesJa = stringList(item.aliasesJa ?? [], `${label}.aliasesJa`);
    const titleJa = requiredText(item.titleJa, `${label}.titleJa`, 100);
    if (aliasesJa.includes(titleJa)) throw new Error(`${label}.aliasesJaにタイトルと同じ値があります`);
    const relatedThemeIds = stringList(item.relatedThemeIds, `${label}.relatedThemeIds`, knownThemeIds);
    if (relatedThemeIds.length === 0) throw new Error(`${label}.relatedThemeIdsは1件以上必要です`);
    const referencesRaw = item.relatedPlaces;
    if (!Array.isArray(referencesRaw) || referencesRaw.length === 0) throw new Error(`${label}.relatedPlacesは1件以上必要です`);
    const relatedPlaces = referencesRaw.map((reference, referenceIndex) => parseReference(reference, `${label}.relatedPlaces[${referenceIndex}]`, track as HistoricalTimelineTrack));
    const placeKeys = relatedPlaces.map((reference) => `${reference.datasetId}:${reference.placeId}`);
    if (new Set(placeKeys).size !== placeKeys.length) throw new Error(`${label}.relatedPlacesに重複があります`);
    const titleEn = optionalText(item.titleEn, `${label}.titleEn`, 120);
    return Object.freeze({
      id, order, track: track as HistoricalTimelineTrack, type: type as HistoricalTimelineEntryType,
      titleJa, ...(titleEn ? { titleEn } : {}), aliasesJa, date,
      summaryJa: requiredText(item.summaryJa, `${label}.summaryJa`, 240), relatedThemeIds,
      relatedPlaces: Object.freeze(relatedPlaces),
    });
  });
  for (const track of HISTORICAL_TIMELINE_TRACKS) {
    if (entries.filter((entry) => entry.track === track).length < 10) throw new Error(`${track}は10件以上必要です`);
  }
  if (new Set(entries.flatMap((entry) => entry.relatedThemeIds)).size < 12) throw new Error("12テーマ以上との関係が必要です");
  return Object.freeze(entries);
}

export const historicalTimelineRegistry = parseHistoricalTimeline(rawTimeline);

export function historicalTimelineById(id: string): HistoricalTimelineEntry | undefined {
  return historicalTimelineRegistry.find((entry) => entry.id === id);
}

export function timelineEntriesForPlace(datasetId: HistoricalThemeDatasetId, placeId: string): readonly HistoricalTimelineEntry[] {
  return historicalTimelineRegistry.filter((entry) => entry.relatedPlaces.some((reference) => reference.datasetId === datasetId && reference.placeId === placeId));
}

export function timelineEntriesForTheme(themeId: string): readonly HistoricalTimelineEntry[] {
  return historicalTimelineRegistry.filter((entry) => entry.relatedThemeIds.includes(themeId));
}

export const HISTORICAL_TIMELINE_TRACK_LABELS: Readonly<Record<HistoricalTimelineTrack, string>> = Object.freeze({
  "shiga-sengoku": "滋賀・戦国", "kyoto-bakumatsu": "京都・幕末",
});

export const HISTORICAL_TIMELINE_TYPE_LABELS: Readonly<Record<HistoricalTimelineEntryType, string>> = Object.freeze({
  battle: "戦い", politics: "政治", construction: "築城・建設", religion: "宗教", incident: "事件",
  movement: "活動・移動", death: "死去・襲撃", transition: "転換", other: "その他",
});

export const HISTORICAL_TIMELINE_PRECISION_LABELS: Readonly<Record<HistoricalTimelineDatePrecision, string>> = Object.freeze({
  day: "日付確定", month: "月まで確認", year: "年まで確認", range: "期間", circa: "おおよその年代",
});

export const HISTORICAL_TIMELINE_CALENDAR_LABELS: Readonly<Record<HistoricalTimelineCalendarBasis, string>> = Object.freeze({
  "japanese-lunisolar": "日本旧暦", gregorian: "グレゴリオ暦", "year-only": "西暦年のみ", mixed: "和暦・西暦併記",
});
