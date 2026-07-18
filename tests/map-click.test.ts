import { beforeEach, describe, expect, it, vi } from "vitest";
import L from "leaflet";
import { createHistoricalLayer } from "../src/historical";
import { renderNoData, renderPlaceCard } from "../src/infocard";
import { handleHistoricalBackgroundClick } from "../src/map-click";
import type { PlaceFeature } from "../src/validate";

const PLACE: PlaceFeature = {
  name: "桜田御門",
  category: "施設",
  sheet: "御江戸大名小路絵図",
  entryId: "1-001",
  sourceUrl: null,
  lat: 35.68,
  lon: 139.75,
};

let card: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  card = document.createElement("section");
  card.hidden = true;
  document.body.append(card);
});

describe("Canvas地点と地図背景のクリック振り分け", () => {
  it("地点クリックは情報カードへ到達し、空白地点処理を同時実行しない", () => {
    const showNoData = vi.fn(() => renderNoData(card));
    const historical = createHistoricalLayer(
      [PLACE],
      (place) => renderPlaceCard(card, place),
      document.createElement("div"),
    );
    const marker = historical.layer.getLayers()[0] as L.CircleMarker;

    marker.fire("click");
    const handledAsBackground = handleHistoricalBackgroundClick(
      card,
      true,
      showNoData,
    );

    expect(card.textContent).toContain("桜田御門");
    expect(card.textContent).not.toContain(
      "この地点には登録された歴史地名データがありません",
    );
    expect(handledAsBackground).toBe(false);
    expect(showNoData).not.toHaveBeenCalled();
  });

  it("江戸地名のない空白地点では従来のデータなし表示を実行する", () => {
    const handled = handleHistoricalBackgroundClick(card, true, () =>
      renderNoData(card),
    );
    expect(handled).toBe(true);
    expect(card.textContent).toContain(
      "この地点には登録された歴史地名データがありません",
    );
  });

  it("現代表示では空白地点を歴史データなしとして扱わない", () => {
    const showNoData = vi.fn();
    expect(handleHistoricalBackgroundClick(card, false, showNoData)).toBe(
      false,
    );
    expect(showNoData).not.toHaveBeenCalled();
  });

  it("4表示モードとreduced motion相当の即時切替後もmarkerイベントを維持する", () => {
    const onSelect = vi.fn();
    const historical = createHistoricalLayer(
      [PLACE],
      onSelect,
      document.createElement("div"),
    );
    const marker = historical.layer.getLayers()[0] as L.CircleMarker;
    for (const mode of ["reconstructed", "historical-map", "compare", "points"] as const) {
      expect(mode).toBeTruthy();
      marker.fire("click");
    }
    expect(onSelect).toHaveBeenCalledTimes(4);
  });
});
