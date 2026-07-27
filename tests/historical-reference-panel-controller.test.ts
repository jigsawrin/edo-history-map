// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import registry from "../src/historical-reference-panel-registry.json";
import { HistoricalReferencePanelController, type ReferencePanelElements } from "../src/historical-reference-panel-controller";
import type { ReferenceEntry } from "../src/historical-reference-panel";

const [wadakura,babasaki] = registry.entries as unknown as ReferenceEntry[];

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

  it("starts without a request, uses the Wadakura prompt, and lazy-loads its current image",()=>{
    const {values,controller}=setup();
    expect(values.image.getAttribute("src")).toBeNull();
    expect(values.zoomStatus.textContent).toBe("全体表示");
    expect(values.zoomOut.disabled).toBe(true);
    expect(values.zoomIn.disabled).toBe(false);
    controller.setEntry(wadakura!);
    expect(values.open.textContent).toBe(wadakura!.promptLabelJa);
    expect(values.status.textContent).toBe(`${wadakura!.titleJa}の参考画像を利用できます。`);
    expect(values.image.getAttribute("src")).toBeNull();
    values.open.click();
    expect(values.dialog.open).toBe(true);
    expect(values.image.getAttribute("src")).toContain(wadakura!.image.publicPath);
    expect(values.imageStatus.textContent).toBe("画像を読み込んでいます。");
    values.image.onload?.(new Event("load"));
    expect(values.imageStatus.textContent).toBe("画像を読み込みました。");
  });

  it("switches Wadakura to Babasaki and back without stale image, metadata, zoom, or scroll",()=>{
    const {values,controller}=setup();
    controller.setEntry(wadakura!);
    values.open.click();
    values.image.onload?.(new Event("load"));
    values.zoomIn.click();
    values.viewport.scrollLeft=320;
    values.viewport.scrollTop=180;
    values.close.click();

    controller.setEntry(babasaki!);
    expect(values.open.textContent).toBe(babasaki!.promptLabelJa);
    expect(values.image.getAttribute("src")).toBeNull();
    expect(values.image.alt).toBe("");
    expect(values.image.hasAttribute("width")).toBe(false);
    expect(values.image.hasAttribute("height")).toBe(false);
    expect(values.imageStatus.textContent).toBe("");
    expect(values.title.textContent).toBe("");
    expect(values.source.hasAttribute("href")).toBe(false);
    expect(values.zoomStatus.textContent).toBe("全体表示");
    expect(values.viewport.scrollLeft).toBe(0);
    expect(values.viewport.scrollTop).toBe(0);

    values.open.click();
    expect(values.image.getAttribute("src")).toContain(babasaki!.image.publicPath);
    expect(values.title.textContent).toBe(babasaki!.titleJa);
    expect(values.image.alt).toBe(babasaki!.altJa);
    expect(values.attribution.textContent).toContain("第2図 馬場先御門");
    values.close.click();
    controller.setEntry(wadakura!);
    values.open.click();
    expect(values.image.getAttribute("src")).toContain(wadakura!.image.publicPath);
    expect(values.title.textContent).toBe(wadakura!.titleJa);
  });

  it("does not discard a loaded image when the same entry is set again",()=>{
    const {values,controller}=setup();
    controller.setEntry(wadakura!);
    values.open.click();
    values.close.click();
    const src=values.image.getAttribute("src");
    controller.setEntry(wadakura!);
    expect(values.image.getAttribute("src")).toBe(src);
  });

  it("reports current load/error only and ignores a prior entry's delayed handlers",()=>{
    const {values,controller}=setup();
    controller.setEntry(wadakura!);
    values.open.click();
    const staleLoad=values.image.onload!;
    const staleError=values.image.onerror!;
    values.close.click();
    controller.setEntry(babasaki!);
    values.open.click();
    const currentError=values.image.onerror!;
    staleLoad.call(values.image,new Event("load"));
    staleError.call(values.image,new Event("error"));
    expect(values.imageStatus.textContent).toBe("画像を読み込んでいます。");
    currentError.call(values.image,new Event("error"));
    expect(values.imageStatus.textContent).toBe("画像を読み込めませんでした。地図や出典は引き続き利用できます。");
    expect(values.dialog.open).toBe(true);
    expect(values.source.href).toBe(babasaki!.sourceUrl);
    expect(values.close.disabled).toBe(false);
  });

  it("resets on reopen and restores focus only to a visible current prompt",()=>{
    const {values,controller}=setup();
    const focus=vi.spyOn(values.open,"focus");
    controller.setEntry(wadakura!);
    values.open.click();
    values.zoomIn.click();
    values.viewport.scrollLeft=40;
    values.dialog.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    expect(focus).toHaveBeenCalledTimes(1);
    values.open.click();
    expect(values.zoomStatus.textContent).toBe("全体表示");
    expect(values.viewport.scrollLeft).toBe(0);
    controller.setEntry(null);
    expect(values.prompt.hidden).toBe(true);
    expect(values.open.tabIndex).toBe(-1);
    expect(values.dialog.open).toBe(false);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("does not interpret registry text as HTML",()=>{
    const {values,controller}=setup();
    controller.setEntry({...wadakura!,titleJa:"<img src=x>",promptLabelJa:"<b>bad</b>"});
    expect(values.open.querySelector("b")).toBeNull();
    values.open.click();
    expect(values.title.querySelector("img")).toBeNull();
    expect(values.title.textContent).toBe("<img src=x>");
  });
});
