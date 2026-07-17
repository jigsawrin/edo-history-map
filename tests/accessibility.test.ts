import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** index.html の静的なアクセシビリティ属性を検証する。 */
let doc: Document;

beforeAll(() => {
  const html = readFileSync(join(__dirname, "..", "index.html"), "utf8");
  doc = new DOMParser().parseFromString(html, "text/html");
});

describe("アクセシビリティ(静的マークアップ)", () => {
  it("lang=ja が指定されている", () => {
    expect(doc.documentElement.lang).toBe("ja");
  });

  it("スキップリンクがある", () => {
    const skip = doc.querySelector(".skip-link");
    expect(skip).not.toBeNull();
    expect(skip?.getAttribute("href")).toBe("#map");
  });

  it("地図領域に aria-label とキーボード操作の説明がある", () => {
    const map = doc.getElementById("map");
    expect(map?.getAttribute("role")).toBe("region");
    expect(map?.getAttribute("aria-label")).toContain("キー");
    const describedBy = map?.getAttribute("aria-describedby");
    expect(describedBy).toBe("map-help");
    expect(doc.getElementById(describedBy as string)?.textContent).toContain(
      "地図を直接操作しにくい場合",
    );
  });

  it("透明度スライダーがラベルと関連付き、aria-valuetext を持つ", () => {
    const slider = doc.getElementById("opacity-slider");
    expect(slider?.getAttribute("aria-labelledby")).toBe("opacity-label");
    expect(slider?.getAttribute("aria-valuetext")).toContain("パーセント");
    expect(doc.getElementById("opacity-label")?.textContent).toContain(
      "不透明度",
    );
    const baseSlider = doc.getElementById("base-opacity-slider");
    expect(baseSlider?.getAttribute("aria-labelledby")).toBe(
      "base-opacity-label",
    );
    expect(doc.getElementById("base-opacity-label")?.textContent).toContain(
      "現代基図",
    );
  });

  it("セレクトボックスに aria-label がある", () => {
    expect(
      doc.getElementById("era-select")?.getAttribute("aria-label"),
    ).toBeTruthy();
    expect(
      doc.getElementById("base-select")?.getAttribute("aria-label"),
    ).toBeTruthy();
  });

  it("地域selectがラベルと関連付き、1地域時は静的に非表示である", () => {
    const control = doc.getElementById("region-control");
    const select = doc.getElementById("region-select");
    expect(control?.hasAttribute("hidden")).toBe(true);
    expect(select?.getAttribute("aria-labelledby")).toBe(
      "region-select-label",
    );
    expect(doc.getElementById("region-select-label")?.textContent).toBe("地域");
  });

  it("地域変更通知用のaria-live領域がある", () => {
    const status = doc.getElementById("region-status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.getAttribute("aria-atomic")).toBe("true");
  });

  it("情報カードが aria-live リージョンである", () => {
    const card = doc.getElementById("info-card");
    expect(card?.getAttribute("aria-live")).toBe("polite");
    expect(card?.getAttribute("aria-atomic")).toBe("true");
  });

  it("地点検索パネルが標準フォームと見出しに関連付いている", () => {
    const open = doc.getElementById("place-search-open");
    const panel = doc.getElementById("place-search-panel");
    expect(open?.getAttribute("aria-controls")).toBe("place-search-panel");
    expect(open?.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.getAttribute("aria-labelledby")).toBe("place-search-heading");
    expect(doc.getElementById("place-search-form")?.getAttribute("role")).toBe("search");
  });

  it("地点検索入力はラベル、search型、100文字上限を持つ", () => {
    const input = doc.getElementById("place-search-input");
    expect(input?.getAttribute("type")).toBe("search");
    expect(input?.getAttribute("maxlength")).toBe("100");
    expect(doc.getElementById("place-search-input-label")?.getAttribute("for")).toBe(
      "place-search-input",
    );
  });

  it("地点分類selectは表示ラベルと関連付いている", () => {
    const select = doc.getElementById("place-category-filter");
    const label = doc.querySelector('label[for="place-category-filter"]');
    expect(select?.tagName).toBe("SELECT");
    expect(label?.textContent).toBe("分類");
  });

  it("地点検索結果はol、専用aria-live、通常buttonのページ操作を持つ", () => {
    expect(doc.getElementById("place-search-results")?.tagName).toBe("OL");
    expect(doc.getElementById("place-search-status")?.getAttribute("role")).toBe(
      "status",
    );
    expect(doc.getElementById("place-search-status")?.getAttribute("aria-live")).toBe(
      "polite",
    );
    expect(doc.getElementById("place-search-previous")?.tagName).toBe("BUTTON");
    expect(doc.getElementById("place-search-next")?.tagName).toBe("BUTTON");
    expect(doc.getElementById("place-search-close")?.tagName).toBe("BUTTON");
  });

  it("地図の代替操作説明が地域別検索一覧を案内する", () => {
    const help = doc.getElementById("map-help")?.textContent ?? "";
    expect(help).toContain("HTMLボタン");
    expect(help).toContain("江戸地名を検索");
    expect(help).toContain("幕末史跡を検索");
  });

  it("各ダイアログに見出しが関連付けられている", () => {
    for (const dialog of Array.from(doc.querySelectorAll("dialog"))) {
      const labelledBy = dialog.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(doc.getElementById(labelledBy as string)).not.toBeNull();
    }
  });

  it("JavaScript 非対応環境向けの説明(noscript)がある", () => {
    const noscript = doc.querySelector("noscript");
    expect(noscript?.textContent).toContain("JavaScript");
    expect(noscript?.querySelector('a[href="./places/"]')?.textContent).toBe(
      "歴史地点一覧",
    );
  });

  it("地図版からJavaScript不要の歴史地点一覧へ到達できる", () => {
    const link = doc.querySelector('a.toolbar-link[href="./places/"]');
    expect(link?.textContent).toBe("歴史地点一覧");
  });

  it("位置情報ダイアログに保存しない旨と外部通信の説明がある", () => {
    const text = doc.getElementById("geo-dialog")?.textContent ?? "";
    expect(text).toContain("独自サーバーへ保存しません");
    expect(text).toContain("IPアドレス");
    expect(text).toContain("ホスティング事業者");
  });

  it("古地図を証拠として扱わない旨の注意が常時表示される", () => {
    const footer = doc.querySelector(".app-footer")?.textContent ?? "";
    expect(footer).toContain("推定");
    expect(footer).toContain("証拠");
  });

  it("viewport が設定されている(モバイル対応)", () => {
    const viewport = doc.querySelector('meta[name="viewport"]');
    expect(viewport?.getAttribute("content")).toContain("width=device-width");
  });
});
