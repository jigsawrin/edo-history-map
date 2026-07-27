/* eslint-disable @typescript-eslint/no-explicit-any */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditHistoricalReferencePanelRegistry } from "../scripts/historical-reference-panel-registry.mjs";

describe("historical reference panel registry audit", () => {
  const roots:string[]=[];
  afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
  function fixture(mutator:(data:{registry:any;assets:any;displays:any;candidates:any;root:string})=>void){
    const source=join(__dirname,"..");
    const root=mkdtempSync(join(tmpdir(),"reference-panel-"));
    roots.push(root);
    for(const path of ["src/historical-reference-panel-registry.json","data-curation/historical-reference-assets.json","data-curation/historical-map-display-catalog.json","data-curation/historical-raster-candidates.json","public/data/historical-reference-assets"]){
      mkdirSync(dirname(join(root,path)),{recursive:true});
      cpSync(join(source,path),join(root,path),{recursive:true});
    }
    const data={registry:JSON.parse(readFileSync(join(root,"src/historical-reference-panel-registry.json"),"utf8")),assets:JSON.parse(readFileSync(join(root,"data-curation/historical-reference-assets.json"),"utf8")),displays:JSON.parse(readFileSync(join(root,"data-curation/historical-map-display-catalog.json"),"utf8")),candidates:JSON.parse(readFileSync(join(root,"data-curation/historical-raster-candidates.json"),"utf8")),root};
    mutator(data);
    for(const [path,value] of [["src/historical-reference-panel-registry.json",data.registry],["data-curation/historical-reference-assets.json",data.assets],["data-curation/historical-map-display-catalog.json",data.displays],["data-curation/historical-raster-candidates.json",data.candidates]] as const)writeFileSync(join(root,path),JSON.stringify(value));
    return auditHistoricalReferencePanelRegistry(root).errors;
  }
  const wadakuraCandidate = (data:any) =>
    data.candidates.candidates.find((candidate:any) => candidate.candidateId === "tokyo-archive-4300033114-wadakura-gate");
  it("accepts schema 3 with the two published entries and unique public bindings", () => {
    const result:any = auditHistoricalReferencePanelRegistry(join(__dirname, ".."));
    expect(result.errors).toEqual([]);
    expect(result.registry?.schemaVersion).toBe(3);
    expect(result.registry?.entries).toHaveLength(2);
    const entries:any[]=result.registry!.entries;
    expect(entries.map((entry:any)=>entry.id)).toEqual([
      "tokyo-archive-4300033114-wadakura-gate-reference-display",
      "tokyo-archive-4300033114-babasaki-gate-reference-display",
    ]);
    expect(entries.map((entry:any)=>entry.promptLabelJa)).toEqual([
      "1717年の和田倉御門図を見る",
      "1717年の馬場先御門図を見る",
    ]);
    expect(new Set(entries.map((entry:any)=>entry.id)).size).toBe(2);
    expect(new Set(entries.map((entry:any)=>entry.assetId)).size).toBe(2);
    expect(new Set(entries.map((entry:any)=>entry.image.publicPath)).size).toBe(2);
    expect(entries.map((entry:any)=>entry.displayRotationDegrees)).toEqual([90,90]);
    expect(entries[1].image).toEqual({
      publicPath:"/data/historical-reference-assets/tokyo-archive-4300033114-babasaki-gate-reference-image/babasaki-gate-reference.png",
      mimeType:"image/png",
      width:2450,
      height:1800,
      bytes:861237,
      sha256:"5b2f4e6fa4c33022aa0ba3265b821e43226b1804d0456f12f382ed2d5d6fd36c",
    });
    const source=join(__dirname,"..");
    const assets=JSON.parse(readFileSync(join(source,"data-curation/historical-reference-assets.json"),"utf8"));
    const displays=JSON.parse(readFileSync(join(source,"data-curation/historical-map-display-catalog.json"),"utf8"));
    expect(displays.maps.filter((display:any)=>display.publicationStatus==="published"&&display.displayMode==="reference-panel").map((display:any)=>display.id).sort()).toEqual(entries.map((entry:any)=>entry.id).sort());
    expect(assets.assets.filter((asset:any)=>asset.publicationStatus==="published").map((asset:any)=>asset.id).sort()).toEqual(entries.map((entry:any)=>entry.assetId).sort());
  });
  it("accepts a valid MultiPolygon when the display catalog matches", () => {
    expect(fixture((d) => {
      const coordinates = [d.registry.entries[0].trigger.geometry.coordinates];
      d.registry.entries[0].trigger.geometry = { type:"MultiPolygon", coordinates };
      d.displays.maps[0].spatialBinding.geometry = { type:"MultiPolygon", coordinates };
    })).toEqual([]);
  });
  it.each([
    ["unpublished asset",(d:any)=>d.assets.assets[0].publicationStatus="shortlisted"],
    ["unpublished display",(d:any)=>d.displays.maps[0].publicationStatus="shortlisted"],
    ["technical in-review",(d:any)=>d.displays.maps[0].technicalReviewStatus="in-review"],
    ["sourceId mismatch",(d:any)=>d.registry.entries[0].sourceId="missing-source"],
    ["assetId mismatch",(d:any)=>d.registry.entries[0].assetId="missing-asset"],
    ["entry regionId mismatch",(d:any)=>d.registry.entries[0].regionId="kyoto"],
    ["display regionId mismatch",(d:any)=>d.displays.maps[0].regionId="kyoto"],
    ["candidate regionId mismatch",(d:any)=>wadakuraCandidate(d).regionId="kyoto"],
    ["sourceEraId mismatch",(d:any)=>d.registry.entries[0].sourceEraId="edo-late"],
    ["descriptionJa mismatch",(d:any)=>d.registry.entries[0].descriptionJa="不一致"],
    ["licenseCode mismatch",(d:any)=>d.registry.entries[0].licenseCode="CC0-1.0"],
    ["publicPath mismatch",(d:any)=>d.registry.entries[0].image.publicPath="/data/historical-reference-assets/x/x.png"],
    ["SHA mismatch",(d:any)=>d.registry.entries[0].image.sha256="a".repeat(64)],
    ["bytes mismatch",(d:any)=>d.registry.entries[0].image.bytes=1],
    ["dimensions mismatch",(d:any)=>d.registry.entries[0].image.width=1],
    ["MIME mismatch",(d:any)=>d.registry.entries[0].image.mimeType="image/jpeg"],
    ["invalid display rotation",(d:any)=>d.registry.entries[0].displayRotationDegrees=45],
    ["geometry mismatch",(d:any)=>d.registry.entries[0].trigger.geometry.coordinates[0][0][0]=0],
    ["geometry extra key",(d:any)=>d.registry.entries[0].trigger.geometry.note="不正"],
    ["invalid MultiPolygon",(d:any)=>{const geometry={type:"MultiPolygon",coordinates:[[]]};d.registry.entries[0].trigger.geometry=geometry;d.displays.maps[0].spatialBinding.geometry=geometry;}],
    ["out-of-range longitude",(d:any)=>{d.registry.entries[0].trigger.geometry.coordinates[0][0][0]=181;d.displays.maps[0].spatialBinding.geometry.coordinates[0][0][0]=181;}],
    ["out-of-range latitude",(d:any)=>{d.registry.entries[0].trigger.geometry.coordinates[0][0][1]=91;d.displays.maps[0].spatialBinding.geometry.coordinates[0][0][1]=91;}],
    ["zoom mismatch",(d:any)=>d.registry.entries[0].trigger.zoom.enterDetailAt=18],
    ["sourceUrl mismatch",(d:any)=>d.registry.entries[0].sourceUrl="https://example.com/item"],
    ["licenseUrl mismatch",(d:any)=>d.registry.entries[0].licenseUrl="https://example.com/license"],
    ["HTTP sourceUrl",(d:any)=>{d.registry.entries[0].sourceUrl="http://localhost/item";wadakuraCandidate(d).exactItemUrl="http://localhost/item";}],
    ["authenticated sourceUrl",(d:any)=>{d.registry.entries[0].sourceUrl="https://u:p@[::1]/item";wadakuraCandidate(d).exactItemUrl="https://u:p@[::1]/item";}],
    ["control character sourceUrl",(d:any)=>{d.registry.entries[0].sourceUrl="https://example.com/\nitem";wadakuraCandidate(d).exactItemUrl="https://example.com/\nitem";}],
    ["attribution mismatch",(d:any)=>d.registry.entries[0].attributionJa="不一致"],
    ["disclosure mismatch",(d:any)=>d.registry.entries[0].derivativeDisclosureJa="不一致"],
    ["private path",(d:any)=>d.registry.entries[0].rawPath="data-raw/x"],
    ["HTML",(d:any)=>d.registry.entries[0].titleJa="<b>bad</b>"],
    ["control character",(d:any)=>d.registry.entries[0].titleJa="bad\u0000"],
    ["C1 prompt control character",(d:any)=>d.registry.entries[0].promptLabelJa="bad\u0085text"],
    ["prompt HTML angle bracket",(d:any)=>d.registry.entries[0].promptLabelJa="bad<text"],
    ["prompt surrounding whitespace",(d:any)=>d.registry.entries[0].promptLabelJa=" bad"],
    ["overlong prompt",(d:any)=>d.registry.entries[0].promptLabelJa="長".repeat(101)],
    ["duplicate assetId",(d:any)=>d.registry.entries[1].assetId=d.registry.entries[0].assetId],
    ["duplicate publicPath",(d:any)=>d.registry.entries[1].image.publicPath=d.registry.entries[0].image.publicPath],
    ["orphan public PNG",(d:any)=>writeFileSync(join(d.root,"public/data/historical-reference-assets/orphan.png"),Buffer.from("orphan"))],
    ["orphan runtime",(d:any)=>d.registry.entries[0].id="orphan-entry"],
    ["published display missing",(d:any)=>d.registry.entries=[]],
  ])("rejects %s",(_label,mutator)=>expect(fixture(mutator)).not.toEqual([]));
});
