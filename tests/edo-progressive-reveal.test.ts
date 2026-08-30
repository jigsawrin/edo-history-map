import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  edoProgressiveRevealRule,
  mapDisplayPriority,
  minDisplayZoom,
  selectEdoProgressiveReveal,
  type EdoDisplayCandidate,
} from "../src/edo-progressive-reveal";

const candidate = (
  id: string,
  sourceName: string,
  category = "施設",
  x = 0,
): EdoDisplayCandidate => ({
  id,
  sourceName,
  category,
  latitude: x,
  longitude: 0,
  sourceIndexes: [Number(id.replace(/\D/g, "")) || 0],
});
const project = (latitude: number, longitude: number, zoom: number): { x: number; y: number } => ({
  x: latitude * 2 ** (zoom - 12),
  y: longitude * 2 ** (zoom - 12),
});

describe("Edo progressive marker reveal", () => {
  it("maps runtime priority to explicit minimum zoom bands", () => {
    const samples = [
      candidate("z12", "神田川", "海川池"),
      candidate("z13", "桜田御門", "施設"),
      candidate("z14", "増上寺", "寺社"),
      candidate("z15", "江戸町", "地名"),
      candidate("z16", "町屋敷", "屋敷地"),
      candidate("z17", "辻", "その他"),
    ];
    expect(samples.map((item) => minDisplayZoom(item))).toEqual([12, 13, 14, 15, 16, 17]);
    expect(samples.map(mapDisplayPriority)).toEqual([146, 136, 124, 114, 106, 88]);
  });

  it("treats every full-width bracketed label as maximum-detail-only", () => {
    const bracketed = candidate("1", "（神田川）", "海川池");
    expect(minDisplayZoom(bracketed, 18)).toBe(18);
    expect(selectEdoProgressiveReveal([bracketed], 17, project).visible).toHaveLength(0);
    expect(selectEdoProgressiveReveal([bracketed], 18, project).visible).toEqual([bracketed]);
  });

  it("uses the requested collision bands", () => {
    expect([12, 13, 14, 15, 16, 17, 18].map((zoom) => edoProgressiveRevealRule(zoom, 18)))
      .toEqual([
        { collisionDistance: 48 },
        { collisionDistance: 40 },
        { collisionDistance: 32 },
        { collisionDistance: 24 },
        { collisionDistance: 16 },
        { collisionDistance: null },
        { collisionDistance: null },
      ]);
  });

  it("keeps the highest-priority collision winner without generating a hidden-count candidate", () => {
    const input = [candidate("3", "江戸町", "地名", 2), candidate("2", "神田川", "海川池", 1)];
    const result = selectEdoProgressiveReveal(input, 12, project);
    expect(result.visible.map((item) => item.id)).toEqual(["2"]);
    expect(Object.keys(result)).toEqual(["eligible", "visible"]);
    expect(JSON.stringify(result)).not.toContain("hiddenSourceCount");
  });

  it("is deterministic for reversed input", () => {
    const input = [candidate("3", "神田川", "海川池", 2), candidate("2", "日本橋", "海川池", 1)];
    expect(selectEdoProgressiveReveal(input, 12, project))
      .toEqual(selectEdoProgressiveReveal([...input].reverse(), 12, project));
  });

  it("reveals lower-priority places without removing an earlier high-priority winner", () => {
    const high = candidate("1", "神田川", "海川池", 0);
    const medium = candidate("2", "増上寺", "寺社", 20);
    const low = candidate("3", "辻", "その他", 40);
    const z12 = selectEdoProgressiveReveal([low, medium, high], 12, project).visible;
    const z14 = selectEdoProgressiveReveal([low, medium, high], 14, project).visible;
    const z17 = selectEdoProgressiveReveal([low, medium, high], 17, project).visible;
    expect(z12.map((item) => item.id)).toEqual(["1"]);
    expect(z14.map((item) => item.id)).toEqual(["1", "2"]);
    expect(z17.map((item) => item.id)).toEqual(["1", "2", "3"]);
  });

  it("preserves z12 winners across the former z13 cell-boundary collision", () => {
    const first = candidate("1", "神田川", "海川池", 121);
    const second = candidate("2", "日本橋", "海川池", 179);
    expect(Math.floor(121 / 144)).not.toBe(Math.floor(179 / 144));
    expect(Math.floor((121 * 2) / 120)).toBe(Math.floor((179 * 2) / 120));
    expect(selectEdoProgressiveReveal([first, second], 12, project).visible.map((item) => item.id))
      .toEqual(["1", "2"]);
    expect(selectEdoProgressiveReveal([first, second], 13, project).visible.map((item) => item.id))
      .toEqual(["1", "2"]);
  });

  it("keeps every visible set as a subset of the next zoom for an adversarial population", () => {
    const bands = [
      ["神田川", "海川池"], ["桜田御門", "施設"], ["増上寺", "寺社"],
      ["江戸町", "地名"], ["町屋敷", "屋敷地"], ["辻", "その他"],
    ] as const;
    const population = Array.from({ length: 72 }, (_, index) => {
      const [name, category] = bands[index % bands.length]!;
      return candidate(`place-${index}`, name, category, (index * 29) % 317);
    });
    const visibleByZoom = [12, 13, 14, 15, 16, 17].map((zoom) =>
      new Set(selectEdoProgressiveReveal(population, zoom, project).visible.map((item) => item.id))
    );
    for (let index = 0; index < visibleByZoom.length - 1; index += 1) {
      const current = visibleByZoom[index]!;
      const next = visibleByZoom[index + 1]!;
      expect([...current].every((id) => next.has(id))).toBe(true);
      expect(next.size).toBeGreaterThanOrEqual(current.size);
    }
  });

  it("shows no candidates at overview zooms", () => {
    const important = candidate("1", "神田川", "海川池");
    for (let zoom = 5; zoom <= 11; zoom += 1) {
      expect(selectEdoProgressiveReveal([important], zoom, project).visible).toHaveLength(0);
    }
  });

  it("does not import private review data or generate spatial count UI", () => {
    const runtime = readFileSync(join(__dirname, "../src/edo-progressive-reveal.ts"), "utf8");
    const historical = readFileSync(join(__dirname, "../src/historical.ts"), "utf8");
    expect(runtime).not.toMatch(/description-priority-review|human-review|data-curation/u);
    expect(historical).not.toMatch(/この範囲に|非表示候補|hiddenSourceCount|`\+\$/u);
  });
});
