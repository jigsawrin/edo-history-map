import { calculateReferenceImageLayout, type ReferenceEntry } from "./historical-reference-panel";

export interface ReferencePanelElements { prompt:HTMLElement; open:HTMLButtonElement; status:HTMLElement; dialog:HTMLDialogElement; title:HTMLElement; date:HTMLElement; warning:HTMLElement; description:HTMLElement; viewport:HTMLElement; stage:HTMLElement; image:HTMLImageElement; imageStatus:HTMLElement; zoomOut:HTMLButtonElement; zoomIn:HTMLButtonElement; zoomReset:HTMLButtonElement; zoomStatus:HTMLElement; source:HTMLAnchorElement; license:HTMLAnchorElement; attribution:HTMLElement; disclosure:HTMLElement; close:HTMLButtonElement }

export class HistoricalReferencePanelController {
  private entry:ReferenceEntry|null=null;
  private scaleIndex=0;
  private readonly scales=[1,1.5,2];
  private imageRequestGeneration=0;
  private imageEntryId:string|null=null;
  private readonly resizeObserver:ResizeObserver|null;

  constructor(private readonly el:ReferencePanelElements){
    el.open.addEventListener("click",()=>this.open());
    el.close.addEventListener("click",()=>el.dialog.close());
    el.dialog.addEventListener("keydown",(event)=>{
      if(event.key==="Escape"&&el.dialog.open){
        event.preventDefault();
        el.dialog.close();
      }
    });
    el.dialog.addEventListener("close",()=>{
      el.open.setAttribute("aria-expanded","false");
      if(this.entry&&!el.prompt.hidden&&el.open.tabIndex>=0)el.open.focus();
    });
    el.zoomIn.addEventListener("click",()=>this.zoom(1));
    el.zoomOut.addEventListener("click",()=>this.zoom(-1));
    el.zoomReset.addEventListener("click",()=>this.resetZoom());
    this.resizeObserver=typeof ResizeObserver==="undefined"?null:new ResizeObserver(()=>this.applyZoom());
    this.resizeObserver?.observe(el.viewport);
    this.resetZoom();
  }

  setEntry(entry:ReferenceEntry|null):void {
    const previousId=this.entry?.id??null;
    const nextId=entry?.id??null;
    if(previousId===nextId){
      this.entry=entry;
      if(entry){
        this.el.prompt.hidden=false;
        this.el.open.tabIndex=0;
        this.el.open.textContent=entry.promptLabelJa;
        this.el.open.setAttribute("aria-expanded",String(this.el.dialog.open));
      }
      return;
    }

    this.entry=null;
    this.el.prompt.hidden=true;
    this.el.open.tabIndex=-1;
    this.invalidateImageRequest();
    this.clearEntryContent();
    this.resetZoom();
    if(this.el.dialog.open)this.el.dialog.close();

    this.entry=entry;
    if(entry){
      this.el.prompt.hidden=false;
      this.el.open.tabIndex=0;
      this.el.open.textContent=entry.promptLabelJa;
      this.el.open.setAttribute("aria-expanded","false");
      this.el.status.textContent=`${entry.titleJa}の参考画像を利用できます。`;
    }else{
      this.el.open.setAttribute("aria-expanded","false");
      this.el.status.textContent="";
    }
  }

  private open():void {
    const entry=this.entry;
    if(!entry||this.el.dialog.open)return;
    this.resetZoom();
    this.el.title.textContent=entry.titleJa;
    this.el.date.textContent=`${entry.sourceDateDisplayJa}・${entry.historicalPeriodJa}`;
    this.el.warning.textContent=entry.cautionJa;
    this.el.description.textContent=entry.descriptionJa;
    this.el.attribution.textContent=`出典: ${entry.attributionJa}`;
    this.el.disclosure.textContent=entry.derivativeDisclosureJa.replace(/行った。$/u,"行いました。");
    this.el.source.href=entry.sourceUrl;
    this.el.license.href=entry.licenseUrl;
    this.el.image.alt=entry.altJa;
    this.el.image.width=entry.image.width;
    this.el.image.height=entry.image.height;
    this.el.imageStatus.textContent="画像を読み込んでいます。";

    const imageUrl=`${import.meta.env.BASE_URL}${entry.image.publicPath.replace(/^\//u,"")}`;
    const generation=++this.imageRequestGeneration;
    this.imageEntryId=entry.id;
    this.el.image.onload=()=>{
      if(this.isCurrentImageRequest(entry.id,generation,imageUrl)){
        this.el.imageStatus.textContent="画像を読み込みました。";
      }
    };
    this.el.image.onerror=()=>{
      if(this.isCurrentImageRequest(entry.id,generation,imageUrl)){
        this.el.imageStatus.textContent="画像を読み込めませんでした。地図や出典は引き続き利用できます。";
      }
    };
    this.el.image.src=imageUrl;
    this.el.open.setAttribute("aria-expanded","true");
    this.el.dialog.showModal();
    this.applyZoom();
  }

  private isCurrentImageRequest(entryId:string,generation:number,imageUrl:string):boolean {
    return this.entry?.id===entryId&&this.imageEntryId===entryId&&
      this.imageRequestGeneration===generation&&this.el.image.getAttribute("src")===imageUrl;
  }

  private invalidateImageRequest():void {
    this.imageRequestGeneration+=1;
    this.imageEntryId=null;
    this.el.image.onload=null;
    this.el.image.onerror=null;
  }

  private clearEntryContent():void {
    this.el.image.removeAttribute("src");
    this.el.image.removeAttribute("width");
    this.el.image.removeAttribute("height");
    this.clearImageLayout();
    this.el.image.alt="";
    this.el.imageStatus.textContent="";
    this.el.title.textContent="";
    this.el.date.textContent="";
    this.el.warning.textContent="";
    this.el.description.textContent="";
    this.el.attribution.textContent="";
    this.el.disclosure.textContent="";
    this.el.source.removeAttribute("href");
    this.el.license.removeAttribute("href");
  }

  private zoom(delta:number):void{
    this.scaleIndex=Math.max(0,Math.min(this.scales.length-1,this.scaleIndex+delta));
    this.applyZoom();
  }

  private resetZoom():void{
    this.scaleIndex=0;
    this.el.viewport.scrollLeft=0;
    this.el.viewport.scrollTop=0;
    this.applyZoom();
  }

  private applyZoom():void{
    const scale=this.scales[this.scaleIndex]!;
    const entry=this.entry;
    const layout=entry&&calculateReferenceImageLayout(
      entry.image.width,
      entry.image.height,
      entry.displayRotationDegrees,
      this.el.viewport.clientWidth,
      this.el.viewport.clientHeight,
      scale,
    );
    if(layout){
      this.el.stage.style.width=`${layout.displayWidth}px`;
      this.el.stage.style.height=`${layout.displayHeight}px`;
      this.el.image.style.width=`${layout.sourceWidth}px`;
      this.el.image.style.height=`${layout.sourceHeight}px`;
      this.el.image.style.transform=`translate(-50%, -50%) rotate(${entry.displayRotationDegrees}deg)`;
    }else{
      this.clearImageLayout();
    }
    this.el.zoomStatus.textContent=scale===1?"全体表示":`${scale*100}%`;
    this.el.zoomOut.disabled=this.scaleIndex===0;
    this.el.zoomIn.disabled=this.scaleIndex===this.scales.length-1;
  }

  private clearImageLayout():void{
    this.el.stage.style.removeProperty("width");
    this.el.stage.style.removeProperty("height");
    this.el.image.style.removeProperty("width");
    this.el.image.style.removeProperty("height");
    this.el.image.style.removeProperty("transform");
  }

  dispose():void{
    this.invalidateImageRequest();
    this.resizeObserver?.disconnect();
    if(this.el.dialog.open)this.el.dialog.close();
  }
}
