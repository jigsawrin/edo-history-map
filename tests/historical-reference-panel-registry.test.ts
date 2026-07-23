/* eslint-disable @typescript-eslint/no-explicit-any */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditHistoricalReferencePanelRegistry } from "../scripts/historical-reference-panel-registry.mjs";

describe("historical reference panel registry audit", () => {
  const roots:string[]=[];
  afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
  function fixture(mutator:(data:{registry:any;assets:any;displays:any;candidates:any})=>void){
    const source=join(__dirname,"..");
    const root=mkdtempSync(join(tmpdir(),"reference-panel-"));
    roots.push(root);
    for(const path of ["src/historical-reference-panel-registry.json","data-curation/historical-reference-assets.json","data-curation/historical-map-display-catalog.json","data-curation/historical-raster-candidates.json","public/data/historical-reference-assets"]){
      mkdirSync(dirname(join(root,path)),{recursive:true});
      cpSync(join(source,path),join(root,path),{recursive:true});
    }
    const data={registry:JSON.parse(readFileSync(join(root,"src/historical-reference-panel-registry.json"),"utf8")),assets:JSON.parse(readFileSync(join(root,"data-curation/historical-reference-assets.json"),"utf8")),displays:JSON.parse(readFileSync(join(root,"data-curation/historical-map-display-catalog.json"),"utf8")),candidates:JSON.parse(readFileSync(join(root,"data-curation/historical-raster-candidates.json"),"utf8"))};
    mutator(data);
    for(const [path,value] of [["src/historical-reference-panel-registry.json",data.registry],["data-curation/historical-reference-assets.json",data.assets],["data-curation/historical-map-display-catalog.json",data.displays],["data-curation/historical-raster-candidates.json",data.candidates]] as const)writeFileSync(join(root,path),JSON.stringify(value));
    return auditHistoricalReferencePanelRegistry(root).errors;
  }
  it("accepts the published Wadakura entry and public image", () => {
    const result = auditHistoricalReferencePanelRegistry(join(__dirname, ".."));
    expect(result.errors).toEqual([]);
    expect(result.registry?.entries).toHaveLength(1);
  });
  it.each([
    ["unpublished asset",(d:any)=>d.assets.assets[0].publicationStatus="shortlisted"],
    ["unpublished display",(d:any)=>d.displays.maps[0].publicationStatus="shortlisted"],
    ["technical in-review",(d:any)=>d.displays.maps[0].technicalReviewStatus="in-review"],
    ["sourceId mismatch",(d:any)=>d.registry.entries[0].sourceId="missing-source"],
    ["assetId mismatch",(d:any)=>d.registry.entries[0].assetId="missing-asset"],
    ["publicPath mismatch",(d:any)=>d.registry.entries[0].image.publicPath="/data/historical-reference-assets/x/x.png"],
    ["SHA mismatch",(d:any)=>d.registry.entries[0].image.sha256="a".repeat(64)],
    ["bytes mismatch",(d:any)=>d.registry.entries[0].image.bytes=1],
    ["dimensions mismatch",(d:any)=>d.registry.entries[0].image.width=1],
    ["MIME mismatch",(d:any)=>d.registry.entries[0].image.mimeType="image/jpeg"],
    ["Polygon mismatch",(d:any)=>d.registry.entries[0].trigger.geometry.coordinates[0][0][0]=0],
    ["zoom mismatch",(d:any)=>d.registry.entries[0].trigger.zoom.enterDetailAt=18],
    ["sourceUrl mismatch",(d:any)=>d.registry.entries[0].sourceUrl="https://example.com/item"],
    ["licenseUrl mismatch",(d:any)=>d.registry.entries[0].licenseUrl="https://example.com/license"],
    ["attribution mismatch",(d:any)=>d.registry.entries[0].attributionJa="不一致"],
    ["disclosure mismatch",(d:any)=>d.registry.entries[0].derivativeDisclosureJa="不一致"],
    ["private path",(d:any)=>d.registry.entries[0].rawPath="data-raw/x"],
    ["HTML",(d:any)=>d.registry.entries[0].titleJa="<b>bad</b>"],
    ["control character",(d:any)=>d.registry.entries[0].titleJa="bad\u0000"],
    ["orphan runtime",(d:any)=>d.registry.entries[0].id="orphan-entry"],
    ["published display missing",(d:any)=>d.registry.entries=[]],
  ])("rejects %s",(_label,mutator)=>expect(fixture(mutator)).not.toEqual([]));
});
