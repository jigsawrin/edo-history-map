export type LocaleId = "ja" | "en";

export interface LocalizedText {
  readonly ja: string;
  readonly en?: string;
}

// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f<>]/u;

export function validateLocalizedText(value: LocalizedText): Readonly<LocalizedText> {
  if (!value || typeof value.ja !== "string" || value.ja.trim() !== value.ja || value.ja.length === 0 || FORBIDDEN_TEXT.test(value.ja)) {
    throw new Error("LocalizedText.jaが不正です");
  }
  if (value.en !== undefined && (typeof value.en !== "string" || value.en.trim() !== value.en || value.en.length === 0 || FORBIDDEN_TEXT.test(value.en))) {
    throw new Error("LocalizedText.enが不正です");
  }
  return Object.freeze({ ja: value.ja, ...(value.en === undefined ? {} : { en: value.en }) });
}

export function resolveLocalizedText(value: LocalizedText, locale: LocaleId): string {
  const validated = validateLocalizedText(value);
  return locale === "en" ? validated.en ?? validated.ja : validated.ja;
}

export const HISTORICAL_RASTER_UI_TEXT = Object.freeze({
  historicalMap: validateLocalizedText({ ja: "古地図", en: "Historical map" }),
  compare: validateLocalizedText({ ja: "古地図と現代地図を比較", en: "Compare historical and modern maps" }),
  sheet: validateLocalizedText({ ja: "古地図シート", en: "Historical map sheet" }),
  opacity: validateLocalizedText({ ja: "古地図の不透明度", en: "Historical map opacity" }),
  showCoverage: validateLocalizedText({ ja: "この古地図の対象範囲を表示", en: "Show this map sheet’s coverage" }),
  outsideCoverage: validateLocalizedText({ ja: "現在の表示範囲は、この古地図シートの対象範囲外です", en: "The current view is outside this historical map sheet’s coverage" }),
  georeferenceCaution: validateLocalizedText({ ja: "位置合わせ済みの歴史地図です。現代地図と完全には一致しません", en: "This historical map has been georeferenced and does not align perfectly with the modern map" }),
  prohibitedUse: validateLocalizedText({ ja: "測量・地籍・所有権・防災判断には使用できません", en: "Do not use this map for surveying, cadastral boundaries, ownership, or disaster-risk decisions" }),
});

export const TAITO_DAIMYO_KOJI_LOCALIZATION = Object.freeze({
  title: validateLocalizedText({ ja: "御大名小路辰之口辺図", en: "Map of Daimyō-kōji and the Tatsunokuchi Area" }),
  sheetLabel: validateLocalizedText({ ja: "大名小路・辰ノ口（1849年）", en: "Daimyō-kōji and Tatsunokuchi, 1849" }),
  holdingInstitution: validateLocalizedText({ ja: "台東区立中央図書館", en: "Taito City Central Library" }),
  license: validateLocalizedText({ ja: "クリエイティブ・コモンズ 表示 4.0 国際", en: "Creative Commons Attribution 4.0 International" }),
  processing: validateLocalizedText({ ja: "位置合わせ、切り抜き、タイル化（品質ゲート合格時のみ）", en: "Georeferencing, cropping, and tiling (only after the quality gate passes)" }),
});
