import { readFileSync } from "node:fs";
import { join } from "node:path";
import L from "leaflet";
import { describe, expect, it, vi } from "vitest";
import type { KyotoBakumatsuPlace } from "../src/kyoto-bakumatsu-places";
import { KYOTO_SOURCE_DEFINITIONS } from "../src/kyoto-source-registry";
import {
  createKyotoBakumatsuLayer,
  kyotoMarkerStyle,
} from "../src/kyoto-layer";
import { MAP_PANES, PANE_Z_INDEX } from "../src/leaflet-layers";

function firstRegisteredSourceId(): string {
  const source = KYOTO_SOURCE_DEFINITIONS[0];
  if (!source) throw new Error("京都出典レジストリが空です");
  return source.id;
}

const FIRST_REGISTERED_SOURCE_ID = firstRegisteredSourceId();

function place(
  overrides: Partial<KyotoBakumatsuPlace> = {},
): KyotoBakumatsuPlace {
  return {
    id: "kyoto-fixture-01",
    nameJa: "京都テスト地点",
    category: "incident",
    longitude: 135.75,
    latitude: 35.01,
    eraId: "bakumatsu",
    dateDisplayJa: "元治元年（1864年）",
    startYear: 1864,
    endYear: 1864,
    summaryJa: "京都の幕末史に関係する地点について、公的資料を照合し、現在位置と歴史上の位置の違いに注意して、本プロジェクトが中立的な説明として独自に作成したテスト用の文章です。追加の説明を含めて必要な文字数を満たします。",
    locationBasis: "official-historic-marker",
    historicalSiteStatus: "marker-only",
    coordinateConfidence: "high",
    locationNoteJa:
      "公的資料に記録された史跡表示の現在位置を示すテスト用の説明です。",
    sourceIds: [FIRST_REGISTERED_SOURCE_ID],
    sourceId: "project-kyoto-bakumatsu-places",
    ...overrides,
  };
}

describe("京都・幕末地点レイヤー", () => {
  it("Canvas優先地図のhistorical-points-paneへ非bubbling markerを配置する", () => {
    const mainSource = readFileSync(
      join(__dirname, "..", "src", "main.ts"),
      "utf8",
    );
    const layer = createKyotoBakumatsuLayer(
      [place()],
      () => {},
      document.createElement("div"),
    );
    const marker = layer.layer.getLayers()[0] as L.CircleMarker;

    expect(mainSource).toMatch(/preferCanvas:\s*true/);
    expect(marker.options.pane).toBe(MAP_PANES.historicalPoints);
    expect(marker.options.interactive).toBe(true);
    expect(marker.options.bubblingMouseEvents).toBe(false);
    expect(PANE_Z_INDEX[MAP_PANES.historicalPoints]).toBeLessThan(
      PANE_Z_INDEX[MAP_PANES.currentLocation] ?? 0,
    );
  });

  it("カテゴリを色だけでなく破線と半径でも区別する", () => {
    const court = kyotoMarkerStyle("court-politics");
    const battle = kyotoMarkerStyle("battle");
    const memorial = kyotoMarkerStyle("memorial");

    expect(court.color).not.toBe(battle.color);
    expect(court.dashArray).not.toBe(battle.dashArray);
    expect(court.radius).not.toBe(battle.radius);
    expect(memorial.dashArray).toBeTruthy();
    expect(memorial.radius).not.toBe(court.radius);
  });

  it("markerクリックで対応地点だけを選択し地図へ伝播しない", () => {
    const selected = vi.fn();
    const target = place({ id: "clicked-place" });
    const layer = createKyotoBakumatsuLayer(
      [target, place({ id: "other-place", longitude: 135.76 })],
      selected,
      document.createElement("div"),
    );
    const marker = layer.layer.getLayers()[0] as L.CircleMarker;

    marker.fire("click");
    expect(selected).toHaveBeenCalledOnce();
    expect(selected).toHaveBeenCalledWith(target);
    expect(marker.options.bubblingMouseEvents).toBe(false);
  });

  it("pane不透明度を範囲内へclampしてmarkerごとのstyle変更を避ける", () => {
    const pane = document.createElement("div");
    const layer = createKyotoBakumatsuLayer([place()], () => {}, pane);
    const marker = layer.layer.getLayers()[0] as L.CircleMarker;
    const setStyle = vi.spyOn(marker, "setStyle");

    layer.setOpacity(0.45);
    expect(pane.style.opacity).toBe("0.45");
    layer.setOpacity(-1);
    expect(pane.style.opacity).toBe("0");
    layer.setOpacity(2);
    expect(pane.style.opacity).toBe("1");
    expect(setStyle).not.toHaveBeenCalled();
  });
});
