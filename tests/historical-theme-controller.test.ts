import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoricalThemeController, type HistoricalThemeElements } from "../src/historical-theme-controller";
import { historicalThemeRegistry } from "../src/historical-theme-registry";

function elements(): HistoricalThemeElements {
  const openButton = document.createElement("button");
  openButton.setAttribute("aria-expanded", "false");
  const panel = document.createElement("section");
  panel.hidden = true;
  const input = document.createElement("input");
  const type = document.createElement("select");
  for (const [value, label] of [["", "すべて"], ["person", "人物"]] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    type.append(option);
  }
  const list = document.createElement("ol");
  const detail = document.createElement("div");
  const status = document.createElement("p");
  const closeButton = document.createElement("button");
  panel.append(input, type, list, detail, status, closeButton);
  document.body.replaceChildren(openButton, panel);
  return {
    openButton,
    panel,
    input,
    type,
    list,
    detail,
    status,
    closeButton,
  };
}

describe("歴史テーマコントローラー", () => {
  beforeEach(() => { document.body.replaceChildren(); });

  it("通常ボタンで開閉し、Escapeでフォーカスを戻す", () => {
    const refs = elements();
    new HistoricalThemeController({ elements: refs, resolvePlace: () => ({ name: "地点", regionEraLabel: "京都・幕末", coordinateConfidence: "高" }), onSelectPlace: vi.fn() });
    refs.openButton.click();
    expect(refs.panel.hidden).toBe(false);
    expect(refs.openButton.getAttribute("aria-expanded")).toBe("true");
    refs.panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(refs.panel.hidden).toBe(true);
    expect(document.activeElement).toBe(refs.openButton);
  });

  it("検索・種別絞り込み・テーマ詳細から既存地点選択コールバックへ渡す", () => {
    const refs = elements();
    const select = vi.fn();
    new HistoricalThemeController({
      elements: refs,
      themes: historicalThemeRegistry,
      resolvePlace: (reference) => ({ name: reference.placeId, regionEraLabel: "地域・時期", coordinateConfidence: "高", locationCaution: "位置注意" }),
      onSelectPlace: select,
    });
    refs.input.value = "RYOMA<script>";
    refs.input.dispatchEvent(new Event("input"));
    expect(refs.list.textContent).not.toContain("<script>");
    refs.input.value = "龍馬";
    refs.input.dispatchEvent(new Event("input"));
    expect(refs.list.querySelectorAll("button")).toHaveLength(1);
    refs.list.querySelector<HTMLButtonElement>("button")!.click();
    expect(refs.detail.textContent).toContain("坂本龍馬");
    const placeButton = refs.detail.querySelector<HTMLButtonElement>("button")!;
    placeButton.click();
    expect(select).toHaveBeenCalledOnce();
    expect(select.mock.calls[0]?.[0].datasetId).toBe("project-kyoto-bakumatsu-places");
  });
});
