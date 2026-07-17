import { readFileSync } from "node:fs";
import { join } from "node:path";
import L from "leaflet";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildShigaGeoJson } from "../scripts/build-shiga-sengoku-places.mjs";
import { renderShigaPlaceCard } from "../src/shiga-infocard";
import { createShigaSengokuLayer, shigaMarkerStyle } from "../src/shiga-layer";
import {
  parseShigaSengokuGeoJson,
  loadShigaSengokuPlaces,
  SHIGA_BOUNDS,
  SHIGA_SENGOKU_DATASET_ID,
  type ShigaSengokuPlace,
} from "../src/shiga-sengoku-places";
import { SHIGA_SOURCE_DEFINITIONS } from "../src/shiga-source-registry";

const ROOT = join(__dirname, "..");
const RAW = readFileSync(join(ROOT, "public/data/shiga-sengoku-places.geojson"), "utf8");
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

interface MutableShigaFixture {
  features: Array<{
    type: string;
    geometry: { type: string; coordinates: unknown[] };
    properties: Record<string, unknown>;
  }>;
}

function modified(mutator: (value: MutableShigaFixture) => void): () => readonly ShigaSengokuPlace[] {
  const value = JSON.parse(RAW) as MutableShigaFixture;
  mutator(value);
  return () => parseShigaSengokuGeoJson(JSON.stringify(value));
}

describe("滋賀・戦国GeoJSON", () => {
  it("決定的生成した36地点を固定ID・bounds・登録出典で読み込む", () => {
    const places = parseShigaSengokuGeoJson(RAW);
    expect(places).toHaveLength(36);
    expect(new Set(places.map(({ id }) => id)).size).toBe(36);
    expect(places.every((place) => place.eraId === "sengoku" && place.sourceId === SHIGA_SENGOKU_DATASET_ID)).toBe(true);
    expect(places.every((place) => place.latitude >= SHIGA_BOUNDS.minLat && place.latitude <= SHIGA_BOUNDS.maxLat && place.longitude >= SHIGA_BOUNDS.minLon && place.longitude <= SHIGA_BOUNDS.maxLon)).toBe(true);
    expect(places.every((place) => place.sourceIds.every((id) => SHIGA_SOURCE_DEFINITIONS.some((source) => source.id === id)))).toBe(true);
    expect(Object.isFrozen(places)).toBe(true);
  });

  it("キュレーションから公開GeoJSONを同一SHAで再現する", () => {
    const built = buildShigaGeoJson();
    expect(built.output).toBe(RAW);
    expect(built.featureCount).toBe(36);
    expect(built.sourceCount).toBe(17);
    expect(built.sha256).toBe("0467e166fdd7ff58bcc9ada8366068fe6e877edfc6af508df65ac7b355c26fb9");
  });

  it.each([29, 51])("%d件の件数違反を拒否する", (count) => {
    expect(modified((value) => {
      value.features = Array.from({ length: count }, (_, index) => {
        const source = value.features[index % 36]!;
        return {
          type: source.type,
          properties: { ...source.properties, id: `count-${index}` },
          geometry: { ...source.geometry, coordinates: [135.8 + index * 0.001, 35.1 + index * 0.001] },
        };
      });
    })).toThrow("30〜50件");
  });

  it("Point以外、bounds外、NaN相当、重複座標を拒否する", () => {
    expect(modified((value) => { value.features[0]!.geometry.type = "LineString"; })).toThrow("Point");
    expect(modified((value) => { value.features[0]!.geometry.coordinates = [140, 35]; })).toThrow("bounds外");
    expect(modified((value) => { value.features[0]!.geometry.coordinates[0] = "NaN"; })).toThrow("有限数");
    expect(modified((value) => { value.features[1]!.geometry.coordinates = value.features[0]!.geometry.coordinates; })).toThrow("座標が重複");
  });

  it("未許可プロパティ、固定ID改変、未登録出典、HTMLを拒否する", () => {
    expect(modified((value) => { value.features[0]!.properties.extra = true; })).toThrow("未許可");
    expect(modified((value) => { value.features[0]!.properties.eraId = "bakumatsu"; })).toThrow("固定ID");
    expect(modified((value) => { value.features[0]!.properties.sourceIds = ["unknown-source"]; })).toThrow("未登録");
    expect(modified((value) => { value.features[0]!.properties.nameJa = "<script>危険</script>"; })).toThrow("不正");
  });

  it("同一オリジン固定パスをcredentialsなし・redirect拒否で取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      redirected: false,
      headers: new Headers({ "content-type": "application/geo+json; charset=utf-8" }),
      text: () => Promise.resolve(RAW),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadShigaSengokuPlaces("/base/")).resolves.toHaveLength(36);
    expect(fetchMock).toHaveBeenCalledWith("/base/data/shiga-sengoku-places.geojson", expect.objectContaining({ credentials: "omit", redirect: "error", signal: expect.any(AbortSignal) }));
  });

  it("不正content-typeと過大content-lengthを本文解析前に拒否する", async () => {
    const text = vi.fn().mockResolvedValue(RAW);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, redirected: false, headers: new Headers({ "content-type": "text/html" }), text }));
    await expect(loadShigaSengokuPlaces("/")).rejects.toThrow("応答が不正");
    expect(text).not.toHaveBeenCalled();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200, redirected: false, headers: new Headers({ "content-type": "application/geo+json", "content-length": String(1024 * 1024 + 1) }), text }));
    await expect(loadShigaSengokuPlaces("/")).rejects.toThrow("サイズ");
    expect(text).not.toHaveBeenCalled();
  });
});

describe("滋賀・戦国レイヤー", () => {
  const places = parseShigaSengokuGeoJson(RAW);

  it("カテゴリを色・破線・半径の組合せで区別する", () => {
    const castle = shigaMarkerStyle("castle");
    const battle = shigaMarkerStyle("battle");
    const politics = shigaMarkerStyle("politics");
    expect(new Set([castle.color, battle.color, politics.color]).size).toBe(3);
    expect(castle.dashArray).not.toBe(politics.dashArray);
    expect(battle.radius).not.toBe(politics.radius);
  });

  it("非bubbling markerの選択とpane単位の不透明度を提供する", () => {
    const selected = vi.fn(); const pane = document.createElement("div");
    const layer = createShigaSengokuLayer(places.slice(0, 2), selected, pane);
    const marker = layer.layer.getLayers()[0] as L.CircleMarker;
    expect(marker.options.bubblingMouseEvents).toBe(false);
    marker.fire("click"); expect(selected).toHaveBeenCalledWith(places[0]);
    layer.setOpacity(2); expect(pane.style.opacity).toBe("1");
  });
});

describe("滋賀・戦国情報カード", () => {
  let container: HTMLElement;
  beforeEach(() => { document.body.replaceChildren(); container = document.createElement("section"); document.body.append(container); });
  it("市町・精度・状態・地点別出典と山城注意を安全なDOMで表示する", () => {
    const place = parseShigaSengokuGeoJson(RAW).find(({ category }) => category === "castle")!;
    renderShigaPlaceCard(container, place);
    expect(container.textContent).toContain(place.municipalityJa);
    expect(container.textContent).toContain("登山口");
    expect(container.textContent).toContain("出典");
    const link = container.querySelector("a")!;
    expect(link.protocol).toBe("https:"); expect(link.rel).toContain("noopener");
  });

  it("innerHTMLを使わず外部文字列を要素として解釈しない", () => {
    const place = { ...parseShigaSengokuGeoJson(RAW)[0]!, nameJa: "<img src=x onerror=alert(1)>" };
    const setter = vi.spyOn(Element.prototype, "innerHTML", "set");
    renderShigaPlaceCard(container, place);
    expect(setter).not.toHaveBeenCalled(); expect(container.querySelector("img")).toBeNull();
  });

  it("閉じるとカードを消し呼び出し元へフォーカスを戻す", () => {
    const trigger = document.createElement("button"); document.body.prepend(trigger);
    renderShigaPlaceCard(container, parseShigaSengokuGeoJson(RAW)[0]!, trigger);
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(container.hidden).toBe(true); expect(document.activeElement).toBe(trigger);
  });
});
