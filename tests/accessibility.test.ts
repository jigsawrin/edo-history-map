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
  });

  it("セレクトボックスに aria-label がある", () => {
    expect(
      doc.getElementById("era-select")?.getAttribute("aria-label"),
    ).toBeTruthy();
    expect(
      doc.getElementById("base-select")?.getAttribute("aria-label"),
    ).toBeTruthy();
  });

  it("情報カードが aria-live リージョンである", () => {
    const card = doc.getElementById("info-card");
    expect(card?.getAttribute("aria-live")).toBe("polite");
    expect(card?.getAttribute("aria-atomic")).toBe("true");
  });

  it("各ダイアログに見出しが関連付けられている", () => {
    for (const dialog of Array.from(doc.querySelectorAll("dialog"))) {
      const labelledBy = dialog.getAttribute("aria-labelledby");
      expect(labelledBy).toBeTruthy();
      expect(doc.getElementById(labelledBy as string)).not.toBeNull();
    }
  });

  it("JavaScript 非対応環境向けの説明(noscript)がある", () => {
    expect(doc.querySelector("noscript")?.textContent).toContain(
      "JavaScript",
    );
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
