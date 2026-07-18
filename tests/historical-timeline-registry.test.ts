import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  historicalTimelineById,
  historicalTimelineRegistry,
  parseHistoricalTimeline,
  timelineEntriesForPlace,
  timelineEntriesForTheme,
} from "../src/historical-timeline-registry";

function clone(): Record<string, unknown>[] {
  return structuredClone(historicalTimelineRegistry) as unknown as Record<string, unknown>[];
}

describe("歴史年表レジストリ", () => {
  it("35項目を滋賀17・京都18の監査順で保持する", () => {
    expect(historicalTimelineRegistry).toHaveLength(35);
    expect(historicalTimelineRegistry.filter((entry) => entry.track === "shiga-sengoku")).toHaveLength(17);
    expect(historicalTimelineRegistry.filter((entry) => entry.track === "kyoto-bakumatsu")).toHaveLength(18);
    expect(historicalTimelineRegistry.map((entry) => entry.order)).toEqual([...historicalTimelineRegistry.map((entry) => entry.order)].sort((a, b) => a - b));
    expect(historicalTimelineRegistry.map((entry) => entry.date.startYear)).toEqual([...historicalTimelineRegistry.map((entry) => entry.date.startYear)].sort((a, b) => a - b));
  });

  it("42地点関係・62テーマ関係・21テーマを参照しEDOを参照しない", () => {
    expect(historicalTimelineRegistry.flatMap((entry) => entry.relatedPlaces)).toHaveLength(42);
    expect(historicalTimelineRegistry.flatMap((entry) => entry.relatedThemeIds)).toHaveLength(62);
    expect(new Set(historicalTimelineRegistry.flatMap((entry) => entry.relatedThemeIds))).toHaveLength(21);
    expect(historicalTimelineRegistry.flatMap((entry) => entry.relatedPlaces).every((reference) => reference.datasetId !== ("codh-edo-maps-places" as string))).toBe(true);
  });

  it("type・precision・calendarBasis内訳を固定する", () => {
    const count = (field: "type" | "precision" | "calendarBasis") => Object.fromEntries(
      historicalTimelineRegistry.map((entry) => field === "type" ? entry.type : entry.date[field]).filter((value, index, values) => values.indexOf(value) === index).map((value) => [value, historicalTimelineRegistry.filter((entry) => (field === "type" ? entry.type : entry.date[field]) === value).length]),
    );
    expect(count("type")).toEqual({ battle: 9, religion: 5, movement: 7, construction: 3, transition: 1, politics: 3, incident: 5, death: 2 });
    expect(count("precision")).toEqual({ circa: 5, range: 7, year: 15, day: 8 });
    expect(count("calendarBasis")).toEqual({ mixed: 25, "japanese-lunisolar": 10 });
  });

  it("ID検索と地点・テーマの明示参照から逆引きする", () => {
    expect(historicalTimelineById("timeline-shiga-1571-hieizan")?.titleJa).toBe("比叡山焼き討ち");
    expect(timelineEntriesForPlace("project-kyoto-bakumatsu-places", "hu040").map((entry) => entry.id)).toEqual(["timeline-kyoto-1862-teradaya-incident", "timeline-kyoto-1866-teradaya-escape"]);
    expect(timelineEntriesForTheme("event-toba-fushimi-battle")).toHaveLength(3);
  });

  it.each([
    ["24件未満", (data: Record<string, unknown>[]) => data.splice(0, 12)],
    ["ID重複", (data: Record<string, unknown>[]) => { data[1]!.id = data[0]!.id; }],
    ["order重複", (data: Record<string, unknown>[]) => { data[1]!.order = data[0]!.order; }],
    ["order逆行", (data: Record<string, unknown>[]) => { data[1]!.order = 0; }],
    ["年逆行", (data: Record<string, unknown>[]) => { (data[20]!.date as Record<string, unknown>).startYear = 1500; }],
    ["不正track", (data: Record<string, unknown>[]) => { data[0]!.track = "edo"; }],
    ["不正type", (data: Record<string, unknown>[]) => { data[0]!.type = "war"; }],
    ["月0", (data: Record<string, unknown>[]) => { (data[23]!.date as Record<string, unknown>).startMonth = 0; }],
    ["日32", (data: Record<string, unknown>[]) => { (data[23]!.date as Record<string, unknown>).startDay = 32; }],
    ["期間逆転", (data: Record<string, unknown>[]) => { (data[1]!.date as Record<string, unknown>).endYear = 1500; }],
    ["precision不整合", (data: Record<string, unknown>[]) => { (data[23]!.date as Record<string, unknown>).precision = "year"; }],
    ["地点なし", (data: Record<string, unknown>[]) => { data[0]!.relatedPlaces = []; }],
    ["テーマなし", (data: Record<string, unknown>[]) => { data[0]!.relatedThemeIds = []; }],
    ["存在しない地点", (data: Record<string, unknown>[]) => { ((data[0]!.relatedPlaces as Record<string, unknown>[])[0]!).placeId = "missing"; }],
    ["地点出典不一致", (data: Record<string, unknown>[]) => { ((data[0]!.relatedPlaces as Record<string, unknown>[])[0]!).sourceIds = ["kyoto-pref-shugoshoku"]; }],
    ["track混在", (data: Record<string, unknown>[]) => { ((data[0]!.relatedPlaces as Record<string, unknown>[])[0]!).datasetId = "project-kyoto-bakumatsu-places"; }],
    ["HTML", (data: Record<string, unknown>[]) => { data[0]!.summaryJa = "<script>alert(1)</script>"; }],
    ["Markdownリンク", (data: Record<string, unknown>[]) => { data[0]!.summaryJa = "[外部](https://example.com/)"; }],
    ["制御文字", (data: Record<string, unknown>[]) => { data[0]!.titleJa = "出来事\u0000"; }],
    ["任意URLキー", (data: Record<string, unknown>[]) => { data[0]!.url = "https://example.com/"; }],
  ])("%sを拒否する", (_label, mutate) => {
    const data = clone();
    mutate(data);
    expect(() => parseHistoricalTimeline(data)).toThrow();
  });

  it("危険キーを拒否しDateによる日付生成を実装しない", () => {
    const data = clone();
    Object.defineProperty(data[0], "constructor", { value: "unsafe", enumerable: true, configurable: true });
    expect(() => parseHistoricalTimeline(data)).toThrow();
    const source = readFileSync(join(__dirname, "../src/historical-timeline-registry.ts"), "utf8");
    expect(source).not.toMatch(/new\s+Date|Date\.parse/u);
  });

  it("同一入力の決定的JSONとSHAを再現する", () => {
    const first = JSON.stringify(parseHistoricalTimeline(clone()));
    const second = JSON.stringify(parseHistoricalTimeline(clone()));
    expect(second).toBe(first);
    expect(createHash("sha256").update(first).digest("hex")).toBe(createHash("sha256").update(second).digest("hex"));
  });
});
