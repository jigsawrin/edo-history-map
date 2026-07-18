import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoricalTimelineController, type HistoricalTimelineElements } from "../src/historical-timeline-controller";
import { historicalTimelineRegistry } from "../src/historical-timeline-registry";

function elements(): HistoricalTimelineElements {
  const openButton = document.createElement("button"); openButton.setAttribute("aria-expanded", "false");
  const panel = document.createElement("section"); panel.hidden = true;
  const input = document.createElement("input");
  const track = document.createElement("select"); for (const value of ["", "shiga-sengoku", "kyoto-bakumatsu"]) { const option = document.createElement("option"); option.value = value; track.append(option); }
  const type = document.createElement("select"); for (const value of ["", "battle", "incident"]) { const option = document.createElement("option"); option.value = value; type.append(option); }
  const list = document.createElement("ol"); const detail = document.createElement("div"); const status = document.createElement("p"); const closeButton = document.createElement("button");
  panel.append(input, track, type, list, detail, status, closeButton); document.body.replaceChildren(openButton, panel);
  return { openButton, panel, input, track, type, list, detail, status, closeButton };
}

describe("歴史年表コントローラー", () => {
  beforeEach(() => document.body.replaceChildren());

  it("通常ボタンで開閉しEscapeで起点へフォーカスを戻す", () => {
    const refs = elements(); new HistoricalTimelineController({ elements: refs, resolvePlace: () => ({ name: "地点", coordinateConfidence: "高" }), onSelectPlace: vi.fn() });
    refs.openButton.click(); expect(refs.panel.hidden).toBe(false); expect(refs.openButton.getAttribute("aria-expanded")).toBe("true");
    refs.panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); expect(refs.panel.hidden).toBe(true); expect(document.activeElement).toBe(refs.openButton);
  });

  it("検索・track・type絞り込み後もorder順で表示する", () => {
    const refs = elements(); new HistoricalTimelineController({ elements: refs, resolvePlace: () => ({ name: "地点", coordinateConfidence: "高" }), onSelectPlace: vi.fn() });
    refs.track.value = "kyoto-bakumatsu"; refs.track.dispatchEvent(new Event("change")); refs.type.value = "incident"; refs.type.dispatchEvent(new Event("change"));
    expect(refs.list.querySelectorAll("button")).toHaveLength(5);
    refs.input.value = "寺田屋"; refs.input.dispatchEvent(new Event("input")); expect(refs.list.querySelectorAll("button")).toHaveLength(2);
  });

  it("項目選択でaria-current・詳細・日付注意・テーマ・出典を表示する", () => {
    const refs = elements(); new HistoricalTimelineController({ elements: refs, entries: historicalTimelineRegistry, resolvePlace: (reference) => ({ name: reference.placeId, coordinateConfidence: "高", locationCaution: "代表地点の注意" }), onSelectPlace: vi.fn() });
    refs.input.value = "池田屋事件"; refs.input.dispatchEvent(new Event("input")); const button = refs.list.querySelector<HTMLButtonElement>("button")!; button.click();
    expect(refs.list.querySelector('[aria-current="true"]')).not.toBeNull(); expect(refs.detail.textContent).toContain("グレゴリオ暦へ換算していません"); expect(refs.detail.textContent).toContain("関連テーマ"); expect(refs.detail.querySelectorAll('a[target="_blank"][rel="noopener noreferrer"]').length).toBeGreaterThan(0);
  });

  it("関連地点を通常ボタンから選択しaria-live通知を更新する", () => {
    const refs = elements(); const select = vi.fn(); new HistoricalTimelineController({ elements: refs, resolvePlace: (reference) => ({ name: reference.placeId, coordinateConfidence: "中" }), onSelectPlace: select });
    refs.input.value = "比叡山焼き討ち"; refs.input.dispatchEvent(new Event("input")); refs.list.querySelector<HTMLButtonElement>("button")!.click(); refs.detail.querySelector<HTMLButtonElement>("button")!.click();
    expect(select).toHaveBeenCalledOnce(); expect(refs.status.textContent).toContain("関連地点1件");
  });
});
