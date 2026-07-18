import {
  HISTORICAL_THEME_RELATION_LABELS,
  HISTORICAL_THEME_TYPE_LABELS,
  historicalThemeRegistry,
  type HistoricalThemeDatasetId,
  type HistoricalThemeDefinition,
  type HistoricalThemePlaceReference,
  type HistoricalThemeType,
} from "./historical-theme-registry";
import { searchHistoricalThemes } from "./historical-theme-search";
import { sanitizeSearchInput } from "./place-search/normalize";

export interface HistoricalThemePlaceView {
  readonly name: string;
  readonly regionEraLabel: string;
  readonly coordinateConfidence: string;
  readonly locationCaution?: string;
}

export interface HistoricalThemeElements {
  readonly openButton: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly input: HTMLInputElement;
  readonly type: HTMLSelectElement;
  readonly list: HTMLOListElement;
  readonly detail: HTMLElement;
  readonly status: HTMLElement;
  readonly closeButton: HTMLButtonElement;
}

export interface HistoricalThemeControllerOptions {
  readonly elements: HistoricalThemeElements;
  readonly resolvePlace: (reference: HistoricalThemePlaceReference) => HistoricalThemePlaceView;
  readonly onSelectPlace: (reference: HistoricalThemePlaceReference, trigger: HTMLButtonElement) => void | Promise<void>;
  readonly themes?: readonly HistoricalThemeDefinition[];
  readonly onVisibilityChange?: (open: boolean) => void;
  readonly onClose?: () => void;
}

const DATASET_LABELS: Readonly<Record<HistoricalThemeDatasetId, string>> = Object.freeze({
  "project-kyoto-bakumatsu-places": "京都・幕末",
  "project-shiga-sengoku-places": "滋賀・戦国",
});

function regionCounts(theme: HistoricalThemeDefinition): string {
  const counts = new Map<HistoricalThemeDatasetId, number>();
  for (const reference of theme.relatedPlaces) counts.set(reference.datasetId, (counts.get(reference.datasetId) ?? 0) + 1);
  return [...counts].map(([datasetId, count]) => `${DATASET_LABELS[datasetId]}${count}地点`).join("・");
}

export class HistoricalThemeController {
  readonly #elements: HistoricalThemeElements;
  readonly #themes: readonly HistoricalThemeDefinition[];
  readonly #resolvePlace: HistoricalThemeControllerOptions["resolvePlace"];
  readonly #onSelectPlace: HistoricalThemeControllerOptions["onSelectPlace"];
  readonly #onVisibilityChange: (open: boolean) => void;
  readonly #onClose: () => void;
  #selectedThemeId: string | null = null;

  constructor(options: HistoricalThemeControllerOptions) {
    this.#elements = options.elements;
    this.#themes = options.themes ?? historicalThemeRegistry;
    this.#resolvePlace = options.resolvePlace;
    this.#onSelectPlace = options.onSelectPlace;
    this.#onVisibilityChange = options.onVisibilityChange ?? (() => {});
    this.#onClose = options.onClose ?? (() => {});
    this.#bindEvents();
    this.#renderThemes();
  }

  isOpen(): boolean { return !this.#elements.panel.hidden; }

  open(): void {
    this.#elements.panel.hidden = false;
    this.#elements.openButton.setAttribute("aria-expanded", "true");
    this.#elements.input.focus();
    this.#onVisibilityChange(true);
    this.#elements.status.textContent = `歴史テーマ${this.#themes.length}件を利用できます。テーマを選ぶと関連地点を表示します。`;
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
      this.#renderThemes();
    });
    this.#elements.type.addEventListener("change", () => this.#renderThemes());
    this.#elements.panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
  }

  #renderThemes(): void {
    const requestedType = this.#elements.type.value;
    const type = (["person", "event", "group", "concept"] as const).includes(requestedType as HistoricalThemeType) ? requestedType as HistoricalThemeType : "";
    const matches = searchHistoricalThemes(this.#themes, this.#elements.input.value, type);
    const items = matches.map((theme) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "historical-theme-button";
      if (theme.id === this.#selectedThemeId) button.setAttribute("aria-current", "true");
      const title = document.createElement("strong");
      title.textContent = theme.titleJa;
      const meta = document.createElement("span");
      meta.textContent = `${HISTORICAL_THEME_TYPE_LABELS[theme.type]}／${theme.periodDisplayJa}`;
      const regions = document.createElement("span");
      regions.textContent = regionCounts(theme);
      button.append(title, meta, regions);
      button.addEventListener("click", () => this.#selectTheme(theme));
      item.append(button);
      return item;
    });
    this.#elements.list.replaceChildren(...items);
    this.#elements.status.textContent = matches.length === 0 ? "条件に一致する歴史テーマはありません。" : `歴史テーマ${matches.length}件を表示しています。`;
  }

  #selectTheme(theme: HistoricalThemeDefinition): void {
    this.#selectedThemeId = theme.id;
    this.#renderThemes();
    const article = document.createElement("article");
    article.className = "historical-theme-detail";
    const heading = document.createElement("h3");
    heading.textContent = theme.titleJa;
    const summary = document.createElement("p");
    summary.textContent = theme.summaryJa;
    article.append(heading, summary);
    const groups = new Map<HistoricalThemeDatasetId, HistoricalThemePlaceReference[]>();
    for (const reference of theme.relatedPlaces) {
      const references = groups.get(reference.datasetId) ?? [];
      references.push(reference);
      groups.set(reference.datasetId, references);
    }
    for (const [datasetId, references] of groups) {
      const regionHeading = document.createElement("h4");
      regionHeading.textContent = DATASET_LABELS[datasetId];
      const list = document.createElement("ol");
      for (const reference of references) {
        const place = this.#resolvePlace(reference);
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "historical-theme-place-button";
        const name = document.createElement("strong");
        name.textContent = place.name;
        const meta = document.createElement("span");
        meta.textContent = `${place.regionEraLabel}／${HISTORICAL_THEME_RELATION_LABELS[reference.relationType]}／位置精度 ${place.coordinateConfidence}`;
        const relation = document.createElement("span");
        relation.textContent = reference.relationSummaryJa;
        button.append(name, meta, relation);
        if (place.locationCaution) {
          const caution = document.createElement("span");
          caution.textContent = place.locationCaution;
          button.append(caution);
        }
        button.addEventListener("click", () => void this.#onSelectPlace(reference, button));
        item.append(button);
        list.append(item);
      }
      article.append(regionHeading, list);
    }
    this.#elements.detail.replaceChildren(article);
    this.#elements.status.textContent = `${theme.titleJa}の関連地点${theme.relatedPlaces.length}件を表示しました。`;
    heading.tabIndex = -1;
    heading.focus();
  }
}
