import { describe, expect, it } from "vitest";
import {
  mapDisplayPriority,
  selectEdoDisplayCells,
  type EdoDisplayCandidate,
} from "../src/edo-marker-declutter";

const candidate = (id: string, name: string, x: number): EdoDisplayCandidate => ({
  id,
  sourceName: name,
  category: "施設",
  latitude: x,
  longitude: 0,
  sourceIndexes: [Number(id)],
});
const project = (latitude: number): { x: number; y: number } => ({ x: latitude, y: 0 });

describe("Edo candidate marker decluttering", () => {
  it("deprioritizes full-width bracketed labels", () => {
    expect(mapDisplayPriority(candidate("1", "（木戸）", 0)))
      .toBeLessThan(mapDisplayPriority(candidate("2", "神田門", 0)));
  });

  it("selects dense-area representatives deterministically", () => {
    const input = [candidate("3", "（木戸）", 2), candidate("2", "神田川", 1), candidate("1", "御門", 0)];
    const first = selectEdoDisplayCells(input, 13, project);
    const second = selectEdoDisplayCells([...input].reverse(), 13, project);
    expect(first).toEqual(second);
    expect(first[0]?.visible.map((item) => item.id)).toEqual(["2"]);
    expect(first[0]?.hiddenSourceCount).toBe(2);
  });

  it("shows more representatives at high declutter zoom with stable aggregation", () => {
    const input = Array.from({ length: 8 }, (_, index) => candidate(String(index), `地点${index}`, index));
    const low = selectEdoDisplayCells(input, 13, project)[0];
    const high = selectEdoDisplayCells(input, 16, project)[0];
    expect(low?.visible).toHaveLength(1);
    expect(high?.visible).toHaveLength(4);
    expect(low?.hiddenSourceCount).toBe(7);
    expect(selectEdoDisplayCells(input, 13, project)[0]?.hiddenSourceCount).toBe(7);
  });

  it("collapses dense z12 cells without representatives but leaves a singleton visible", () => {
    const dense = selectEdoDisplayCells([
      candidate("1", "神田門", 0),
      candidate("2", "（木戸）", 1),
    ], 12, project)[0];
    const sparse = selectEdoDisplayCells([candidate("3", "日本橋", 0)], 12, project)[0];
    expect(dense?.visible).toHaveLength(0);
    expect(dense?.hiddenSourceCount).toBe(2);
    expect(sparse?.visible.map((item) => item.id)).toEqual(["3"]);
    expect(sparse?.hiddenSourceCount).toBe(0);
  });

  it("keeps sparse cells individually accessible", () => {
    const cell = selectEdoDisplayCells([candidate("1", "地点", 0)], 12, project)[0];
    expect(cell?.visible).toHaveLength(1);
    expect(cell?.hidden).toHaveLength(0);
  });
});
