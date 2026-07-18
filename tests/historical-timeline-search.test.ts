import { describe, expect, it } from "vitest";
import { historicalTimelineRegistry } from "../src/historical-timeline-registry";
import { searchHistoricalTimeline } from "../src/historical-timeline-search";

describe("歴史年表検索", () => {
  it.each([
    ["タイトル", "比叡山焼き討ち", "timeline-shiga-1571-hieizan"],
    ["別名", "池田屋騒動", "timeline-kyoto-1864-ikedaya"],
    ["日付", "元治元年6月5日", "timeline-kyoto-1864-ikedaya"],
    ["要約", "伏見奉行所の捕方", "timeline-kyoto-1866-teradaya-escape"],
    ["NFKC", "１５７１年", "timeline-shiga-1571-hieizan"],
    ["かな正規化", "ひえいざん", "timeline-shiga-1571-hieizan"],
  ])("%sを検索する", (_label, query, expected) => {
    expect(searchHistoricalTimeline(historicalTimelineRegistry, query).map((entry) => entry.id)).toContain(expected);
  });

  it("完全一致・前方一致・部分一致・日付・要約の順位を維持する", () => {
    const result = searchHistoricalTimeline(historicalTimelineRegistry, "寺田屋");
    expect(result.map((entry) => entry.id).slice(0, 2)).toEqual(["timeline-kyoto-1862-teradaya-incident", "timeline-kyoto-1866-teradaya-escape"]);
  });

  it("trackとtypeで絞り、空検索でもorder順を維持する", () => {
    const result = searchHistoricalTimeline(historicalTimelineRegistry, "", "kyoto-bakumatsu", "incident");
    expect(result).toHaveLength(5);
    expect(result.every((entry) => entry.track === "kyoto-bakumatsu" && entry.type === "incident")).toBe(true);
    expect(result.map((entry) => entry.order)).toEqual([...result.map((entry) => entry.order)].sort((a, b) => a - b));
  });

  it("入力を100文字に制限する既存正規化を使い正規表現を生成しない", () => {
    expect(() => searchHistoricalTimeline(historicalTimelineRegistry, `${"龍".repeat(100)}.*[<script>`)).not.toThrow();
    expect(searchHistoricalTimeline(historicalTimelineRegistry, ".*[<script>")).toHaveLength(0);
  });
});
