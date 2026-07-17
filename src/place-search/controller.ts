import { normalizeSearchText, sanitizeSearchInput } from "./normalize";
import { placeSearchModelCache, type PlaceSearchModelCache } from "./model-cache";
import {
  paginateSearchResults,
  searchHistoricalPlaces,
} from "./query";
import type {
  PlaceSearchCopy,
  SearchableHistoricalPlace,
  SearchablePlaceDatasetId,
  SearchCategory,
} from "./types";

const SEARCH_DEBOUNCE_MS = 150;

export interface PlaceSearchElements {
  readonly container: HTMLElement;
  readonly openButton: HTMLButtonElement;
  readonly panel: HTMLElement;
  readonly heading: HTMLElement;
  readonly form: HTMLFormElement;
  readonly inputLabel: HTMLElement;
  readonly input: HTMLInputElement;
  readonly category: HTMLSelectElement;
  readonly status: HTMLElement;
  readonly results: HTMLOListElement;
  readonly pagination: HTMLElement;
  readonly previous: HTMLButtonElement;
  readonly pageStatus: HTMLElement;
  readonly next: HTMLButtonElement;
  readonly closeButton: HTMLButtonElement;
}

export interface PlaceSearchContext {
  readonly datasetId: SearchablePlaceDatasetId;
  readonly regionId: "edo" | "kyoto";
  readonly eraId: "edo-late" | "bakumatsu";
  readonly copy: PlaceSearchCopy;
}

export interface PlaceSearchControllerOptions {
  readonly elements: PlaceSearchElements;
  readonly onSelect: (
    place: SearchableHistoricalPlace,
    trigger: HTMLButtonElement,
  ) => void | Promise<void>;
  readonly modelCache?: Pick<PlaceSearchModelCache, "load">;
  readonly search?: typeof searchHistoricalPlaces;
  readonly onVisibilityChange?: (open: boolean) => void;
}

interface SearchMatchCache {
  readonly datasetId: SearchablePlaceDatasetId;
  readonly normalizedQuery: string;
  readonly categoryId: string;
  readonly modelGeneration: number;
  readonly matches: readonly SearchableHistoricalPlace[];
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function categoriesFor(
  records: readonly SearchableHistoricalPlace[],
): readonly SearchCategory[] {
  const categories = new Map<string, string>();
  for (const record of records) {
    if (!categories.has(record.categoryId)) {
      categories.set(record.categoryId, record.categoryLabel);
    }
  }
  return [...categories]
    .map(([id, label]) => Object.freeze({ id, label }))
    .sort((left, right) =>
      left.label < right.label ? -1 : left.label > right.label ? 1 : 0,
    );
}

export class PlaceSearchController {
  readonly #elements: PlaceSearchElements;
  readonly #onSelect: PlaceSearchControllerOptions["onSelect"];
  readonly #modelCache: Pick<PlaceSearchModelCache, "load">;
  readonly #search: typeof searchHistoricalPlaces;
  readonly #onVisibilityChange: (open: boolean) => void;
  #context: PlaceSearchContext | null = null;
  #contextInitialized = false;
  #records: readonly SearchableHistoricalPlace[] = [];
  #page = 1;
  #selectedKey: string | null = null;
  #generation = 0;
  #modelGeneration = 0;
  #matchCache: SearchMatchCache | null = null;
  #preparingGeneration: number | null = null;
  #focusAfterPrepare = false;
  #debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: PlaceSearchControllerOptions) {
    this.#elements = options.elements;
    this.#onSelect = options.onSelect;
    this.#modelCache = options.modelCache ?? placeSearchModelCache;
    this.#search = options.search ?? searchHistoricalPlaces;
    this.#onVisibilityChange = options.onVisibilityChange ?? (() => {});
    this.#bindEvents();
  }

  setContext(context: PlaceSearchContext | null, focusFallback?: HTMLElement): void {
    if (
      this.#contextInitialized &&
      context?.datasetId === this.#context?.datasetId &&
      context?.regionId === this.#context?.regionId &&
      context?.eraId === this.#context?.eraId
    ) {
      return;
    }
    if (this.#contextInitialized && !context && !this.#context) return;
    this.#contextInitialized = true;
    const previousDatasetId = this.#context?.datasetId;
    this.#generation += 1;
    this.#clearDebounce();
    this.#invalidateMatchCache();
    this.#context = context;
    this.#records = [];
    this.#page = 1;
    this.#selectedKey = null;
    this.#elements.input.value = "";
    this.#elements.category.value = "";
    this.#elements.results.replaceChildren();

    if (!context) {
      const hadFocus = this.#elements.panel.contains(document.activeElement);
      this.close(false);
      this.#elements.container.hidden = true;
      this.#elements.openButton.disabled = true;
      this.#elements.status.textContent =
        "現代年代では歴史地点検索を利用できません。";
      if (hadFocus) focusFallback?.focus();
      return;
    }

    this.#elements.container.hidden = false;
    this.#elements.openButton.disabled = false;
    this.#applyCopy(context.copy);
    this.#setLoadingState();
    const keepPanelOpen = !this.#elements.panel.hidden;
    void this.#prepare(this.#generation, keepPanelOpen && previousDatasetId !== context.datasetId);
  }

  isOpen(): boolean {
    return !this.#elements.panel.hidden;
  }

  open(): void {
    if (!this.#context) return;
    this.#elements.panel.hidden = false;
    this.#elements.openButton.setAttribute("aria-expanded", "true");
    this.#elements.input.focus();
    this.#onVisibilityChange(true);
    if (this.#records.length > 0) {
      this.#announceAvailable();
    } else {
      void this.#prepare(this.#generation, false);
    }
  }

  close(returnFocus = true): void {
    this.#elements.panel.hidden = true;
    this.#elements.openButton.setAttribute("aria-expanded", "false");
    this.#onVisibilityChange(false);
    if (returnFocus && !this.#elements.container.hidden) {
      this.#elements.openButton.focus();
    }
  }

  selectFromMap(place: SearchableHistoricalPlace): void {
    if (place.datasetId !== this.#context?.datasetId) return;
    this.#selectedKey = place.key;
    if (this.isOpen()) this.#updateSelectionInView();
    this.#elements.status.textContent =
      `${place.name}を選択しました。情報カードを表示しました。`;
  }

  announceUnavailable(): void {
    this.#elements.status.textContent =
      "現代年代では歴史地点検索を利用できません。";
  }

  destroy(): void {
    this.#generation += 1;
    this.#modelGeneration += 1;
    this.#clearDebounce();
    this.#invalidateMatchCache();
    this.#context = null;
    this.#records = [];
    this.#selectedKey = null;
    this.#elements.results.replaceChildren();
  }

  #bindEvents(): void {
    const elements = this.#elements;
    elements.openButton.addEventListener("click", () => this.open());
    elements.closeButton.addEventListener("click", () => this.close());
    elements.form.addEventListener("submit", (event) => event.preventDefault());
    elements.input.addEventListener("input", () => {
      const sanitized = sanitizeSearchInput(elements.input.value);
      if (sanitized !== elements.input.value) elements.input.value = sanitized;
      this.#page = 1;
      this.#invalidateMatchCache();
      this.#clearDebounce();
      this.#debounceTimer = setTimeout(() => this.#render(), SEARCH_DEBOUNCE_MS);
    });
    elements.category.addEventListener("change", () => {
      this.#page = 1;
      this.#invalidateMatchCache();
      this.#render();
    });
    elements.previous.addEventListener("click", () => {
      if (this.#page <= 1) return;
      this.#page -= 1;
      this.#render(true);
    });
    elements.next.addEventListener("click", () => {
      this.#page += 1;
      this.#render(true);
    });
    elements.panel.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
  }

  async #prepare(generation: number, focusInput: boolean): Promise<void> {
    const context = this.#context;
    if (!context) return;
    this.#focusAfterPrepare ||= focusInput;
    if (this.#preparingGeneration === generation) return;
    this.#preparingGeneration = generation;
    try {
      const records = await this.#modelCache.load(context.datasetId);
      if (generation !== this.#generation || context !== this.#context) return;
      this.#records = records;
      this.#modelGeneration += 1;
      this.#invalidateMatchCache();
      this.#populateCategories(categoriesFor(records));
      this.#render();
      this.#announceAvailable();
      if (this.#focusAfterPrepare && this.isOpen()) this.#elements.input.focus();
    } catch {
      if (generation !== this.#generation || context !== this.#context) return;
      this.#records = [];
      this.#modelGeneration += 1;
      this.#invalidateMatchCache();
      this.#elements.results.replaceChildren();
      this.#elements.pagination.hidden = true;
      this.#elements.status.textContent =
        "地点検索を準備できませんでした。地図上の地点は引き続き利用できます。";
    } finally {
      if (this.#preparingGeneration === generation) {
        this.#preparingGeneration = null;
        this.#focusAfterPrepare = false;
      }
    }
  }

  #applyCopy(copy: PlaceSearchCopy): void {
    this.#elements.openButton.textContent = copy.searchButtonLabel;
    this.#elements.heading.textContent = copy.searchHeading;
    this.#elements.inputLabel.textContent = copy.searchInputLabel;
  }

  #setLoadingState(): void {
    this.#elements.category.replaceChildren();
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "すべての分類";
    this.#elements.category.append(option);
    this.#elements.status.textContent = "地点一覧を読み込んでいます。";
    this.#elements.pagination.hidden = true;
  }

  #populateCategories(categories: readonly SearchCategory[]): void {
    const options = categories.map((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.label;
      return option;
    });
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "すべての分類";
    this.#elements.category.replaceChildren(all, ...options);
  }

  #announceAvailable(): void {
    const context = this.#context;
    if (!context) return;
    this.#elements.status.textContent =
      `${context.copy.searchResultNoun}${formatCount(this.#records.length)}件を読み込みました。`;
  }

  #render(focusFirstResult = false): void {
    const context = this.#context;
    if (!context || this.#records.length === 0) return;
    const normalizedQuery = normalizeSearchText(this.#elements.input.value);
    const categoryId = this.#elements.category.value;
    const cached = this.#matchCache;
    const matches =
      cached?.datasetId === context.datasetId &&
      cached.normalizedQuery === normalizedQuery &&
      cached.categoryId === categoryId &&
      cached.modelGeneration === this.#modelGeneration
        ? cached.matches
        : this.#search(this.#records, this.#elements.input.value, categoryId);
    if (matches !== cached?.matches) {
      this.#matchCache = Object.freeze({
        datasetId: context.datasetId,
        normalizedQuery,
        categoryId,
        modelGeneration: this.#modelGeneration,
        matches,
      });
    }
    const page = paginateSearchResults(matches, this.#page);
    this.#page = page.page;
    const buttons = page.items.map((place) => this.#createResult(place));
    this.#elements.results.replaceChildren(...buttons);
    const hasResults = page.totalCount > 0;
    this.#elements.pagination.hidden = !hasResults;
    this.#elements.previous.disabled = !hasResults || page.page <= 1;
    this.#elements.next.disabled = !hasResults || page.page >= page.pageCount;
    this.#elements.pageStatus.textContent = hasResults
      ? `${page.page} / ${page.pageCount}ページ`
      : "";
    if (!hasResults) {
      this.#elements.status.textContent = context.copy.searchEmptyMessage;
      return;
    }
    this.#elements.status.textContent =
      `${formatCount(page.totalCount)}件中${formatCount(page.items.length)}件を表示。${page.page}ページ目です。`;
    if (focusFirstResult) {
      this.#elements.results.querySelector<HTMLButtonElement>("button")?.focus();
    }
  }

  #createResult(place: SearchableHistoricalPlace): HTMLLIElement {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "place-search-result";
    button.dataset.placeKey = place.key;
    if (place.key === this.#selectedKey) {
      button.setAttribute("aria-current", "true");
    }
    const name = document.createElement("span");
    name.className = "place-search-result-name";
    name.textContent = place.name;
    const secondary = document.createElement("span");
    secondary.className = "place-search-result-meta";
    secondary.textContent = place.secondaryText;
    button.append(name, secondary);
    if (place.detailText) {
      const detail = document.createElement("span");
      detail.className = "place-search-result-detail";
      detail.textContent = place.detailText;
      button.append(detail);
    }
    button.addEventListener("click", () => {
      if (place.datasetId !== this.#context?.datasetId) return;
      this.#selectedKey = place.key;
      this.#updateSelectionInView();
      void Promise.resolve(this.#onSelect(place, button)).catch(() => {
        this.#elements.status.textContent =
          "地点を選択できませんでした。地図は引き続き利用できます。";
      });
    });
    item.append(button);
    return item;
  }

  #updateSelectionInView(): void {
    for (const button of this.#elements.results.querySelectorAll<HTMLButtonElement>(
      ".place-search-result",
    )) {
      if (button.dataset.placeKey === this.#selectedKey) {
        button.setAttribute("aria-current", "true");
      } else {
        button.removeAttribute("aria-current");
      }
    }
  }

  #clearDebounce(): void {
    if (this.#debounceTimer !== null) {
      clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }

  #invalidateMatchCache(): void {
    this.#matchCache = null;
  }
}
