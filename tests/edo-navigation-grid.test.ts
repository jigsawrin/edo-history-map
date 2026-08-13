import { describe, expect, it } from "vitest";
import {
  buildEdoNavigationGrid,
  EDO_NAVIGATION_CELL_SIZE,
  navigationCellIntersectsPixelBounds,
} from "../src/edo-navigation-grid";

describe("Edo low-zoom navigation grid", () => {
  const identityProject = (_lat: number, lon: number) => ({ x: lon, y: 0 });

  it("uses deterministic 48px world-pixel cells with an exact boundary", () => {
    const points = [
      { id: "a", latitude: 0, longitude: 0 },
      { id: "b", latitude: 0, longitude: EDO_NAVIGATION_CELL_SIZE - 0.01 },
      { id: "c", latitude: 0, longitude: EDO_NAVIGATION_CELL_SIZE },
    ];
    const first = buildEdoNavigationGrid(points, identityProject, 48, 5, 5);
    const second = buildEdoNavigationGrid([...points].reverse(), identityProject, 48, 5, 5);
    expect(first.cellsByZoom.get(5)?.map((cell) => [cell.key, cell.memberIds])).toEqual([
      ["5/0/0", ["a", "b"]],
      ["5/1/0", ["c"]],
    ]);
    expect(second.cellsByZoom.get(5)).toEqual(first.cellsByZoom.get(5));
  });

  it("is independent of viewport/pan and tests occupied-cell intersection", () => {
    const grid = buildEdoNavigationGrid(
      [{ id: "a", latitude: 0, longitude: 49 }],
      identityProject,
      48,
      5,
      5,
    );
    const cell = grid.cellsByZoom.get(5)?.[0];
    expect(cell?.key).toBe("5/1/0");
    expect(navigationCellIntersectsPixelBounds(cell!, { min: { x: 96, y: 0 }, max: { x: 120, y: 20 } })).toBe(true);
    expect(navigationCellIntersectsPixelBounds(cell!, { min: { x: 97, y: 49 }, max: { x: 120, y: 70 } })).toBe(false);
  });

  it("counts presentation points and finds the first zoom that splits members", () => {
    const project = (_lat: number, lon: number, zoom: number) => ({ x: lon * 2 ** zoom, y: 0 });
    const grid = buildEdoNavigationGrid([
      { id: "aggregate:one", latitude: 0, longitude: 0 },
      { id: "source:two", latitude: 0, longitude: 0.2 },
    ], project, 48, 5, 14);
    const z5 = grid.cellsByZoom.get(5)?.[0];
    expect(z5?.memberCount).toBe(2);
    expect(grid.firstSplittingZoom(z5!)).toBe(8);
  });

  it("sends an unsplittable singleton to individual-marker zoom", () => {
    const grid = buildEdoNavigationGrid(
      [{ id: "only", latitude: 0, longitude: 0 }],
      identityProject,
    );
    expect(grid.firstSplittingZoom(grid.cellsByZoom.get(14)![0]!)).toBe(15);
  });
});
