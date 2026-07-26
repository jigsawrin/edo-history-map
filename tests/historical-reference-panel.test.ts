import { describe, expect, it } from "vitest";
import registry from "../src/historical-reference-panel-registry.json";
import { pointInGeometry, selectReferenceEntry, type ReferenceEntry } from "../src/historical-reference-panel";

const entry = registry.entries[0] as unknown as ReferenceEntry;
describe("historical reference panel model", () => {
  it("treats interior, every edge, and every vertex as inside", () => {
    const geometry = entry.trigger.geometry;
    expect(pointInGeometry([139.761, 35.6834], geometry)).toBe(true);
    expect(pointInGeometry([139.75, 35.68], geometry)).toBe(false);
    for (const point of geometry.type === "Polygon" ? geometry.coordinates[0]! : []) expect(pointInGeometry(point, geometry)).toBe(true);
    for (const point of [[139.761,35.6827],[139.7622,35.6834],[139.761,35.6842],[139.75995,35.6834]] as const) expect(pointInGeometry(point, geometry)).toBe(true);
    expect(pointInGeometry([35.6834, 139.761], geometry)).toBe(false);
  });
  it("uses enter/leave hysteresis and ignores the selected era", () => {
    const base = { regionId:"edo", center:[139.761,35.6834] as const };
    expect(selectReferenceEntry([entry], { ...base, zoom:16.99 })).toBeNull();
    expect(selectReferenceEntry([entry], { ...base, zoom:17 })?.id).toBe(entry.id);
    expect(selectReferenceEntry([entry], { ...base, zoom:16.5, visibleId:entry.id })?.id).toBe(entry.id);
    expect(selectReferenceEntry([entry], { ...base, zoom:16.49, visibleId:entry.id })).toBeNull();
    expect(selectReferenceEntry([entry], { ...base, regionId:"kyoto", zoom:17 })).toBeNull();
  });
  it("selects priority then id", () => {
    const low = { ...entry, id:"z-entry", priority:1 };
    const highB = { ...entry, id:"b-entry", priority:2 };
    const highA = { ...entry, id:"a-entry", priority:2 };
    expect(selectReferenceEntry([low,highB,highA], {regionId:"edo",center:[139.761,35.6834],zoom:17})?.id).toBe("a-entry");
  });
});
