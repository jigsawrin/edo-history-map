import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_DATA_SHA256,
  generateStaticPlaceFiles,
  parseStaticEdoPlaces,
  STATIC_EDO_PER_PAGE,
} from "../scripts/build-static-place-pages.mjs";
import {
  applyEdoStaticPlaceProjection,
  calculateEdoStaticLegacyLayoutSha256,
  canonicalEdoStaticLegacyLayout,
  validateEdoStaticPlaceProjection,
  type EdoStaticPlaceProjection,
} from "../scripts/edo-static-place-projection.mjs";

const ROOT = join(__dirname, "..");
const edoRaw = readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8");
const places = parseStaticEdoPlaces(edoRaw);
const checkedIn = JSON.parse(readFileSync(join(ROOT, "scripts/edo-static-place-projection.json"), "utf8")) as EdoStaticPlaceProjection;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function projectionFor(place: (typeof places)[number], options: { displayName: string | null; hidden: boolean }): EdoStaticPlaceProjection {
  return {
    ...clone(checkedIn),
    overrides: [{
      sourceRecordId: place.entryId,
      sourceIndex: place.sourceIndex,
      featureSha256: place.featureSha256,
      displayName: options.displayName,
      hidden: options.hidden,
    }],
  };
}

function generate(projection: EdoStaticPlaceProjection) {
  return generateStaticPlaceFiles({
    edoRaw,
    edoProjection: projection,
    kyotoRaw: readFileSync(join(ROOT, "public/data/kyoto-bakumatsu-places.geojson"), "utf8"),
    sourceData: JSON.parse(readFileSync(join(ROOT, "src/kyoto-source-registry.json"), "utf8")),
    presentation: JSON.parse(readFileSync(join(ROOT, "src/kyoto-place-presentation.json"), "utf8")),
    shigaRaw: readFileSync(join(ROOT, "public/data/shiga-sengoku-places.geojson"), "utf8"),
    shigaSourceData: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
    shigaPresentation: JSON.parse(readFileSync(join(ROOT, "src/shiga-place-presentation.json"), "utf8")),
    css: readFileSync(join(ROOT, "src/static-places.css"), "utf8"),
    inputSha256: EXPECTED_DATA_SHA256,
  });
}

function pagePath(index: number): string {
  const page = Math.floor(index / STATIC_EDO_PER_PAGE) + 1;
  return page === 1 ? "edo/index.html" : `edo/page-${page}.html`;
}

function articleHtml(html: string, anchor: string): string {
  const start = html.indexOf(`<article id="${anchor}"`);
  const end = html.indexOf("</article>", start);
  if (start < 0 || end < 0) throw new Error(`article not found: ${anchor}`);
  return html.slice(start, end + "</article>".length);
}

describe("EDO static place projection", () => {
  it("pins all legacy keys, anchors, pages, and slots deterministically", () => {
    const layout = canonicalEdoStaticLegacyLayout(places, STATIC_EDO_PER_PAGE);
    expect(layout).toHaveLength(8788);
    expect(calculateEdoStaticLegacyLayoutSha256(places, STATIC_EDO_PER_PAGE)).toBe("ba33be9595dfaa34a4494c45839c8ee1acbdaeac348645872bf58b6f013c6360");
    expect(checkedIn.legacyLayoutSha256).toBe("ba33be9595dfaa34a4494c45839c8ee1acbdaeac348645872bf58b6f013c6360");
    expect(() => validateEdoStaticPlaceProjection(checkedIn, places, { sourceDataSha256: EXPECTED_DATA_SHA256["public/data/edo-places.geojson"]!, perPage: STATIC_EDO_PER_PAGE })).not.toThrow();
    const projected = applyEdoStaticPlaceProjection(places, checkedIn);
    expect(projected.map(({ key, anchor, sourceIndex }) => ({ key, anchor, sourceIndex }))).toEqual(places.map(({ key, anchor, sourceIndex }) => ({ key, anchor, sourceIndex })));
  });

  it("applies an approved display name without changing legacy layout metadata", () => {
    const target = places[0]!;
    const projection = projectionFor(target, { displayName: "承認済み表示名", hidden: false });
    const generated = generate(projection);
    const article = articleHtml(generated.files.get(pagePath(0))!, target.anchor);
    expect(article).toContain("<h3>承認済み表示名</h3>");
    expect(article).toContain(target.category);
    expect(article).toContain(`href="#${target.anchor}"`);
    expect(generated.edoPlaces[0]).toMatchObject({ key: target.key, anchor: target.anchor, sourceIndex: target.sourceIndex, displayName: "承認済み表示名", hidden: false });
  });

  it("keeps an approved hidden record in the same anchor/page/slot as a generic tombstone", () => {
    const target = places[0]!;
    const projection = projectionFor(target, { displayName: null, hidden: true });
    const generated = generate(projection);
    const article = articleHtml(generated.files.get(pagePath(0))!, target.anchor);
    expect(article).toContain("<h3>表示対象外の地点</h3>");
    expect(article).toContain("この地点は現在、表示対象外です。");
    expect(article).not.toContain(target.name);
    expect(article).not.toContain(target.category);
    expect(article).not.toContain(target.sheet);
    expect(article).not.toContain(target.sourceUrl);
    expect(article).not.toMatch(/candidate|reviewer|evidence|hide/iu);
    expect(generated.edoPlaces).toHaveLength(8788);
    expect(generated.edoPlaces[0]).toMatchObject({ key: target.key, anchor: target.anchor, sourceIndex: target.sourceIndex, hidden: true });
  });

  it("rejects stale bindings, duplicate order, unknown fields, and private fields", () => {
    const target = places[0]!;
    const base = projectionFor(target, { displayName: "承認済み表示名", hidden: false });
    const mutations: Array<(projection: EdoStaticPlaceProjection) => void> = [
      (projection) => { projection.sourceDataSha256 = "0".repeat(64); },
      (projection) => { projection.legacyLayoutSha256 = "0".repeat(64); },
      (projection) => { projection.overrides[0]!.sourceIndex += 1; },
      (projection) => { projection.overrides[0]!.sourceRecordId = "unknown"; },
      (projection) => { projection.overrides[0]!.featureSha256 = "0".repeat(64); },
      (projection) => { projection.overrides = [clone(projection.overrides[0]!), clone(projection.overrides[0]!)]; },
      (projection) => { (projection.overrides[0] as typeof projection.overrides[0] & { sourceIdentityGroupId?: string }).sourceIdentityGroupId = "private"; },
      (projection) => { (projection as typeof projection & { reviewer?: string }).reviewer = "private"; },
    ];
    for (const mutate of mutations) {
      const projection = clone(base);
      mutate(projection);
      expect(() => validateEdoStaticPlaceProjection(projection, places, { sourceDataSha256: EXPECTED_DATA_SHA256["public/data/edo-places.geojson"]!, perPage: STATIC_EDO_PER_PAGE })).toThrow();
    }
  });
});
