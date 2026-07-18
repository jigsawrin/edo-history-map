import {
  HISTORICAL_TIMELINE_CALENDAR_LABELS,
  HISTORICAL_TIMELINE_PRECISION_LABELS,
  HISTORICAL_TIMELINE_TRACK_LABELS,
  HISTORICAL_TIMELINE_TYPE_LABELS,
  historicalTimelineRegistry,
  type HistoricalTimelineEntry,
  type HistoricalTimelineEntryType,
  type HistoricalTimelinePlaceReference,
  type HistoricalTimelineTrack,
} from "./historical-timeline-registry";
import { historicalThemeById, HISTORICAL_THEME_TYPE_LABELS } from "./historical-theme-registry";
import { searchHistoricalTimeline } from "./historical-timeline-search";
import { sanitizeSearchInput } from "./place-search/normalize";
import { KYOTO_SOURCE_REGISTRY } from "./kyoto-source-registry";
import { SHIGA_SOURCE_REGISTRY } from "./shiga-source-registry";

export interface HistoricalTimelinePlaceView {
  readonly name: string;
  readonly coordinateConfidence: string;
  readonly locationCaution?: string;
}

export interface HistoricalTimelineElements {
  readonly openButton: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly input: HTMLInputElement;
  readonly track: HTMLSelectElement;
  readonly type: HTMLSelectElement;
  readonly list: HTMLOListElement;
  readonly detail: HTMLElement;
  readonly status: HTMLElement;
  readonly closeButton: HTMLButtonElement;
}

export interface HistoricalTimelineControllerOptions {
  readonly elements: HistoricalTimelineElements;
  readonly resolvePlace: (reference: HistoricalTimelinePlaceReference) => HistoricalTimelinePlaceView;
  readonly onSelectPlace: (reference: HistoricalTimelinePlaceReference, trigger: HTMLButtonElement) => void | Promise<void>;
  readonly entries?: readonly HistoricalTimelineEntry[];
  readonly onVisibilityChange?: (open: boolean) => void;
  readonly onClose?: () => void;
}

function dateCaution(entry: HistoricalTimelineEntry): string {
  if (entry.date.noteJa) return entry.date.noteJa;
  if (entry.date.calendarBasis === "japanese-lunisolar") return "日付は当時の日本の暦による表記です。グレゴリオ暦へ換算していません。";
  if (entry.date.precision === "year") return "資料から年まで確認できるため、月日を補っていません。";
  if (entry.date.precision === "range") return "この項目は単日の出来事ではなく、一定期間の活動・攻防を示します。";
  if (entry.date.precision === "circa") return "資料が示すおおよその年代で、正確な月日を断定していません。";
  return "";
}

function sourceDefinition(sourceId: string): { readonly title: string; readonly publisher: string; readonly url: string } {
  const kyoto = KYOTO_SOURCE_REGISTRY[sourceId];
  if (kyoto) return { title: kyoto.title, publisher: kyoto.publisher, url: kyoto.url };
  const shiga = SHIGA_SOURCE_REGISTRY[sourceId];
  if (shiga) return { title: shiga.titleJa, publisher: shiga.providerJa, url: shiga.url };
  throw new Error("年表の出典が固定レジストリにありません");
}

export class HistoricalTimelineController {
  readonly #elements: HistoricalTimelineElements;
  readonly #entries: readonly HistoricalTimelineEntry[];
  readonly #resolvePlace: HistoricalTimelineControllerOptions["resolvePlace"];
  readonly #onSelectPlace: HistoricalTimelineControllerOptions["onSelectPlace"];
  readonly #onVisibilityChange: (open: boolean) => void;
  readonly #onClose: () => void;
  #selectedEntryId: string | null = null;

  constructor(options: HistoricalTimelineControllerOptions) {
    this.#elements = options.elements;
    this.#entries = options.entries ?? historicalTimelineRegistry;
    this.#resolvePlace = options.resolvePlace;
    this.#onSelectPlace = options.onSelectPlace;
    this.#onVisibilityChange = options.onVisibilityChange ?? (() => {});
    this.#onClose = options.onClose ?? (() => {});
    this.#bindEvents();
    this.#renderList();
  }

  isOpen(): boolean { return !this.#elements.panel.hidden; }

  open(): void {
    this.#elements.panel.hidden = false;
    this.#elements.openButton.setAttribute("aria-expanded", "true");
    this.#elements.input.focus();
    this.#onVisibilityChange(true);
    this.#elements.status.textContent = `歴史年表${this.#entries.length}件を利用できます。`;
  }

  close(returnFocus = true): void {
    this.#elements.panel.hidden = true;
    this.#elements.openButton.setAttribute("aria-expanded", "false");
    this.#onClose();
    this.#onVisibilityChange(false);
    if (returnFocus) this.#elements.openButton.focus();
  }

  announce(message: string): void { this.#elements.status.textContent = message; }

  #bindEvents(): void {
    this.#elements.openButton.addEventListener("click", () => this.open());
    this.#elements.closeButton.addEventListener("click", () => this.close());
    this.#elements.input.addEventListener("input", () => {
      const sanitized = sanitizeSearchInput(this.#elements.input.value);
      if (sanitized !== this.#elements.input.value) this.#elements.input.value = sanitized;
      this.#renderList();
    });
    this.#elements.track.addEventListener("change", () => this.#renderList());
    this.#elements.type.addEventListener("change", () => this.#renderList());
    this.#elements.panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
  }

  #renderList(): void {
    const requestedTrack = this.#elements.track.value;
    const track = (["shiga-sengoku", "kyoto-bakumatsu"] as const).includes(requestedTrack as HistoricalTimelineTrack)
      ? requestedTrack as HistoricalTimelineTrack : "";
    const requestedType = this.#elements.type.value;
    const types = ["battle", "politics", "construction", "religion", "incident", "movement", "death", "transition", "other"] as const;
    const type = types.includes(requestedType as HistoricalTimelineEntryType) ? requestedType as HistoricalTimelineEntryType : "";
    const matches = searchHistoricalTimeline(this.#entries, this.#elements.input.value, track, type);
    const items = matches.map((entry) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "historical-timeline-button";
      if (entry.id === this.#selectedEntryId) button.setAttribute("aria-current", "true");
      const date = document.createElement("span");
      date.textContent = entry.date.displayJa;
      const title = document.createElement("strong");
      title.textContent = entry.titleJa;
      const meta = document.createElement("span");
      meta.textContent = `${HISTORICAL_TIMELINE_TRACK_LABELS[entry.track]}／${HISTORICAL_TIMELINE_TYPE_LABELS[entry.type]}／日付精度：${HISTORICAL_TIMELINE_PRECISION_LABELS[entry.date.precision]}`;
      const counts = document.createElement("span");
      counts.textContent = `関連地点${entry.relatedPlaces.length}件／関連テーマ${entry.relatedThemeIds.length}件`;
      button.append(date, title, meta, counts);
      button.addEventListener("click", () => this.#selectEntry(entry));
      item.append(button);
      return item;
    });
    this.#elements.list.replaceChildren(...items);
    this.#elements.status.textContent = matches.length === 0 ? "条件に一致する年表項目はありません。" : `年表項目${matches.length}件を年代順に表示しています。`;
  }

  #selectEntry(entry: HistoricalTimelineEntry): void {
    this.#selectedEntryId = entry.id;
    this.#renderList();
    const article = document.createElement("article");
    article.className = "historical-timeline-detail";
    const heading = document.createElement("h3");
    heading.textContent = entry.titleJa;
    const date = document.createElement("p");
    date.textContent = entry.date.displayJa;
    const meta = document.createElement("p");
    meta.textContent = `${HISTORICAL_TIMELINE_TRACK_LABELS[entry.track]}／${HISTORICAL_TIMELINE_TYPE_LABELS[entry.type]}／${HISTORICAL_TIMELINE_CALENDAR_LABELS[entry.date.calendarBasis]}／${HISTORICAL_TIMELINE_PRECISION_LABELS[entry.date.precision]}`;
    const cautionText = dateCaution(entry);
    const caution = document.createElement("p");
    caution.className = "historical-timeline-date-note";
    caution.textContent = cautionText;
    const summary = document.createElement("p");
    summary.textContent = entry.summaryJa;
    article.append(heading, date, meta);
    if (cautionText) article.append(caution);
    article.append(summary);

    const themeHeading = document.createElement("h4");
    themeHeading.textContent = "関連テーマ";
    const themes = document.createElement("ul");
    for (const themeId of entry.relatedThemeIds) {
      const theme = historicalThemeById(themeId);
      if (!theme) continue;
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = `./themes/${theme.id}/`;
      link.textContent = `${theme.titleJa}（${HISTORICAL_THEME_TYPE_LABELS[theme.type]}）`;
      item.append(link);
      themes.append(item);
    }
    article.append(themeHeading, themes);

    const placeHeading = document.createElement("h4");
    placeHeading.textContent = "関連地点";
    const places = document.createElement("ol");
    for (const reference of entry.relatedPlaces) {
      const place = this.#resolvePlace(reference);
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "historical-timeline-place-button";
      const name = document.createElement("strong");
      name.textContent = place.name;
      const relation = document.createElement("span");
      relation.textContent = reference.relationSummaryJa;
      const confidence = document.createElement("span");
      confidence.textContent = `位置精度 ${place.coordinateConfidence}`;
      button.append(name, relation, confidence);
      if (place.locationCaution) {
        const locationCaution = document.createElement("span");
        locationCaution.textContent = place.locationCaution;
        button.append(locationCaution);
      }
      button.addEventListener("click", () => void this.#onSelectPlace(reference, button));
      item.append(button);
      places.append(item);
    }
    article.append(placeHeading, places);

    const sourceHeading = document.createElement("h4");
    sourceHeading.textContent = "出典";
    const sources = document.createElement("ul");
    for (const sourceId of new Set(entry.relatedPlaces.flatMap((reference) => reference.sourceIds))) {
      const source = sourceDefinition(sourceId);
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `${source.title}（${source.publisher}、外部サイト）`;
      item.append(link);
      sources.append(item);
    }
    article.append(sourceHeading, sources);
    this.#elements.detail.replaceChildren(article);
    this.#elements.status.textContent = `${entry.titleJa}の関連地点${entry.relatedPlaces.length}件を表示しました。`;
    heading.tabIndex = -1;
    heading.focus();
  }
}
