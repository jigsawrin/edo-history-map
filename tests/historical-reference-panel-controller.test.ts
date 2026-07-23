// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import registry from "../src/historical-reference-panel-registry.json";
import { HistoricalReferencePanelController, type ReferencePanelElements } from "../src/historical-reference-panel-controller";
import type { ReferenceEntry } from "../src/historical-reference-panel";

const entry = registry.entries[0] as unknown as ReferenceEntry;
function setup() {
  document.body.replaceChildren();
  const names = ["prompt","open","status","dialog","title","date","warning","description","viewport","image","imageStatus","zoomOut","zoomIn","zoomReset","zoomStatus","source","license","attribution","disclosure","close"] as const;
  const tags:Record<string,string>={open:"button",dialog:"dialog",image:"img",zoomOut:"button",zoomIn:"button",zoomReset:"button",source:"a",license:"a",close:"button"};
  const values = Object.fromEntries(names.map((name)=>[name,document.createElement(tags[name]??"div")])) as unknown as ReferencePanelElements;
  for (const element of Object.values(values)) document.body.append(element);
  Object.defineProperty(values.dialog,"showModal",{value:()=>values.dialog.setAttribute("open","")});
  Object.defineProperty(values.dialog,"close",{value:()=>{values.dialog.removeAttribute("open");values.dialog.dispatchEvent(new Event("close"));}});
  values.prompt.hidden=true;
  return { values, controller:new HistoricalReferencePanelController(values) };
}
describe("historical reference panel controller",()=>{
  beforeEach(()=>vi.restoreAllMocks());
  it("starts hidden, shows only a prompt, and lazy-loads on explicit open",()=>{const {values,controller}=setup();expect(values.image.getAttribute("src")).toBeNull();controller.setEntry(entry);expect(values.prompt.hidden).toBe(false);expect(values.dialog.open).toBe(false);values.open.click();expect(values.dialog.open).toBe(true);expect(values.image.getAttribute("src")).toContain(entry.image.publicPath);expect(values.warning.textContent).toContain("年代が異なります");expect(values.attribution.textContent).toContain("東京都立中央図書館");});
  it("updates zoom, reports image error, closes with Escape, and restores focus",()=>{const {values,controller}=setup();controller.setEntry(entry);values.open.click();values.zoomIn.click();expect(values.zoomStatus.textContent).toBe("150%");values.zoomReset.click();expect(values.zoomStatus.textContent).toBe("全体表示");values.image.dispatchEvent(new Event("error"));expect(values.imageStatus.textContent).toContain("読み込めません");const focus=vi.spyOn(values.open,"focus");values.dialog.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));expect(values.dialog.open).toBe(false);expect(focus).toHaveBeenCalled();});
  it("does not interpret registry text as HTML",()=>{const {values,controller}=setup();controller.setEntry({...entry,titleJa:"<img src=x>"});values.open.click();expect(values.title.querySelector("img")).toBeNull();expect(values.title.textContent).toBe("<img src=x>");});
});
