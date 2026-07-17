import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceSearchController } from "../src/place-search/controller";
import { normalizeSearchText } from "../src/place-search/normalize";
import { searchHistoricalPlaces } from "../src/place-search/query";
import type {
  PlaceSearchCopy,
  SearchableHistoricalPlace,
  SearchablePlaceDatasetId,
} from "../src/place-search/types";
import type { PlaceFeature } from "../src/validate";

const copy: PlaceSearchCopy = {
  searchButtonLabel: "江戸地名を検索",
  searchHeading: "江戸地名・地点一覧",
  searchInputLabel: "江戸地名",
  searchEmptyMessage: "条件に一致する江戸地名がありません。",
  searchResultNoun: "江戸地名",
};

function record(index: number, category = "施設"): SearchableHistoricalPlace {
  const name = `地点${String(index).padStart(4, "0")}`;
  const source: PlaceFeature = {
    name,
    category,
    sheet: "切絵図",
    entryId: String(index),
    sourceUrl: null,
    lat: 35,
    lon: 139,
  };
  return {
    key: `edo:${index}`,
    datasetId: "codh-edo-maps-places",
    regionId: "edo",
    eraId: "edo-late",
    name,
    secondaryText: `${category}／切絵図`,
    detailText: "",
    categoryId: category,
    categoryLabel: category,
    latitude: 35,
    longitude: 139,
    normalizedName: normalizeSearchText(name),
    normalizedAlternateName: "",
    normalizedCategory: normalizeSearchText(category),
    normalizedSecondary: "きりえず",
    normalizedDescription: "",
    normalizedSearchText: normalizeSearchText(`${name} ${category} 切絵図`),
    sourceRecord: {
      datasetId: "codh-edo-maps-places",
      record: source,
      sourceIndex: index,
    },
  };
}

function elements() {
  const ids = [
    ["div", "container"],
    ["button", "open"],
    ["section", "panel"],
    ["h2", "heading"],
    ["form", "form"],
    ["label", "inputLabel"],
    ["input", "input"],
    ["select", "category"],
    ["p", "status"],
    ["ol", "results"],
    ["nav", "pagination"],
    ["button", "previous"],
    ["span", "pageStatus"],
    ["button", "next"],
    ["button", "closeButton"],
  ] as const;
  const found = new Map<string, HTMLElement>();
  for (const [tag, id] of ids) {
    const element = document.createElement(tag);
    element.id = id;
    found.set(id, element);
  }
  const panel = found.get("panel") as HTMLElement;
  panel.hidden = true;
  panel.append(
    found.get("heading")!,
    found.get("form")!,
    found.get("inputLabel")!,
    found.get("input")!,
    found.get("category")!,
    found.get("status")!,
    found.get("results")!,
    found.get("pagination")!,
    found.get("closeButton")!,
  );
  found.get("pagination")!.append(
    found.get("previous")!,
    found.get("pageStatus")!,
    found.get("next")!,
  );
  found.get("container")!.append(found.get("open")!);
  document.body.replaceChildren(found.get("container")!, panel);
  return {
    container: found.get("container")!,
    openButton: found.get("open") as HTMLButtonElement,
    panel,
    heading: found.get("heading")!,
    form: found.get("form") as HTMLFormElement,
    inputLabel: found.get("inputLabel")!,
    input: found.get("input") as HTMLInputElement,
    category: found.get("category") as HTMLSelectElement,
    status: found.get("status")!,
    results: found.get("results") as HTMLOListElement,
    pagination: found.get("pagination")!,
    previous: found.get("previous") as HTMLButtonElement,
    pageStatus: found.get("pageStatus")!,
    next: found.get("next") as HTMLButtonElement,
    closeButton: found.get("closeButton") as HTMLButtonElement,
  };
}

function context(datasetId: SearchablePlaceDatasetId = "codh-edo-maps-places") {
  return {
    datasetId,
    regionId: datasetId === "codh-edo-maps-places" ? "edo" as const : "kyoto" as const,
    eraId: datasetId === "codh-edo-maps-places" ? "edo-late" as const : "bakumatsu" as const,
    copy,
  };
}

beforeEach(() => {
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("地点検索コントローラー", () => {
  it("ページ移動・選択・開閉では一致結果を再検索しない", async () => {
    const refs = elements();
    const search = vi.fn(searchHistoricalPlaces);
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      search,
      modelCache: {
        load: vi.fn().mockResolvedValue(Array.from({ length: 51 }, (_, i) => record(i))),
      },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.results.children).toHaveLength(50));
    expect(search).toHaveBeenCalledTimes(1);

    refs.next.click();
    refs.previous.click();
    (refs.results.querySelector("button") as HTMLButtonElement).click();
    controller.open();
    controller.close();
    controller.open();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("検索語・分類・地域変更では一致結果を一度ずつ再検索する", async () => {
    vi.useFakeTimers();
    const refs = elements();
    const search = vi.fn(searchHistoricalPlaces);
    const edoRecords = Array.from({ length: 51 }, (_, i) => record(i, i === 0 ? "寺社" : "施設"));
    const kyotoRecord = {
      ...record(100),
      datasetId: "project-kyoto-bakumatsu-places" as const,
      regionId: "kyoto" as const,
      eraId: "bakumatsu" as const,
    };
    const load = vi.fn((id: SearchablePlaceDatasetId) =>
      Promise.resolve(id === "codh-edo-maps-places" ? edoRecords : [kyotoRecord]),
    );
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      search,
      modelCache: { load },
    });

    controller.setContext(context());
    await vi.runAllTimersAsync();
    expect(search).toHaveBeenCalledTimes(1);
    refs.input.value = "地点";
    refs.input.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(150);
    expect(search).toHaveBeenCalledTimes(2);
    refs.category.value = "寺社";
    refs.category.dispatchEvent(new Event("change"));
    expect(search).toHaveBeenCalledTimes(3);

    controller.setContext(context("project-kyoto-bakumatsu-places"));
    await vi.runAllTimersAsync();
    expect(search).toHaveBeenCalledTimes(4);
    controller.setContext(context());
    await vi.runAllTimersAsync();
    expect(search).toHaveBeenCalledTimes(5);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("年代変更とdestroyで一致結果キャッシュを破棄する", async () => {
    const refs = elements();
    const search = vi.fn(searchHistoricalPlaces);
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      search,
      modelCache: { load: vi.fn().mockResolvedValue([record(1)]) },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    controller.setContext(null);
    controller.setContext(context());
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    controller.destroy();
    controller.setContext(context());
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(3));
  });

  it("読み込み失敗をキャッシュせず、再試行成功時だけ検索する", async () => {
    const refs = elements();
    const search = vi.fn(searchHistoricalPlaces);
    const load = vi
      .fn<() => Promise<readonly SearchableHistoricalPlace[]>>()
      .mockRejectedValueOnce(new Error("失敗"))
      .mockResolvedValueOnce([record(1)]);
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      search,
      modelCache: { load },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.status.textContent).toContain("準備できません"));
    expect(search).not.toHaveBeenCalled();
    controller.open();
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("初期年代が現代の場合も検索UIを非表示にする", () => {
    const refs = elements();
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      modelCache: { load: vi.fn() },
    });
    controller.setContext(null);
    expect(refs.container.hidden).toBe(true);
    expect(refs.openButton.disabled).toBe(true);
  });

  it("開閉、aria-expanded、入力フォーカス、Escape復帰を管理する", async () => {
    const refs = elements();
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      modelCache: { load: vi.fn().mockResolvedValue([record(1)]) },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.results.children).toHaveLength(1));
    refs.openButton.click();
    expect(refs.panel.hidden).toBe(false);
    expect(refs.openButton.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(refs.input);
    refs.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(refs.panel.hidden).toBe(true);
    expect(refs.openButton.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(refs.openButton);
  });

  it("DOMを最大50件に保ち、ページ変更時に置換して先頭へフォーカスする", async () => {
    const refs = elements();
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      modelCache: {
        load: vi.fn().mockResolvedValue(Array.from({ length: 51 }, (_, i) => record(i))),
      },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.results.children).toHaveLength(50));
    const oldFirst = refs.results.firstElementChild;
    expect(refs.pageStatus.textContent).toBe("1 / 2ページ");
    expect(refs.previous.disabled).toBe(true);
    refs.next.click();
    expect(refs.results.children).toHaveLength(1);
    expect(refs.results.firstElementChild).not.toBe(oldFirst);
    expect(document.activeElement).toBe(refs.results.querySelector("button"));
    expect(refs.next.disabled).toBe(true);
  });

  it("入力をdebounceし、検索変更で1ページへ戻して空結果を通知する", async () => {
    vi.useFakeTimers();
    const refs = elements();
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      modelCache: { load: vi.fn().mockResolvedValue([record(1), record(2)]) },
    });
    controller.setContext(context());
    await vi.runAllTimersAsync();
    refs.input.value = "該当なし\u0000";
    refs.input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(refs.input.value).toBe("該当なし");
    await vi.advanceTimersByTimeAsync(150);
    expect(refs.results.children).toHaveLength(0);
    expect(refs.status.textContent).toBe(copy.searchEmptyMessage);
    expect(refs.pagination.hidden).toBe(true);
  });

  it("実在カテゴリを再構築し、カテゴリ変更で絞り込む", async () => {
    const refs = elements();
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      modelCache: { load: vi.fn().mockResolvedValue([record(1), record(2, "寺社")]) },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.category.options).toHaveLength(3));
    refs.category.value = "寺社";
    refs.category.dispatchEvent(new Event("change"));
    expect(refs.results.children).toHaveLength(1);
  });

  it("結果buttonの選択callbackとaria-currentを同期する", async () => {
    const refs = elements();
    const onSelect = vi.fn();
    const target = record(1);
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect,
      modelCache: { load: vi.fn().mockResolvedValue([target]) },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.results.querySelector("button")).not.toBeNull());
    const button = refs.results.querySelector("button") as HTMLButtonElement;
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toContain(target.name);
    expect(button.textContent).toContain(target.secondaryText);
    button.click();
    expect(onSelect).toHaveBeenCalledWith(target, button);
    expect(refs.results.querySelector("button")?.getAttribute("aria-current")).toBe("true");
    expect(refs.results.querySelector("button")).toBe(button);
  });

  it("現代年代では閉じて状態を消し、年代selectへフォーカスを戻す", async () => {
    const refs = elements();
    const eraSelect = document.createElement("select");
    document.body.append(eraSelect);
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      modelCache: { load: vi.fn().mockResolvedValue([record(1)]) },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.results.children).toHaveLength(1));
    controller.open();
    controller.setContext(null, eraSelect);
    expect(refs.container.hidden).toBe(true);
    expect(refs.panel.hidden).toBe(true);
    expect(refs.results.children).toHaveLength(0);
    expect(document.activeElement).toBe(eraSelect);
    expect(refs.status.textContent).toContain("利用できません");
  });

  it("地域高速切替後の古いモデルを表示しない", async () => {
    const refs = elements();
    let resolveEdo!: (records: readonly SearchableHistoricalPlace[]) => void;
    const edo = new Promise<readonly SearchableHistoricalPlace[]>((resolve) => {
      resolveEdo = resolve;
    });
    const kyotoRecord = { ...record(2), datasetId: "project-kyoto-bakumatsu-places" as const, regionId: "kyoto" as const, eraId: "bakumatsu" as const };
    const load = vi.fn((id: SearchablePlaceDatasetId) =>
      id === "codh-edo-maps-places" ? edo : Promise.resolve([kyotoRecord]),
    );
    const search = vi.fn(searchHistoricalPlaces);
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      search,
      modelCache: { load },
    });
    controller.setContext(context());
    controller.setContext(context("project-kyoto-bakumatsu-places"));
    await vi.waitFor(() => expect(refs.results.textContent).toContain(kyotoRecord.name));
    resolveEdo([record(1)]);
    await Promise.resolve();
    expect(refs.results.textContent).not.toContain("地点0001");
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0]?.[0]).toEqual([kyotoRecord]);
  });

  it("パネル閉鎖中の地図選択では自動で開かない", async () => {
    const refs = elements();
    const target = record(1);
    const controller = new PlaceSearchController({
      elements: refs,
      onSelect: vi.fn(),
      modelCache: { load: vi.fn().mockResolvedValue([target]) },
    });
    controller.setContext(context());
    await vi.waitFor(() => expect(refs.results.children).toHaveLength(1));
    controller.selectFromMap(target);
    expect(refs.panel.hidden).toBe(true);
    expect(refs.status.textContent).toContain(target.name);
  });
});
