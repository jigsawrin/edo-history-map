import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("大量地点の描画設定", () => {
  it("LeafletをCanvas優先にし、歴史地点を専用paneへ分離する", () => {
    const source = readFileSync(join(__dirname, "..", "src", "main.ts"), "utf8");
    expect(source).toMatch(/preferCanvas:\s*true/);
    expect(source).toContain("map.createPane(HISTORICAL_PANE)");
  });
});
