import { describe, expect, it, vi } from "vitest";
import {
  DATASET_DEFINITIONS,
  DatasetRegistry,
  type DatasetDefinition,
} from "../src/datasets";

describe("承認済みデータセットレジストリ", () => {
  it("既存3 IDを固定ローカルパスへだけ解決する", () => {
    expect(DATASET_DEFINITIONS.map(({ id, kind, path }) => ({ id, kind, path }))).toEqual([
      { id: "codh-edo-maps-places", kind: "places", path: "data/edo-places.geojson" },
      { id: "codh-edo-machiya-areas", kind: "polygon", path: "data/edo-machiya-areas.geojson" },
      { id: "codh-edo-coastline", kind: "line", path: "data/edo-coastlines.geojson" },
    ]);
  });

  it("公開SHAを固定し地域IDからパスを生成しない", () => {
    for (const definition of DATASET_DEFINITIONS) {
      expect(definition.publicSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(definition.path).not.toContain("{region}");
      expect(definition.sourceId).toBe(definition.id);
    }
  });

  it.each([
    "https://evil.example/data.geojson",
    "../data.geojson",
    "/data/file.geojson",
    "C:/data/file.geojson",
  ])("危険なパス %s を拒否する", (path) => {
    const source = {
      ...DATASET_DEFINITIONS[0],
      path,
    } as DatasetDefinition;
    expect(() => new DatasetRegistry([source])).toThrow("不正");
  });

  it("同一データの同時・再読み込みを1回にまとめる", async () => {
    const load = vi.fn().mockResolvedValue([]);
    const registry = new DatasetRegistry([
      { ...DATASET_DEFINITIONS[0], load } as DatasetDefinition,
    ]);
    const first = registry.load("codh-edo-maps-places");
    const second = registry.load("codh-edo-maps-places");
    expect(first).toBe(second);
    await Promise.all([first, second]);
    await registry.load("codh-edo-maps-places");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("失敗は永久キャッシュせず再試行できる", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce([]);
    const registry = new DatasetRegistry([
      { ...DATASET_DEFINITIONS[0], load } as DatasetDefinition,
    ]);
    await expect(registry.load("codh-edo-maps-places")).rejects.toThrow();
    await expect(registry.load("codh-edo-maps-places")).resolves.toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("未登録IDを読み込まない", async () => {
    const registry = new DatasetRegistry();
    await expect(
      registry.load("missing" as "codh-edo-maps-places"),
    ).rejects.toThrow("未承認");
  });

  it("manifestへ未承認IDを注入しても登録を拒否する", () => {
    const source = {
      ...DATASET_DEFINITIONS[0],
      id: "pending-dataset",
      sourceId: "pending-dataset",
    } as unknown as DatasetDefinition;
    expect(() => new DatasetRegistry([source])).toThrow("不正");
  });
});
