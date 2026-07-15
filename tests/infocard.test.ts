import { describe, it, expect, beforeEach } from "vitest";
import { renderPlaceCard, renderNoData } from "../src/infocard";
import type { PlaceFeature } from "../src/validate";

function place(overrides: Partial<PlaceFeature> = {}): PlaceFeature {
  return {
    name: "桜田御門",
    category: "施設",
    sheet: "御江戸大名小路絵図",
    entryId: "1-001",
    sourceUrl: "https://codh.rois.ac.jp/edo-maps/owariya/01/1849/1-001.html.ja",
    lat: 35.68,
    lon: 139.75,
    ...overrides,
  };
}

let container: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("section");
  container.hidden = true;
  document.body.append(container);
});

describe("renderPlaceCard", () => {
  it("地点情報(名称・分類・出典・年代・確度)を表示する", () => {
    renderPlaceCard(container, place());
    expect(container.hidden).toBe(false);
    expect(container.textContent).toContain("桜田御門");
    expect(container.textContent).toContain("施設");
    expect(container.textContent).toContain("江戸後期");
    expect(container.textContent).toContain("推定");
    expect(container.textContent).toContain("CC BY 4.0");
    expect(container.textContent).toContain("測量");
  });

  it("HTML タグを含む地名をテキストとして表示し、要素として実行しない", () => {
    renderPlaceCard(
      container,
      place({ name: '<img src=x onerror="window.__pwned=true">' }),
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
    expect(
      (window as unknown as Record<string, unknown>)["__pwned"],
    ).toBeUndefined();
  });

  it("script タグを含む分類が実行されない", () => {
    renderPlaceCard(
      container,
      place({ category: '<script>window.__pwned2=true</script>' }),
    );
    expect(container.querySelector("script")).toBeNull();
    expect(
      (window as unknown as Record<string, unknown>)["__pwned2"],
    ).toBeUndefined();
  });

  it("外部リンクに noopener noreferrer が付く", () => {
    renderPlaceCard(container, place());
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.rel).toContain("noopener");
    expect(a?.rel).toContain("noreferrer");
    expect(a?.href.startsWith("https://codh.rois.ac.jp/")).toBe(true);
  });

  it("sourceUrl が null の場合はリンクを表示しない", () => {
    renderPlaceCard(container, place({ sourceUrl: null }));
    expect(container.querySelector("a")).toBeNull();
  });

  it("閉じるボタンで非表示になる", () => {
    renderPlaceCard(container, place());
    const button = container.querySelector("button");
    button?.click();
    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it("閉じるボタンに aria-label がある", () => {
    renderPlaceCard(container, place());
    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBeTruthy();
  });
});

describe("renderNoData", () => {
  it("データがない旨を表示する", () => {
    renderNoData(container);
    expect(container.hidden).toBe(false);
    expect(container.textContent).toContain("歴史地名データがありません");
  });

  it("閉じるボタンで非表示になる", () => {
    renderNoData(container);
    container.querySelector("button")?.click();
    expect(container.hidden).toBe(true);
  });
});
