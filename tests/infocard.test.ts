import { describe, it, expect, beforeEach } from "vitest";
import { renderPlaceCard, renderNoData } from "../src/infocard";
import type { PlaceFeature } from "../src/validate";
import { createEdoCardResolver } from "../src/edo-card-projection";

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

  it("表示時は地図のフォーカスを奪わず、閉じると地図へ戻す", () => {
    const map = document.createElement("div");
    map.tabIndex = 0;
    document.body.prepend(map);
    map.focus();
    renderPlaceCard(container, place(), map);
    expect(document.activeElement).toBe(map);

    const button = container.querySelector("button");
    button?.focus();
    button?.click();
    expect(document.activeElement).toBe(map);
  });

  it("approved renameだけを見出しへ適用し、原資料表記とsource-backed fieldsを維持する", () => {
    const raw = place();
    const original = structuredClone(raw);
    const resolver = createEdoCardResolver({
      schemaVersion: 1,
      sourceDataSha256: "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4",
      sourceFeatureCount: 8788,
      applicableSourceCount: 8788,
      renderableCardCount: 8788,
      overrides: [{
        sourceRecordId: raw.entryId,
        sourceIndex: 0,
        featureSha256: "a".repeat(64),
        displayName: "承認済み表示名",
        hidden: false,
      }],
    });
    expect(renderPlaceCard(container, raw, undefined, resolver)).toBe(true);
    expect(container.querySelector("h2")?.textContent).toBe("承認済み表示名");
    expect(container.textContent).toContain("原資料表記");
    expect(container.textContent).toContain(raw.name);
    expect(container.textContent).toContain(raw.category);
    expect(container.textContent).toContain(raw.sheet);
    expect(container.querySelector("a")?.href).toBe(raw.sourceUrl);
    expect(raw).toEqual(original);
  });

  it("renders the approved 20-246 heading with its preserved source name", () => {
    const raw = {
      ...place(),
      entryId: "20-246",
      name: "大田摂津守",
      sourceUrl: "https://codh.rois.ac.jp/edo-maps/owariya/20/1853/20-246.html.ja",
    };
    expect(renderPlaceCard(container, raw)).toBe(true);
    expect(container.querySelector("h2")?.textContent).toBe("太田摂津守");
    expect(container.textContent).toContain("原資料表記");
    expect(container.textContent).toContain("大田摂津守");
  });

  it("renders the approved 21-034 heading with its preserved source name", () => {
    const raw = {
      ...place(),
      entryId: "21-034",
      name: "永照寺",
      sourceUrl: "https://codh.rois.ac.jp/edo-maps/owariya/21/1853/21-034.html.ja",
    };
    expect(renderPlaceCard(container, raw)).toBe(true);
    expect(container.querySelector("h2")?.textContent).toBe("永昌寺");
    expect(container.textContent).toContain("原資料表記");
    expect(container.textContent).toContain("永照寺");
  });

  it("approved hideは内容もfocusable elementも描画せずfail closedにする", () => {
    const raw = place();
    const resolver = createEdoCardResolver({
      schemaVersion: 1,
      sourceDataSha256: "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4",
      sourceFeatureCount: 8788,
      applicableSourceCount: 8788,
      renderableCardCount: 8787,
      overrides: [{
        sourceRecordId: raw.entryId,
        sourceIndex: 0,
        featureSha256: "a".repeat(64),
        displayName: null,
        hidden: true,
      }],
    });
    expect(renderPlaceCard(container, raw, undefined, resolver)).toBe(false);
    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
    expect(container.textContent).toBe("");
    expect(container.querySelectorAll("a,button,[tabindex]")).toHaveLength(0);
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
