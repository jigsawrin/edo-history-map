import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditStaticPlaceLinks } from "../scripts/audit-static-place-links.mjs";
import {
  escapeHtml,
  EXPECTED_DATA_SHA256,
  generateStaticPlaceFiles,
  STATIC_EDO_PER_PAGE,
  validateExternalSourceUrl,
  type StaticPlaceGeneration,
} from "../scripts/build-static-place-pages.mjs";
import { generateStaticThemeFiles } from "../scripts/build-static-theme-pages.mjs";
import { generateStaticTimelineFiles } from "../scripts/build-static-timeline-pages.mjs";

const ROOT = join(__dirname, "..");
let generated: StaticPlaceGeneration;
let temporaryDist = "";

beforeAll(() => {
  generated = generateStaticPlaceFiles({
    edoRaw: readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"),
    kyotoRaw: readFileSync(
      join(ROOT, "public/data/kyoto-bakumatsu-places.geojson"),
      "utf8",
    ),
    sourceData: JSON.parse(
      readFileSync(join(ROOT, "src/kyoto-source-registry.json"), "utf8"),
    ),
    presentation: JSON.parse(
      readFileSync(join(ROOT, "src/kyoto-place-presentation.json"), "utf8"),
    ) as Record<string, unknown>,
    shigaRaw: readFileSync(join(ROOT, "public/data/shiga-sengoku-places.geojson"), "utf8"),
    shigaSourceData: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
    shigaPresentation: JSON.parse(readFileSync(join(ROOT, "src/shiga-place-presentation.json"), "utf8")) as Record<string, unknown>,
    css: readFileSync(join(ROOT, "src/static-places.css"), "utf8"),
    inputSha256: EXPECTED_DATA_SHA256,
  });
}, 30_000);

afterAll(() => {
  if (temporaryDist) rmSync(dirname(temporaryDist), { recursive: true, force: true });
});

describe("静的地点一覧のHTMLエスケープ", () => {
  it.each([
    ["&", "&amp;"],
    ["<", "&lt;"],
    [">", "&gt;"],
    ['"', "&quot;"],
    ["'", "&#39;"],
    ["日本語", "日本語"],
    ["制御\u0000文字", "制御文字"],
    ["<script>alert('x')</script>", "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;"],
    ["[表示](javascript:alert(1))", "[表示](javascript:alert(1))"],
  ])("%sを安全なテキストへ変換する", (input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  it("悪意ある属性風文字列を属性値として無害化する", () => {
    expect(escapeHtml('地点" autofocus onfocus="alert(1)')).toBe(
      "地点&quot; autofocus onfocus=&quot;alert(1)",
    );
  });
});

describe("静的地点一覧の外部URL検証", () => {
  const allowed = new Set(["https://codh.rois.ac.jp"]);

  it("許可originのHTTPS・query・fragmentを許可する", () => {
    expect(
      validateExternalSourceUrl(
        "https://codh.rois.ac.jp/edo-maps/?q=1#detail",
        allowed,
      ),
    ).toBe("https://codh.rois.ac.jp/edo-maps/?q=1#detail");
  });

  it.each([
    "http://codh.rois.ac.jp/edo-maps/",
    "javascript:alert(1)",
    "data:text/html,x",
    "file:///tmp/x",
    "https://evil.example/",
    "https://user:" + "pass" + "@codh.rois.ac.jp/edo-maps/",
    "../relative",
  ])("不正な外部URLを拒否する: %s", (url) => {
    expect(() => validateExternalSourceUrl(url, allowed)).toThrow();
  });
});

describe("静的地点一覧生成", () => {
  it("EDO 8,788件を100件単位の88ページ、京都36件を1ページへ生成する", () => {
    expect(generated.manifest.edo).toEqual({
      placeCount: 8788,
      pageCount: 88,
      perPage: STATIC_EDO_PER_PAGE,
      finalPageCount: 88,
    });
    expect(generated.manifest.kyoto).toEqual({ placeCount: 36, pageCount: 1 });
    expect(generated.manifest.shiga).toEqual({ placeCount: 36, pageCount: 1 });
    expect(generated.files.has("index.html")).toBe(true);
    expect(generated.files.has("edo/index.html")).toBe(true);
    expect(generated.files.has("edo/page-44.html")).toBe(true);
    expect(generated.files.has("edo/page-88.html")).toBe(true);
    expect(generated.files.has("kyoto/index.html")).toBe(true);
    expect(generated.files.has("shiga/index.html")).toBe(true);
  });

  it("各EDO地点を1回だけ出力し、ページ境界と前後リンクを保つ", () => {
    const edoPages = [...generated.files]
      .filter(([path]) => /^edo\/(?:index|page-\d+)\.html$/u.test(path))
      .map(([, html]) => html);
    const counts = edoPages.map(
      (html) => html.match(/data-place-region="edo"/gu)?.length ?? 0,
    );
    expect(counts.slice(0, -1).every((count) => count === 100)).toBe(true);
    expect(counts.at(-1)).toBe(88);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(8788);
    expect(generated.files.get("edo/index.html")).not.toContain('rel="prev"');
    expect(generated.files.get("edo/index.html")).toContain('rel="next"');
    expect(generated.files.get("edo/page-88.html")).toContain('rel="prev"');
    expect(generated.files.get("edo/page-88.html")).not.toContain('rel="next"');
  });

  it("EDOは元データにある項目と推定注意・CODHリンクだけを地点本文へ表示する", () => {
    const html = generated.files.get("edo/index.html") ?? "";
    const article = html.match(/<article[\s\S]*?<\/article>/u)?.[0] ?? "";
    expect(article).toContain("分類");
    expect(article).toContain("収載切絵図");
    expect(article).toContain("対象年代");
    expect(article).toContain("推定位置");
    expect(article).toContain("https://codh.rois.ac.jp/edo-maps/");
    expect(article).not.toContain("現代住所");
    expect(article).not.toContain("読み仮名");
    expect(article).not.toContain("位置精度");
  });

  it("EDO地域先頭に全ページの実在地点名範囲を出力する", () => {
    const html = generated.files.get("edo/index.html") ?? "";
    expect(html).toContain("ページごとの地点名範囲");
    expect(html.match(/<li><a href="\.\/(?:index|page-\d+)\.html">\d+ページ：/gu)).toHaveLength(88);
    expect(html).toContain("読み仮名を推測せず");
  });

  it("京都は説明・位置関係・史跡状態・精度・注意・固定出典を表示する", () => {
    const html = generated.files.get("kyoto/index.html") ?? "";
    expect(html.match(/data-place-region="kyoto"/gu)).toHaveLength(36);
    for (const text of [
      "分類",
      "時期",
      "現在地と歴史位置",
      "史跡の状態",
      "位置精度",
      "位置について",
      "出典",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("幕末当時の一点と一致するとは限りません");
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
  });

  it("滋賀は市町・代表位置・山城注意・固定出典を36件表示する", () => {
    const html = generated.files.get("shiga/index.html") ?? "";
    expect(html.match(/data-place-region="shiga"/gu)).toHaveLength(36);
    for (const text of ["市町", "現在地と歴史位置", "位置精度", "登山口", "出典", "地図で滋賀・戦国を開く"]) {
      expect(html).toContain(text);
    }
  });

  it("地点アンカーが安全かつ全8,860件で一意である", () => {
    const anchors = [...generated.files.values()].flatMap((html) =>
      [...html.matchAll(/<article id="(place-(?:edo|kyoto|shiga)-[a-z0-9-]+)"/gu)].map(
        (match) => match[1],
      ),
    );
    expect(anchors).toHaveLength(8860);
    expect(new Set(anchors).size).toBe(8860);
  });

  it("静的ページにJavaScript・form・外部画像・外部フォントを含めない", () => {
    for (const [path, content] of generated.files) {
      if (!path.endsWith(".html")) continue;
      expect(content).not.toMatch(/<script|<form|<img|<iframe/iu);
      expect(content).toContain("script-src 'none'");
      expect(content).toContain("img-src 'none'");
      expect(content).toContain("font-src 'none'");
    }
    expect(generated.files.get("static-places.css")).not.toMatch(/@import|url\s*\(/iu);
  });

  it("同じ入力から同じHTMLとmanifestを再現する", () => {
    const second = generateStaticPlaceFiles({
      edoRaw: readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"),
      kyotoRaw: readFileSync(join(ROOT, "public/data/kyoto-bakumatsu-places.geojson"), "utf8"),
      sourceData: JSON.parse(readFileSync(join(ROOT, "src/kyoto-source-registry.json"), "utf8")),
      presentation: JSON.parse(readFileSync(join(ROOT, "src/kyoto-place-presentation.json"), "utf8")) as Record<string, unknown>,
      shigaRaw: readFileSync(join(ROOT, "public/data/shiga-sengoku-places.geojson"), "utf8"),
      shigaSourceData: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
      shigaPresentation: JSON.parse(readFileSync(join(ROOT, "src/shiga-place-presentation.json"), "utf8")) as Record<string, unknown>,
      css: readFileSync(join(ROOT, "src/static-places.css"), "utf8"),
      inputSha256: EXPECTED_DATA_SHA256,
    });
    expect(second.files.get("manifest.json")).toBe(generated.files.get("manifest.json"));
    expect(second.files.get("edo/page-44.html")).toBe(generated.files.get("edo/page-44.html"));
    expect(second.files.get("kyoto/index.html")).toBe(generated.files.get("kyoto/index.html"));
    expect(second.files.get("shiga/index.html")).toBe(generated.files.get("shiga/index.html"));
  }, 30_000);

  it("生成物の内部リンク・アンカー・manifest SHAを監査する", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "edo-static-places-"));
    temporaryDist = join(temporaryRoot, "dist");
    mkdirSync(temporaryDist, { recursive: true });
    writeFileSync(join(temporaryDist, "index.html"), "<!doctype html><title>map</title>");
    for (const [path, content] of generated.files) {
      const output = join(temporaryDist, "places", path);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, content, "utf8");
    }
    const themeInput = readFileSync(join(ROOT, "data-curation/historical-themes.json"), "utf8");
    const themeGenerated = generateStaticThemeFiles({
      themeData: JSON.parse(themeInput),
      kyotoPlaces: JSON.parse(readFileSync(join(ROOT, "data-curation/kyoto-bakumatsu-places.json"), "utf8")),
      shigaPlaces: JSON.parse(readFileSync(join(ROOT, "data-curation/shiga-sengoku-places.json"), "utf8")),
      kyotoSources: JSON.parse(readFileSync(join(ROOT, "src/kyoto-source-registry.json"), "utf8")),
      shigaSources: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
      kyotoPresentation: JSON.parse(readFileSync(join(ROOT, "src/kyoto-place-presentation.json"), "utf8")),
      shigaPresentation: JSON.parse(readFileSync(join(ROOT, "src/shiga-place-presentation.json"), "utf8")),
      css: readFileSync(join(ROOT, "src/static-themes.css"), "utf8"),
      placeManifest: JSON.parse(generated.files.get("manifest.json") ?? "{}"),
      kyotoPlaceHtml: generated.files.get("kyoto/index.html") ?? "",
      shigaPlaceHtml: generated.files.get("shiga/index.html") ?? "",
      themeInputSha256: createHash("sha256").update(themeInput).digest("hex"),
    });
    for (const [path, content] of themeGenerated.files) {
      const output = join(temporaryDist, "themes", path);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, content, "utf8");
    }
    const timelineGenerated = generateStaticTimelineFiles({
      timelineInput: readFileSync(join(ROOT, "data-curation/historical-timeline.json"), "utf8"),
      themes: JSON.parse(themeInput),
      kyotoPlaces: JSON.parse(readFileSync(join(ROOT, "data-curation/kyoto-bakumatsu-places.json"), "utf8")),
      shigaPlaces: JSON.parse(readFileSync(join(ROOT, "data-curation/shiga-sengoku-places.json"), "utf8")),
      kyotoSources: JSON.parse(readFileSync(join(ROOT, "src/kyoto-source-registry.json"), "utf8")),
      shigaSources: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
      css: readFileSync(join(ROOT, "src/static-timeline.css"), "utf8"),
      placeManifest: themeGenerated.manifest,
      kyotoPlaceHtml: themeGenerated.updatedKyotoHtml,
      shigaPlaceHtml: themeGenerated.updatedShigaHtml,
      themeFiles: themeGenerated.files,
    });
    for (const [path, content] of timelineGenerated.files) {
      const output = join(temporaryDist, "timeline", path);
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, content, "utf8");
    }
    for (const [path, content] of timelineGenerated.themeUpdates) {
      writeFileSync(join(temporaryDist, "themes", path), content, "utf8");
    }
    for (const [path, content] of Object.entries(timelineGenerated.placeUpdates)) {
      writeFileSync(join(temporaryDist, "places", path), content, "utf8");
    }
    writeFileSync(join(temporaryDist, "places/manifest.json"), `${JSON.stringify(timelineGenerated.manifest, null, 2)}\n`, "utf8");
    const result = auditStaticPlaceLinks(ROOT, temporaryDist);
    expect(result).toMatchObject({
      htmlFileCount: 120,
      themeHtmlFileCount: 26,
      timelineHtmlFileCount: 3,
      timelineEntryCount: 35,
      themeCount: 21,
      relationCount: 87,
      edoCount: 8788,
      kyotoCount: 36,
      shigaCount: 36,
    });
    expect(result.manifestSha256).toMatch(/^[a-f0-9]{64}$/u);
  }, 60_000);
});
