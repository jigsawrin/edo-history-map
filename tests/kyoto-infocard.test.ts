import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KyotoBakumatsuPlace } from "../src/kyoto-bakumatsu-places";
import {
  renderKyotoNoData,
  renderKyotoPlaceCard,
} from "../src/kyoto-infocard";
import {
  KYOTO_SOURCE_DEFINITIONS,
  type KyotoHistoricalSourceDefinition,
} from "../src/kyoto-source-registry";

function firstSource(): KyotoHistoricalSourceDefinition {
  const source = KYOTO_SOURCE_DEFINITIONS[0];
  if (!source) throw new Error("京都出典レジストリが空です");
  return source;
}

const FIRST_SOURCE = firstSource();

function place(
  overrides: Partial<KyotoBakumatsuPlace> = {},
): KyotoBakumatsuPlace {
  return {
    id: "kyoto-fixture-01",
    nameJa: "池田屋事件関係地",
    nameEn: "Ikedaya Incident Site",
    category: "incident",
    longitude: 135.77,
    latitude: 35.008,
    eraId: "bakumatsu",
    dateDisplayJa: "元治元年（1864年）",
    startYear: 1864,
    endYear: 1864,
    summaryJa:
      "幕末期の京都で発生した出来事に関係する地点です。公的資料を照合し、本プロジェクトが現在地と歴史位置の違いへ配慮して独自に作成した説明文です。",
    locationBasis: "official-historic-marker",
    historicalSiteStatus: "marker-only",
    coordinateConfidence: "high",
    locationNoteJa:
      "現在は公的資料に記録された史跡表示の位置を示し、当時の建物の現存を意味しません。",
    sourceIds: [FIRST_SOURCE.id],
    sourceId: "project-kyoto-bakumatsu-places",
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("京都・幕末地点情報カード", () => {
  it("地点名・分類・年代・説明・位置関係・状態・精度・注意・出典を表示する", () => {
    const target = place();
    renderKyotoPlaceCard(container, target);

    expect(container.hidden).toBe(false);
    expect(container.querySelector("h2")?.textContent).toBe(target.nameJa);
    expect(container.textContent).toContain("分類");
    expect(container.textContent).toContain("事件・遭難");
    expect(container.textContent).toContain(target.dateDisplayJa);
    expect(container.textContent).toContain(target.summaryJa);
    expect(container.textContent).toContain("公的データベースに記録された史跡碑");
    expect(container.textContent).toContain("史跡の状態");
    expect(container.textContent).toContain("史跡表示のみ");
    expect(container.textContent).toContain("位置精度");
    expect(container.textContent).toContain("高");
    expect(container.textContent).toContain(`位置について：${target.locationNoteJa}`);
    expect(container.textContent).toContain("出典");
    expect(container.textContent).toContain(FIRST_SOURCE.publisher);
    expect(container.textContent).toContain(FIRST_SOURCE.title);
    expect(container.querySelector("button")?.textContent).toBe("閉じる");
  });

  it("出典リンクを固定レジストリから解決し新規タブを安全に開く", () => {
    renderKyotoPlaceCard(container, place());
    const link = container.querySelector("a");

    expect(link?.href).toBe(FIRST_SOURCE.url);
    expect(link?.target).toBe("_blank");
    expect(link?.rel.split(/\s+/)).toEqual(
      expect.arrayContaining(["noopener", "noreferrer"]),
    );
  });

  it("medium精度では代表点であり歴史上の一点とは限らない注意を表示する", () => {
    renderKyotoPlaceCard(
      container,
      place({ coordinateConfidence: "medium" }),
    );

    expect(container.textContent).toContain("位置精度は中です");
    expect(container.textContent).toContain("幕末当時の一点と一致するとは限りません");
    expect(container.querySelector(".card-warning")).not.toBeNull();
  });

  it("innerHTMLを使わず、HTMLらしい文字列もDOMとして解釈しない", () => {
    const innerHtmlSetter = vi.spyOn(Element.prototype, "innerHTML", "set");
    renderKyotoPlaceCard(
      container,
      place({
        nameJa: '<img src=x onerror="window.__kyotoPwned=true">',
        summaryJa: "<script>window.__kyotoPwned=true</script>",
      }),
    );

    expect(innerHtmlSetter).not.toHaveBeenCalled();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
    expect(Reflect.get(window, "__kyotoPwned")).toBeUndefined();
  });

  it("閉じるとカードを空にして呼び出し元へフォーカスを戻す", () => {
    const map = document.createElement("div");
    map.tabIndex = 0;
    document.body.prepend(map);
    map.focus();
    renderKyotoPlaceCard(container, place(), map);
    expect(document.activeElement).toBe(map);

    const close = container.querySelector("button");
    expect(close?.getAttribute("aria-label")).toContain("京都・幕末");
    close?.focus();
    close?.click();

    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
    expect(document.activeElement).toBe(map);
  });
});

describe("京都・幕末の空白地点カード", () => {
  it("京都固有のデータなし文言を表示しEDO文言を混ぜない", () => {
    renderKyotoNoData(container);

    expect(container.hidden).toBe(false);
    expect(container.textContent).toContain(
      "この地点には登録された京都・幕末史跡データがありません。",
    );
    expect(container.textContent).not.toContain("江戸地名");
  });

  it("閉じると呼び出し元へフォーカスを戻す", () => {
    const map = document.createElement("div");
    map.tabIndex = 0;
    document.body.prepend(map);
    renderKyotoNoData(container, map);
    container.querySelector("button")?.click();

    expect(container.hidden).toBe(true);
    expect(container.childElementCount).toBe(0);
    expect(document.activeElement).toBe(map);
  });
});
