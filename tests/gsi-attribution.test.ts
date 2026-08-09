import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAttribution } from "../src/attribution";
import { createGsiAttributionControlView } from "../src/gsi-attribution-control";
import {
  GSI_ADDITIONAL_CONDITIONS_SECTION_ID,
  GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS,
  GSI_ADDITIONAL_SOURCE_IDS,
  GSI_LOW_ZOOM_MAX,
  GSI_LOW_ZOOM_MIN,
  GSI_PROJECT_HISTORY_ADDITION_TEXT,
  GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT,
  GSI_VMAP0_SOURCE_TEXT,
  resolveGsiAdditionalSources,
} from "../src/gsi-attribution";

const expectedGebcoJcg = `「The bathymetric contours are derived from those contained within the GEBCO Digital Atlas, published by the BODC on behalf of IOC and IHO (2003) (https://www.gebco.net)
海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）」`;

describe("GSI low-zoom additional attribution", () => {
  it("keeps the official source strings exact", () => {
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT).toBe(expectedGebcoJcg);
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT.startsWith("「")).toBe(true);
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT.endsWith("」")).toBe(true);
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT).not.toContain("『");
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT).not.toContain("』");
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT.split("\n")).toHaveLength(2);
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT).toContain("(https://www.gebco.net)\n");
    expect(GSI_STD_LOW_ZOOM_GEBCO_JCG_TEXT).not.toContain("https://www.gebco.net).\n");
    expect(GSI_VMAP0_SOURCE_TEXT).toBe(
      'Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0)." Bethesda, MD: Denver, CO: The Agency; USGS Information Services, 1997.',
    );
  });

  it("keeps short Leaflet links only as auxiliary attribution", () => {
    const values = Object.values(GSI_ADDITIONAL_SOURCE_ATTRIBUTIONS).join("\n");
    expect(values).toContain("GSI low-zoom VMAP0 shoreline source");
    expect(values).toContain("GEBCO Digital Atlas bathymetric contours");
    expect(values).toContain("Japan Coast Guard permit (GSI low-zoom source)");
  });

  it("resolves deterministic sources by base, zoom, and visibility", () => {
    expect(resolveGsiAdditionalSources({ base: "pale", zoom: 4, baseVisible: true })).toEqual([]);
    for (const zoom of [GSI_LOW_ZOOM_MIN, GSI_LOW_ZOOM_MAX]) {
      expect(resolveGsiAdditionalSources({ base: "pale", zoom, baseVisible: true })).toEqual([
        { id: GSI_ADDITIONAL_SOURCE_IDS.paleVmap0, text: GSI_VMAP0_SOURCE_TEXT },
      ]);
      expect(resolveGsiAdditionalSources({ base: "std", zoom, baseVisible: true })).toEqual([
        { id: GSI_ADDITIONAL_SOURCE_IDS.stdGebcoJcg, text: expectedGebcoJcg },
        { id: GSI_ADDITIONAL_SOURCE_IDS.stdVmap0, text: GSI_VMAP0_SOURCE_TEXT },
      ]);
    }
    expect(resolveGsiAdditionalSources({ base: "pale", zoom: 9, baseVisible: true })).toEqual([]);
    expect(resolveGsiAdditionalSources({ base: "std", zoom: 9, baseVisible: true })).toEqual([]);
    expect(resolveGsiAdditionalSources({ base: "std", zoom: 5, baseVisible: false })).toEqual([]);
    expect(resolveGsiAdditionalSources({ base: "unknown" as never, zoom: 5, baseVisible: true })).toEqual([]);
  });

  it("renders full applicable text in a non-focusable text-only control", () => {
    const view = createGsiAttributionControlView();
    document.body.append(view.element);
    expect(view.element.hidden).toBe(true);
    expect(view.element.textContent).toBe("");

    view.update(resolveGsiAdditionalSources({ base: "pale", zoom: 5, baseVisible: true }));
    expect(view.element.hidden).toBe(false);
    expect(view.element.textContent).toContain(GSI_VMAP0_SOURCE_TEXT);
    expect(view.element.querySelector("a,button,input,[tabindex]")).toBeNull();
    expect(view.element.querySelector("[aria-live]")).toBeNull();
    expect(view.element.querySelector("[onclick],[onerror]")).toBeNull();

    const standard = resolveGsiAdditionalSources({ base: "std", zoom: 8, baseVisible: true });
    view.update(standard);
    view.update(standard);
    expect(view.element.querySelectorAll("p")).toHaveLength(2);
    expect([...view.element.querySelectorAll("p")].map((node) => node.textContent)).toEqual([
      expectedGebcoJcg,
      GSI_VMAP0_SOURCE_TEXT,
    ]);

    view.update(resolveGsiAdditionalSources({ base: "std", zoom: 9, baseVisible: true }));
    expect(view.element.hidden).toBe(true);
    expect(view.element.getAttribute("aria-hidden")).toBe("true");
    expect(view.element.textContent).toBe("");
    view.dispose();
    view.dispose();
    expect(view.element.isConnected).toBe(false);
  });

  it("keeps normal GSI attribution explicit about project-added history", () => {
    const root = join(__dirname, "..");
    const config = readFileSync(join(root, "src", "config.ts"), "utf8");
    const main = readFileSync(join(root, "src", "main.ts"), "utf8");
    expect(GSI_PROJECT_HISTORY_ADDITION_TEXT).toBe("地理院タイルに本プロジェクトの歴史情報を追記して掲載");
    expect(config).toContain("GSI_PROJECT_HISTORY_ADDITION_TEXT");
    expect(config).toContain("https://maps.gsi.go.jp/development/ichiran.html");
    expect(main).toContain("createGsiAttributionControl(map)");
    expect(main).toContain("gsiAttributionControl.update(additionalSources)");
    expect(main).toContain("gsiAttributionControl.dispose()");
  });

  it("makes the GSI dialog comprehensive without current map state", () => {
    const container = document.createElement("div");
    renderAttribution(container, ["gsi-tiles"]);
    expect(container.textContent).toContain(GSI_PROJECT_HISTORY_ADDITION_TEXT);
    expect(container.textContent).toContain(expectedGebcoJcg);
    expect(container.textContent).toContain(GSI_VMAP0_SOURCE_TEXT);
    expect(container.textContent).toContain("ズーム");
    for (const href of [
      "https://maps.gsi.go.jp/development/ichiran.html",
      "https://maps.gsi.go.jp/development/siyou.html",
      "https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html",
      "https://www.gsi.go.jp/LAW/2930-meizi.html",
      "https://www.gsi.go.jp/LAW/2930-index.html",
    ]) {
      expect(container.querySelector(`a[href='${href}']`)).not.toBeNull();
    }
    expect(GSI_ADDITIONAL_CONDITIONS_SECTION_ID).toBe("gsi-low-zoom-conditions");
  });

  it("uses bounded, scrollable, non-truncating responsive CSS", () => {
    const css = readFileSync(join(__dirname, "..", "src", "style.css"), "utf8");
    const controlCss = css.slice(css.indexOf(".gsi-source-control"));
    expect(controlCss).toContain("max-width:");
    expect(controlCss).toContain("max-height:");
    expect(controlCss).toContain("overflow-y: auto");
    expect(controlCss).toContain("overflow-x: hidden");
    expect(controlCss).toContain("white-space: pre-line");
    expect(controlCss).toContain("env(safe-area-inset-right)");
    expect(controlCss).not.toContain("line-clamp");
    expect(controlCss).not.toContain("text-overflow: ellipsis");
  });
});
