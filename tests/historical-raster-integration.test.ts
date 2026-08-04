import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { auditHistoricalRasterRepository, validateHistoricalRasterSourceCandidates } from "../scripts/audit-historical-rasters.mjs";
import { HISTORICAL_VIEW_MODES, VISUAL_LAYER_ENABLED, VISUAL_LAYER_IDS } from "../src/eras";
import { createMapPanes, MAP_PANES } from "../src/leaflet-layers";

const ROOT = join(__dirname, "..");

describe("古地図ラスタ基盤の本番統合", () => {
  it("historical-mapとvisual layerを定義し、レジストリが空ならUIをhiddenに保つ", () => {
    expect(HISTORICAL_VIEW_MODES).toContain("historical-map");
    expect(VISUAL_LAYER_IDS.historicalRaster).toBe("historical-raster");
    expect(VISUAL_LAYER_ENABLED[VISUAL_LAYER_IDS.historicalRaster]).toBe(true);
    const html = readFileSync(join(ROOT, "index.html"), "utf8");
    expect(html).toMatch(/id="historical-raster-controls"[^>]*hidden/u);
    expect(html).toContain('id="historical-raster-select"');
    expect(html).toContain('id="historical-raster-opacity"');
    expect(html).not.toContain('<option value="historical-map"');
    expect(JSON.parse(readFileSync(join(ROOT, "src", "historical-raster-registry.json"), "utf8"))).toEqual([]);
  });

  it("paneをpointer-events noneにして地点クリック・pan・zoomを遮らない", () => {
    const elements = new Map<string, HTMLElement>();
    const map = { createPane: (name: string) => { const pane = document.createElement("div"); elements.set(name, pane); return pane; } };
    createMapPanes(map as never);
    expect(elements.get(MAP_PANES.historicalRaster)?.style.pointerEvents).toBe("none");
    expect(elements.get(MAP_PANES.historicalPoints)?.style.pointerEvents).toBe("auto");
  });

  it("地域token・古地図世代・mode・sheetを照合し古い非同期完了を拒否する", () => {
    const source = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
    expect(source).toContain("rasterRequestGeneration");
    expect(source).toContain("loadCoordinator.isCurrent(token)");
    expect(source).toContain("rasterRequestId !== definition.id");
    expect(source).toContain('latestView !== "historical-map"');
    expect(source).toContain("latestEra?.historicalRasterIds?.includes(definition.id)");
    expect(source).toContain('historicalRasterSelect.addEventListener("change"');
    expect(source).toContain('historyViewSelect.addEventListener("change"');
  });

  it("同じmapと既存LayerTransitionControllerを使い、mapを再作成しない", () => {
    const source = readFileSync(join(ROOT, "src", "main.ts"), "utf8");
    expect(source.match(/L\.map\(/gu)).toHaveLength(1);
    expect(source).toContain("new HistoricalRasterTransitionLayer(map, historical)");
    expect(source).toContain("transitions.switchTo(targets, duration)");
    expect(source).toContain("eraTransitionDuration(prefersReducedMotion(), ERA_TRANSITION_MS)");
  });

  it("URL query/hashからraster IDを受け取らずCSPへ外部画像originを追加しない", () => {
    const params = readFileSync(join(ROOT, "src", "urlparams.ts"), "utf8");
    expect(params).not.toMatch(/raster|sheet/iu);
    const csp = readFileSync(join(ROOT, "vite.config.ts"), "utf8");
    expect(csp).toContain("img-src 'self' data: https://cyberjapandata.gsi.go.jp");
    expect(csp).not.toMatch(/ndl|codh|warper|iiif|blob:|img-src[^;]*\shttps:\s|img-src[^;]*\*/iu);
  });

  it("公開前ラスタ監査が画像0件のB経路で成功する", () => {
    const audit = auditHistoricalRasterRepository(ROOT);
    expect(audit.errors).toEqual([]);
    expect(audit.definitions).toHaveLength(0);
  });

  it("historical rasterはoverlay用途sourceだけを受理する", () => {
    const definitions = [{ id: "test-raster", sourceId: "test-source" }];
    expect(validateHistoricalRasterSourceCandidates(definitions, [{ candidateId: "test-source", intendedUses: ["georeferenced-overlay"] }])).toEqual([]);
    expect(validateHistoricalRasterSourceCandidates(definitions, [{ candidateId: "test-source", intendedUses: ["reference-panel"] }])[0]).toMatch(/georeferenced-overlay/u);
  });

  it("test fixture、原本、未承認画像をpublic/distへ含めない", () => {
    expect(existsSync(join(ROOT, "tests", "fixtures", "historical-rasters", "project-grid", "tiles", "1", "0", "0.png"))).toBe(true);
    expect(existsSync(join(ROOT, "public", "data", "historical-rasters"))).toBe(false);
    const dist = join(ROOT, "dist");
    const names = existsSync(dist) ? readdirSync(dist, { recursive: true }).map(String).join("\n") : "";
    expect(names).not.toMatch(/project-grid|control-points\.json|georeference\.json|data-raw|data-derived/iu);
  });
});
