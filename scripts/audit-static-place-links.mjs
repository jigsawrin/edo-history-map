import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { JSDOM } from "jsdom";
import { validateSources } from "./build-kyoto-bakumatsu-places.mjs";
import { EXPECTED_DATA_SHA256 } from "./build-static-place-pages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function fail(message) {
  throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function normalizedRelative(path, dist) {
  return relative(dist, path).split(sep).join("/");
}

function targetPathFromUrl(url, dist) {
  const decoded = decodeURIComponent(url.pathname);
  const candidate = resolve(dist, `.${decoded}`);
  if (candidate !== dist && !candidate.startsWith(`${dist}${sep}`)) {
    fail("内部リンクがdist外を参照しています");
  }
  if (url.pathname.endsWith("/")) return join(candidate, "index.html");
  return candidate;
}

function headingLevels(document, label) {
  const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(
    (heading) => Number(heading.tagName.slice(1)),
  );
  if (levels[0] !== 1 || levels.filter((level) => level === 1).length !== 1) {
    fail(`${label}のh1構造が不正です`);
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] > levels[index - 1] + 1) {
      fail(`${label}の見出し順序が不正です`);
    }
  }
}

function auditDocument(path, allowedOrigins, documents, dist) {
  const rel = normalizedRelative(path, dist);
  const document = documents.get(rel);
  if (!document) fail(`${rel}を解析できません`);
  if (document.documentElement.lang !== "ja") fail(`${rel}のlangが不正です`);
  if (!document.title.trim()) fail(`${rel}のtitleが空です`);
  if (!document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim()) {
    fail(`${rel}のdescriptionが空です`);
  }
  if (!document.querySelector('meta[http-equiv="Content-Security-Policy"]')) {
    fail(`${rel}にCSPがありません`);
  }
  if (!document.querySelector('a.skip-link[href="#main-content"]')) {
    fail(`${rel}にskip linkがありません`);
  }
  if (!document.querySelector("main#main-content") || !document.querySelector("nav[aria-label]")) {
    fail(`${rel}のlandmarkが不正です`);
  }
  headingLevels(document, rel);
  if (document.querySelector("script, form, img, iframe, object, embed")) {
    fail(`${rel}に禁止要素があります`);
  }
  const ids = [...document.querySelectorAll("[id]")].map((element) => element.id);
  if (new Set(ids).size !== ids.length) fail(`${rel}に重複IDがあります`);
  for (const element of document.querySelectorAll("*")) {
    for (const attribute of element.attributes) {
      if (attribute.name.toLowerCase().startsWith("on")) {
        fail(`${rel}にイベント属性があります`);
      }
    }
  }
  const base = new URL(`https://static.invalid/${rel}`);
  for (const link of document.querySelectorAll("a[href]")) {
    const href = link.getAttribute("href");
    if (!href?.trim() || !link.textContent?.trim()) {
      fail(`${rel}に空リンクがあります`);
    }
    const url = new URL(href, base);
    if (url.origin !== base.origin) {
      if (
        url.protocol !== "https:" ||
        url.username !== "" ||
        url.password !== "" ||
        !allowedOrigins.has(url.origin)
      ) {
        fail(`${rel}に許可外の外部リンクがあります`);
      }
      const relTokens = new Set((link.getAttribute("rel") ?? "").split(/\s+/u));
      if (
        link.getAttribute("target") !== "_blank" ||
        !relTokens.has("noopener") ||
        !relTokens.has("noreferrer") ||
        !link.textContent.includes("外部サイト")
      ) {
        fail(`${rel}の外部リンク属性または識別が不正です`);
      }
      continue;
    }
    const target = targetPathFromUrl(url, dist);
    if (!existsSync(target) || !statSync(target).isFile()) {
      fail(`${rel}の内部リンク先がありません: ${href}`);
    }
    if (url.hash) {
      const targetRel = normalizedRelative(target, dist);
      const targetDocument = documents.get(targetRel);
      if (!targetDocument?.getElementById(decodeURIComponent(url.hash.slice(1)))) {
        fail(`${rel}のアンカー先がありません: ${href}`);
      }
    }
  }
  const style = document.querySelector('link[rel="stylesheet"]');
  if (!style?.getAttribute("href")) fail(`${rel}に静的CSSリンクがありません`);
  const styleUrl = new URL(style.getAttribute("href"), base);
  if (styleUrl.origin !== base.origin || !existsSync(targetPathFromUrl(styleUrl, dist))) {
    fail(`${rel}の静的CSSリンクが不正です`);
  }
}

export function auditStaticPlaceLinks(root = ROOT, dist = join(root, "dist")) {
  const places = join(dist, "places");
  if (!existsSync(join(places, "index.html"))) fail("静的一覧トップがありません");
  const htmlFiles = walk(places).filter((path) => path.endsWith(".html"));
  if (htmlFiles.length !== 90) fail("静的HTML数が期待値と一致しません");
  const sourceData = JSON.parse(
    readFileSync(join(root, "src/kyoto-source-registry.json"), "utf8"),
  );
  const sourceRegistry = validateSources(sourceData);
  const allowedOrigins = new Set(["https://codh.rois.ac.jp"]);
  for (const source of sourceRegistry.values()) {
    allowedOrigins.add(new URL(source.url).origin);
  }
  const documents = new Map(
    htmlFiles.map((path) => {
      const dom = new JSDOM(readFileSync(path, "utf8"));
      return [normalizedRelative(path, dist), dom.window.document];
    }),
  );
  for (const path of htmlFiles) auditDocument(path, allowedOrigins, documents, dist);

  const manifestPath = join(places, "manifest.json");
  if (!existsSync(manifestPath)) fail("静的一覧manifestがありません");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest.schemaVersion !== 1 ||
    manifest.generatorVersion !== 1 ||
    manifest.edo?.placeCount !== 8788 ||
    manifest.edo?.pageCount !== 88 ||
    manifest.edo?.perPage !== 100 ||
    manifest.edo?.finalPageCount !== 88 ||
    manifest.kyoto?.placeCount !== 36 ||
    manifest.kyoto?.pageCount !== 1
  ) {
    fail("静的一覧manifestの件数が不正です");
  }
  if (JSON.stringify(manifest.inputGeoJsonSha256) !== JSON.stringify(EXPECTED_DATA_SHA256)) {
    fail("静的一覧manifestの入力SHAが不正です");
  }
  for (const [path, expected] of Object.entries(manifest.files ?? {})) {
    const target = join(places, path);
    if (!existsSync(target) || sha256(readFileSync(target)) !== expected) {
      fail(`静的一覧manifestのSHAが不一致です: ${path}`);
    }
  }
  const expectedManifestFiles = new Set(
    walk(places)
      .filter((path) => !path.endsWith("manifest.json"))
      .map((path) => relative(places, path).split(sep).join("/")),
  );
  if (
    expectedManifestFiles.size !== Object.keys(manifest.files).length ||
    [...expectedManifestFiles].some((path) => !Object.hasOwn(manifest.files, path))
  ) {
    fail("静的一覧manifestのファイル一覧が不完全です");
  }
  const edoCount = [...documents.values()].reduce(
    (count, document) => count + document.querySelectorAll('article[data-place-region="edo"]').length,
    0,
  );
  const kyotoCount = [...documents.values()].reduce(
    (count, document) => count + document.querySelectorAll('article[data-place-region="kyoto"]').length,
    0,
  );
  if (edoCount !== 8788 || kyotoCount !== 36) fail("生成地点数が入力件数と一致しません");
  const anchors = [...documents.values()].flatMap((document) =>
    [...document.querySelectorAll("article.place-card[id]")].map((article) => article.id),
  );
  if (new Set(anchors).size !== anchors.length) fail("地点アンカーが重複しています");
  const firstEdo = documents.get("places/edo/index.html");
  const finalEdo = documents.get("places/edo/page-88.html");
  if (
    firstEdo?.querySelector('a[rel="prev"]') ||
    !firstEdo?.querySelector('a[rel="next"]') ||
    !finalEdo?.querySelector('a[rel="prev"]') ||
    finalEdo?.querySelector('a[rel="next"]')
  ) {
    fail("EDO前後ページリンクが不正です");
  }
  const css = readFileSync(join(places, "static-places.css"), "utf8");
  if (/@import|url\s*\(/iu.test(css) || !css.includes(":focus-visible") || !css.includes("@media print")) {
    fail("静的一覧CSSが外部資産を参照するか必須スタイルがありません");
  }
  return Object.freeze({
    htmlFileCount: htmlFiles.length,
    edoCount,
    kyotoCount,
    manifestSha256: sha256(readFileSync(manifestPath)),
  });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const result = auditStaticPlaceLinks();
  console.log(`静的リンク監査: HTML ${result.htmlFileCount}、EDO ${result.edoCount}件、京都 ${result.kyotoCount}件、エラー0`);
  console.log(`manifest SHA-256: ${result.manifestSha256}`);
}
