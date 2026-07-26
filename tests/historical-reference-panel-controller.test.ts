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
  it("starts hidden with deterministic full-view controls, then lazy-loads on explicit open",()=>{const {values,controller}=setup();expect(values.image.getAttribute("src")).toBeNull();expect(values.zoomStatus.textContent).toBe("全体表示");expect(values.zoomOut.disabled).toBe(true);expect(values.zoomIn.disabled).toBe(false);expect(values.image.style.width).toBe("100%");expect(values.image.style.maxWidth).toBe("100%");controller.setEntry(entry);expect(values.prompt.hidden).toBe(false);expect(values.dialog.open).toBe(false);values.open.click();expect(values.dialog.open).toBe(true);expect(values.image.getAttribute("src")).toContain(entry.image.publicPath);expect(values.warning.textContent).toContain("年代が異なります");expect(values.attribution.textContent).toContain("東京都立中央図書館");});
  it("zooms to 200%, resets scale and scroll, resets again on reopen, and restores focus",()=>{const {values,controller}=setup();controller.setEntry(entry);values.open.click();values.zoomIn.click();values.zoomIn.click();expect(values.zoomStatus.textContent).toBe("200%");expect(values.zoomIn.disabled).toBe(true);values.viewport.scrollLeft=320;values.viewport.scrollTop=180;values.zoomReset.click();expect(values.zoomStatus.textContent).toBe("全体表示");expect(values.zoomOut.disabled).toBe(true);expect(values.viewport.scrollLeft).toBe(0);expect(values.viewport.scrollTop).toBe(0);values.zoomIn.click();values.viewport.scrollLeft=40;values.viewport.scrollTop=20;const focus=vi.spyOn(values.open,"focus");values.dialog.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));expect(values.dialog.open).toBe(false);expect(focus).toHaveBeenCalled();values.open.click();expect(values.zoomStatus.textContent).toBe("全体表示");expect(values.viewport.scrollLeft).toBe(0);expect(values.viewport.scrollTop).toBe(0);expect(values.image.getAttribute("src")).toContain(entry.image.publicPath);});
  it("does not interpret registry text as HTML",()=>{const {values,controller}=setup();controller.setEntry({...entry,titleJa:"<img src=x>"});values.open.click();expect(values.title.querySelector("img")).toBeNull();expect(values.title.textContent).toBe("<img src=x>");});
});
