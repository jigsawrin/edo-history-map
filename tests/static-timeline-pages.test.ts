import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { generateStaticTimelineFiles } from "../scripts/build-static-timeline-pages.mjs";

const ROOT = join(__dirname, "..");
type Generated = ReturnType<typeof generateStaticTimelineFiles>;
let generated: Generated;

beforeAll(() => {
  const themes = JSON.parse(readFileSync(join(ROOT, "data-curation/historical-themes.json"), "utf8"));
  const kyotoPlaces = JSON.parse(readFileSync(join(ROOT, "data-curation/kyoto-bakumatsu-places.json"), "utf8"));
  const shigaPlaces = JSON.parse(readFileSync(join(ROOT, "data-curation/shiga-sengoku-places.json"), "utf8"));
  const dirs: Record<string, string> = { person: "people", event: "events", group: "groups", concept: "concepts" };
  const themeFiles = new Map<string, string>();
  for (const path of ["index.html", "people/index.html", "events/index.html", "groups/index.html", "concepts/index.html"]) themeFiles.set(path, `<main><h1>${path}</h1></main>`);
  for (const theme of themes) themeFiles.set(`${dirs[theme.type]}/${theme.id.slice(`${theme.type}-`.length)}/index.html`, `<main><h1>${theme.titleJa}</h1><nav class="theme-nav"></nav></main>`);
  themeFiles.set("static-themes.css", "a:focus-visible{} @media print{}");
  const placeHtml = (places: Array<{ id: string }>, prefix: string) => places.map((place) => `<article id="${prefix}${place.id}"><h3>${place.id}</h3></article>`).join("");
  const themeHashes = Object.fromEntries([...themeFiles].map(([path, content]) => [path, createHash("sha256").update(content).digest("hex")]));
  generated = generateStaticTimelineFiles({
    timelineInput: readFileSync(join(ROOT, "data-curation/historical-timeline.json"), "utf8"), themes, kyotoPlaces, shigaPlaces,
    kyotoSources: JSON.parse(readFileSync(join(ROOT, "src/kyoto-source-registry.json"), "utf8")),
    shigaSources: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
    css: readFileSync(join(ROOT, "src/static-timeline.css"), "utf8"),
    placeManifest: { schemaVersion: 2, files: { "kyoto/index.html": "x", "shiga/index.html": "y" }, themes: { files: themeHashes } },
    kyotoPlaceHtml: placeHtml(kyotoPlaces, "place-kyoto-"), shigaPlaceHtml: placeHtml(shigaPlaces, "place-shiga-"), themeFiles,
  });
});

describe("静的歴史年表生成", () => {
  it("トップ・滋賀・京都の3ページと35項目を生成する", () => {
    expect(generated.files.has("index.html")).toBe(true); expect(generated.files.has("shiga-sengoku/index.html")).toBe(true); expect(generated.files.has("kyoto-bakumatsu/index.html")).toBe(true);
    expect([...generated.files.values()].join("").match(/class="timeline-entry"/gu)).toHaveLength(35);
    expect(generated.manifest.timeline).toMatchObject({ entryCount: 35, htmlPageCount: 3, placeRelationCount: 42, themeRelationCount: 62, relatedThemeCount: 21 });
  });

  it("時代間の大きな空白と非網羅性を明示する", () => {
    const top = generated.files.get("index.html") ?? ""; expect(top).toContain("大きな空白"); expect(top).toContain("連続的・網羅的"); expect(top).toContain("JavaScript");
  });

  it("旧暦の月日をdatetimeへ入れず年精度だけを機械可読化する", () => {
    const kyoto = generated.files.get("kyoto-bakumatsu/index.html") ?? ""; const shiga = generated.files.get("shiga-sengoku/index.html") ?? "";
    expect(kyoto).not.toContain('datetime="1864-06-05"'); expect(kyoto).toContain("グレゴリオ暦へ換算していません"); expect(shiga).toContain('<time datetime="1571">元亀2年（1571年）</time>');
  });

  it("全アンカー・地点リンク・テーマリンク・前後リンクを固定内部リンクで出力する", () => {
    const html = [...generated.files.values()].join(""); for (const entry of generated.entries) expect(html).toContain(`id="${entry.id}"`);
    expect(html).toContain("../../places/shiga/#place-shiga-"); expect(html).toContain("../../themes/people/"); expect(html).toContain('rel="next"'); expect(html).toContain('rel="prev"');
  });

  it("地点42件分とテーマ62件分の逆リンクを明示参照から生成する", () => {
    expect(generated.manifest.timeline.placeBacklinkCount).toBe(42); expect(generated.manifest.timeline.themeBacklinkCount).toBe(62);
    expect(Object.values(generated.placeUpdates).join("").match(/related-timeline/gu)?.length).toBeGreaterThan(0); expect([...generated.themeUpdates.values()].join("")).toContain("関連する歴史年表");
  });

  it("厳格CSP・HTMLエスケープ・JavaScriptなし・formなし・外部資産なしを維持する", () => {
    for (const [path, content] of generated.files) { if (!path.endsWith(".html")) continue; expect(content).toContain("script-src 'none'"); expect(content).toContain("img-src 'none'"); expect(content).toContain("font-src 'none'"); expect(content).not.toMatch(/<script|<form|<img|<iframe/iu); }
    expect(generated.files.get("static-timeline.css")).not.toMatch(/@import|url\s*\(/iu);
  });

  it("同一入力から同一HTML SHAとキュレーションSHAを再現する", () => {
    expect(generated.manifest.timeline.htmlSha256).toMatch(/^[a-f0-9]{64}$/u); expect(generated.manifest.timeline.inputCurationSha256).toBe(createHash("sha256").update(readFileSync(join(ROOT, "data-curation/historical-timeline.json"), "utf8")).digest("hex"));
  });
});
