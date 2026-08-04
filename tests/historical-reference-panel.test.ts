import { describe, expect, it } from "vitest";
import registry from "../src/historical-reference-panel-registry.json";
import { calculateReferenceImageLayout, pointInGeometry, selectReferenceEntry, type ReferenceEntry } from "../src/historical-reference-panel";

const [entry,babasaki] = registry.entries as unknown as ReferenceEntry[];
describe("historical reference panel model", () => {
  it("fits rotated source dimensions without distortion and scales both axes uniformly", () => {
    const fitted=calculateReferenceImageLayout(2450,1800,90,900,600,1)!;
    expect(fitted.displayHeight).toBeCloseTo(600);
    expect(fitted.displayWidth/fitted.displayHeight).toBeCloseTo(1800/2450);
    expect(fitted.sourceWidth/fitted.sourceHeight).toBeCloseTo(2450/1800);
    const doubled=calculateReferenceImageLayout(2450,1800,90,900,600,2)!;
    expect(doubled.sourceWidth).toBeCloseTo(fitted.sourceWidth*2);
    expect(doubled.sourceHeight).toBeCloseTo(fitted.sourceHeight*2);
    expect(doubled.displayWidth).toBeCloseTo(fitted.displayWidth*2);
    expect(doubled.displayHeight).toBeCloseTo(fitted.displayHeight*2);
    const oneAndAHalf=calculateReferenceImageLayout(2450,1800,90,900,600,1.5)!;
    expect(oneAndAHalf.sourceWidth).toBeCloseTo(fitted.sourceWidth*1.5);
    expect(oneAndAHalf.sourceHeight).toBeCloseTo(fitted.sourceHeight*1.5);
    expect(oneAndAHalf.displayHeight).toBeGreaterThan(600);
  });
  it.each([90,270] as const)("swaps display axes for %i degrees", (rotation) => {
    const layout=calculateReferenceImageLayout(2450,1800,rotation,1800,2450,1)!;
    expect(layout.displayWidth).toBe(1800);
    expect(layout.displayHeight).toBe(2450);
    expect(layout.sourceWidth).toBe(2450);
    expect(layout.sourceHeight).toBe(1800);
  });
  it.each([0,180] as const)("preserves display axes for %i degrees", (rotation) => {
    const layout=calculateReferenceImageLayout(2450,1800,rotation,2450,1800,1)!;
    expect(layout.displayWidth).toBe(2450);
    expect(layout.displayHeight).toBe(1800);
  });
  it("preserves aspect ratio after independent viewport width and height changes", () => {
    for(const [width,height] of [[500,600],[900,320],[390,354]] as const){
      const layout=calculateReferenceImageLayout(2450,1800,90,width,height,1)!;
      expect(layout.sourceWidth/layout.sourceHeight).toBeCloseTo(2450/1800);
      expect(layout.displayWidth/layout.displayHeight).toBeCloseTo(1800/2450);
      expect(layout.displayWidth).toBeLessThanOrEqual(width+Number.EPSILON*width);
      expect(layout.displayHeight).toBeLessThanOrEqual(height+Number.EPSILON*height);
    }
  });
  it("preserves unrotated dimensions and rejects unusable viewports", () => {
    expect(calculateReferenceImageLayout(1200,800,0,600,600,1)).toEqual({
      sourceWidth:600,
      sourceHeight:400,
      displayWidth:600,
      displayHeight:400,
    });
    expect(calculateReferenceImageLayout(1200,800,0,0,600,1)).toBeNull();
  });
  it("treats interior, every edge, and every vertex as inside", () => {
    const geometry = entry!.trigger.geometry;
    expect(pointInGeometry([139.761, 35.6834], geometry)).toBe(true);
    expect(pointInGeometry([139.75, 35.68], geometry)).toBe(false);
    for (const point of geometry.type === "Polygon" ? geometry.coordinates[0]! : []) expect(pointInGeometry(point, geometry)).toBe(true);
    for (const point of [[139.761,35.6827],[139.7622,35.6834],[139.761,35.6842],[139.75995,35.6834]] as const) expect(pointInGeometry(point, geometry)).toBe(true);
    expect(pointInGeometry([35.6834, 139.761], geometry)).toBe(false);
  });
  it("uses enter/leave hysteresis and ignores the selected era", () => {
    const base = { regionId:"edo", center:[139.761,35.6834] as const };
    expect(selectReferenceEntry([entry!], { ...base, zoom:16.99 })).toBeNull();
    expect(selectReferenceEntry([entry!], { ...base, zoom:17 })?.id).toBe(entry!.id);
    expect(selectReferenceEntry([entry!], { ...base, zoom:16.5, visibleId:entry!.id })?.id).toBe(entry!.id);
    expect(selectReferenceEntry([entry!], { ...base, zoom:16.49, visibleId:entry!.id })).toBeNull();
    expect(selectReferenceEntry([entry!], { ...base, regionId:"kyoto", zoom:17 })).toBeNull();
  });
  it("selects each real trigger and returns null outside both",()=>{
    expect(selectReferenceEntry([entry!,babasaki!],{regionId:"edo",center:[139.761,35.6834],zoom:17})?.id).toBe(entry!.id);
    expect(selectReferenceEntry([entry!,babasaki!],{regionId:"edo",center:[139.760527,35.678426],zoom:17})?.id).toBe(babasaki!.id);
    expect(selectReferenceEntry([entry!,babasaki!],{regionId:"edo",center:[139.765,35.685],zoom:17})).toBeNull();
  });
  it("selects priority then id", () => {
    const overlappingBabasaki={...babasaki!,trigger:entry!.trigger};
    expect(selectReferenceEntry([entry!,overlappingBabasaki],{regionId:"edo",center:[139.761,35.6834],zoom:17})?.priority).toBe(71);
    const low = { ...entry!, id:"z-entry", priority:1 };
    const highB = { ...entry!, id:"b-entry", priority:2 };
    const highA = { ...entry!, id:"a-entry", priority:2 };
    expect(selectReferenceEntry([low,highB,highA], {regionId:"edo",center:[139.761,35.6834],zoom:17})?.id).toBe("a-entry");
  });
});
