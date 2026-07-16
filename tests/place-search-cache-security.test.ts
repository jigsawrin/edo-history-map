import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DatasetRegistry, type DatasetDefinition } from "../src/datasets";
import { PlaceSearchModelCache } from "../src/place-search/model-cache";
import type { PlaceFeature } from "../src/validate";

function source(): PlaceFeature[] {
  return [
    {
      name: "地点",
      category: "施設",
      sheet: "切絵図",
      entryId: "1",
      sourceUrl: null,
      lat: 35,
      lon: 139,
    },
  ];
}

function registry(loader: () => Promise<PlaceFeature[]>): DatasetRegistry {
  const definition: DatasetDefinition<"codh-edo-maps-places"> = {
    id: "codh-edo-maps-places",
    kind: "places",
    path: "data/edo-places.geojson",
    publicSha256: "a".repeat(64),
    sourceId: "codh-edo-maps-places",
    load: loader,
  };
  return new DatasetRegistry([definition]);
}

describe("地点検索モデルキャッシュ", () => {
  it("同一データセットを一度だけ読み込み同じモデルを再利用する", async () => {
    const loader = vi.fn().mockResolvedValue(source());
    const cache = new PlaceSearchModelCache(registry(loader));
    const first = cache.load("codh-edo-maps-places");
    const second = cache.load("codh-edo-maps-places");
    expect(first).toBe(second);
    expect(await first).toBe(await second);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("失敗したPromiseを削除し再試行可能にする", async () => {
    const loader = vi
      .fn<() => Promise<PlaceFeature[]>>()
      .mockRejectedValueOnce(new Error("失敗"))
      .mockResolvedValueOnce(source());
    const cache = new PlaceSearchModelCache(registry(loader));
    await expect(cache.load("codh-edo-maps-places")).rejects.toThrow("失敗");
    await expect(cache.load("codh-edo-maps-places")).resolves.toHaveLength(1);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe("地点検索ソースのセキュリティ境界", () => {
  const root = join(__dirname, "..", "src", "place-search");
  const files = [
    "types.ts",
    "normalize.ts",
    "adapters.ts",
    "query.ts",
    "model-cache.ts",
    "controller.ts",
  ];
  const sourceText = files.map((file) => readFileSync(join(root, file), "utf8")).join("\n");

  it("HTML挿入・実行系APIを使わない", () => {
    expect(sourceText).not.toContain("inner" + "HTML");
    expect(sourceText).not.toContain("insertAdjacent" + "HTML");
    expect(sourceText).not.toContain("ev" + "al(");
    expect(sourceText).not.toContain("new " + "Function");
  });

  it("検索語由来の通信・URL・RegExp生成を持たない", () => {
    expect(sourceText).not.toContain("fetch" + "(");
    expect(sourceText).not.toContain("new " + "RegExp");
    expect(sourceText).not.toContain("new " + "URL");
  });

  it("検索状態をブラウザ保存領域へ保存しない", () => {
    for (const name of [
      "local" + "Storage",
      "session" + "Storage",
      "indexed" + "DB",
      "document." + "cookie",
    ]) {
      expect(sourceText).not.toContain(name);
    }
  });

  it("検索語をコンソールへ記録しない", () => {
    expect(sourceText).not.toContain("console." + "log");
    expect(sourceText).not.toContain("console." + "error");
  });
});
