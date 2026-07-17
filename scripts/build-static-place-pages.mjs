import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { validateSources } from "./build-kyoto-bakumatsu-places.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(ROOT, "dist", "places");
const PUBLIC_BASE = "https://jigsawrin.github.io/edo-history-map/places/";
export const STATIC_EDO_PER_PAGE = 100;
export const STATIC_GENERATOR_VERSION = 1;

export const EXPECTED_DATA_SHA256 = Object.freeze({
  "public/data/edo-places.geojson":
    "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4",
  "public/data/edo-machiya-areas.geojson":
    "516fead3b082499ab1fb9d3c50060fc88812531530e9f86f63bcffff81a70bd6",
  "public/data/edo-coastlines.geojson":
    "c67be67ed6213021a7333774300bc196a52195894130f7670ede45e9a2124a31",
  "public/data/kyoto-bakumatsu-places.geojson":
    "d141eb046d34c2c16b49286d3a70de49ea06f79e59561ae20537cd934e06f4d6",
});

const EDO_BOUNDS = Object.freeze({
  minLat: 35.4,
  maxLat: 35.95,
  minLon: 139.4,
  maxLon: 140.05,
});
const EDO_ALLOWED_ORIGIN = "https://codh.rois.ac.jp";
const EDO_ALLOWED_PATH_PREFIX = "/edo-maps/";
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/gu;
const KATAKANA = /[\u30a1-\u30f6]/gu;
const WHITESPACE = /\s+/gu;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  throw new Error(message);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function escapeHtml(value) {
  return String(value)
    .replace(CONTROL_CHARACTERS, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function validateExternalSourceUrl(value, allowedOrigins) {
  if (typeof value !== "string" || value.length > 500) {
    fail("外部出典URLが不正です");
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("外部出典URLが不正です");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    !allowedOrigins.has(parsed.origin)
  ) {
    fail("外部出典URLが許可リスト外です");
  }
  return parsed.href;
}

function normalizeSortText(value) {
  return value
    .slice(0, 100)
    .replace(CONTROL_CHARACTERS, "")
    .normalize("NFKC")
    .replace(KATAKANA, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    )
    .trim()
    .replace(WHITESPACE, " ")
    .toLowerCase();
}

function text(value, label, maxLength = 300) {
  if (typeof value !== "string" || value.length > maxLength) {
    fail(`${label}が不正です`);
  }
  return value.replace(CONTROL_CHARACTERS, "");
}

function exactKeys(value, allowed, label) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${label}がオブジェクトではありません`);
  }
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) {
    fail(`${label}のプロパティが不正です`);
  }
}

function pointCoordinates(feature, bounds, label) {
  exactKeys(feature, ["type", "geometry", "properties"], label);
  if (feature.type !== "Feature") fail(`${label}がFeatureではありません`);
  exactKeys(feature.geometry, ["type", "coordinates"], `${label}.geometry`);
  if (
    feature.geometry.type !== "Point" ||
    !Array.isArray(feature.geometry.coordinates) ||
    feature.geometry.coordinates.length !== 2
  ) {
    fail(`${label}がPointではありません`);
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < bounds.minLat ||
    latitude > bounds.maxLat ||
    longitude < bounds.minLon ||
    longitude > bounds.maxLon
  ) {
    fail(`${label}の座標が範囲外です`);
  }
  return { latitude, longitude };
}

function collectionFeatures(raw, expectedCount, label, extraKeys = []) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${label}がJSONではありません`);
  }
  exactKeys(parsed, ["type", ...extraKeys, "features"], label);
  if (
    parsed.type !== "FeatureCollection" ||
    !Array.isArray(parsed.features) ||
    parsed.features.length !== expectedCount
  ) {
    fail(`${label}の件数または形式が不正です`);
  }
  return parsed.features;
}

export function parseStaticEdoPlaces(raw) {
  const parsed = JSON.parse(raw);
  text(parsed.attribution, "EDO attribution", 300);
  text(parsed.license, "EDO license", 300);
  const features = collectionFeatures(
    raw,
    8788,
    "EDO GeoJSON",
    ["attribution", "license"],
  );
  const idCounts = new Map();
  for (const feature of features) {
    const id = feature?.properties?.id;
    if (typeof id !== "string") fail("EDO idが不正です");
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const places = features.map((feature, sourceIndex) => {
    pointCoordinates(feature, EDO_BOUNDS, `EDO地点${sourceIndex + 1}`);
    exactKeys(
      feature.properties,
      ["id", "name", "category", "sheet", "source"],
      `EDO地点${sourceIndex + 1}.properties`,
    );
    const entryId = text(feature.properties.id, "EDO id");
    const name = text(feature.properties.name, "EDO name");
    const category = text(feature.properties.category, "EDO category");
    const sheet = text(feature.properties.sheet, "EDO sheet");
    const sourceUrl = validateExternalSourceUrl(
      feature.properties.source,
      new Set([EDO_ALLOWED_ORIGIN]),
    );
    if (!new URL(sourceUrl).pathname.startsWith(EDO_ALLOWED_PATH_PREFIX)) {
      fail("EDO出典URLが許可パス外です");
    }
    const key = idCounts.get(entryId) === 1
      ? `edo:${entryId}`
      : `edo:${entryId}:${name}:${sheet}:${sourceIndex}`;
    return Object.freeze({
      key,
      anchor: `place-edo-${sha256(key).slice(0, 20)}`,
      entryId,
      name,
      category,
      sheet,
      sourceUrl,
      sourceIndex,
      normalizedName: normalizeSortText(name),
    });
  });
  places.sort(
    (left, right) =>
      (left.normalizedName < right.normalizedName ? -1 : left.normalizedName > right.normalizedName ? 1 : 0) ||
      (left.key < right.key ? -1 : left.key > right.key ? 1 : 0) ||
      left.sourceIndex - right.sourceIndex,
  );
  assertUniqueAnchors(places);
  return Object.freeze(places);
}

const KYOTO_BOUNDS = Object.freeze({
  minLat: 34.85,
  maxLat: 35.12,
  minLon: 135.65,
  maxLon: 135.85,
});
const KYOTO_PROPERTIES = Object.freeze([
  "id", "nameJa", "nameEn", "category", "eraId", "dateDisplayJa",
  "startYear", "endYear", "summaryJa", "locationBasis",
  "historicalSiteStatus", "coordinateConfidence", "locationNoteJa",
  "sourceIds", "sourceId",
]);

export function parseStaticKyotoPlaces(raw, sourceRegistry, presentation) {
  const features = collectionFeatures(raw, 36, "京都 GeoJSON");
  const places = features.map((feature, sourceIndex) => {
    pointCoordinates(feature, KYOTO_BOUNDS, `京都地点${sourceIndex + 1}`);
    const propertyKeys = Object.keys(feature.properties);
    if (
      propertyKeys.some((key) => !KYOTO_PROPERTIES.includes(key)) ||
      KYOTO_PROPERTIES.filter((key) => key !== "nameEn").some(
        (key) => !Object.hasOwn(feature.properties, key),
      )
    ) {
      fail("京都地点プロパティが不正です");
    }
    const place = feature.properties;
    const id = text(place.id, "京都 id", 64);
    if (!SAFE_ID.test(id)) fail("京都 idが不正です");
    const sourceIds = Array.isArray(place.sourceIds)
      ? place.sourceIds.map((sourceId) => text(sourceId, "京都 sourceId", 64))
      : fail("京都 sourceIdsが不正です");
    if (sourceIds.length === 0 || sourceIds.some((sourceId) => !sourceRegistry.has(sourceId))) {
      fail("京都 sourceIdが未登録です");
    }
    if (
      place.eraId !== "bakumatsu" ||
      place.sourceId !== "project-kyoto-bakumatsu-places" ||
      !Object.hasOwn(presentation.categoryLabels, place.category) ||
      !Object.hasOwn(presentation.locationBasisLabels, place.locationBasis) ||
      !Object.hasOwn(presentation.historicalSiteStatusLabels, place.historicalSiteStatus) ||
      !Object.hasOwn(presentation.coordinateConfidenceLabels, place.coordinateConfidence)
    ) {
      fail("京都地点の固定値が不正です");
    }
    return Object.freeze({
      id,
      anchor: `place-kyoto-${id}`,
      nameJa: text(place.nameJa, "京都 nameJa", 80),
      nameEn: place.nameEn === undefined ? "" : text(place.nameEn, "京都 nameEn", 100),
      category: place.category,
      dateDisplayJa: text(place.dateDisplayJa, "京都 dateDisplayJa", 80),
      summaryJa: text(place.summaryJa, "京都 summaryJa", 220),
      locationBasis: place.locationBasis,
      historicalSiteStatus: place.historicalSiteStatus,
      coordinateConfidence: place.coordinateConfidence,
      locationNoteJa: text(place.locationNoteJa, "京都 locationNoteJa", 220),
      sourceIds: Object.freeze(sourceIds),
      sourceIndex,
    });
  });
  places.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : left.sourceIndex - right.sourceIndex,
  );
  assertUniqueAnchors(places);
  return Object.freeze(places);
}

function assertUniqueAnchors(places) {
  const anchors = new Set();
  for (const place of places) {
    if (anchors.has(place.anchor)) fail("地点アンカーが重複しています");
    anchors.add(place.anchor);
  }
}

function externalLink(url, label) {
  return `<a class="external-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}（外部サイト）</a>`;
}

function pageDocument({ title, description, canonical, cssHref, body }) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${escapeHtml(description)}">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <link rel="stylesheet" href="${escapeHtml(cssHref)}">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <a class="skip-link" href="#main-content">本文へスキップ</a>
  ${body}
</body>
</html>
`;
}

function header(nav) {
  return `<header class="site-header">
  <p class="site-title"><a href="${escapeHtml(nav.topHref)}">歴史地点一覧</a></p>
  <nav class="global-nav" aria-label="地点一覧の主要ナビゲーション">
    <a href="${escapeHtml(nav.topHref)}">地点一覧トップ</a>
    ${nav.regionHref ? `<a href="${escapeHtml(nav.regionHref)}">地域一覧先頭</a>` : ""}
    <a href="${escapeHtml(nav.mapHref)}">地図版</a>
    <a href="${escapeHtml(nav.sourcesHref)}">出典・ライセンス</a>
    <a href="${escapeHtml(nav.privacyHref)}">プライバシー</a>
  </nav>
</header>`;
}

function footer() {
  return `<footer class="site-footer"><p>静的一覧は地図の空間関係を完全には表現しません。JavaScript、Cookie、フォーム送信、アクセス解析、外部画像、外部フォントは使用しません。</p></footer>`;
}

function topPage() {
  const body = `${header({
    topHref: "./",
    mapHref: "../",
    sourcesHref: "#sources",
    privacyHref: "#privacy",
  })}
<main id="main-content">
  <h1>歴史地点一覧</h1>
  <p class="lead">地図を直接操作しにくい場合でも、通常のHTMLページから地点情報と出典を確認できます。この一覧はJavaScriptなしで閲覧できます。</p>
  <p class="notice">この一覧は地点情報への代替導線です。地図上の距離、方向、重なりなどの空間関係を完全には表現しません。</p>
  <section aria-labelledby="regions-heading">
    <h2 id="regions-heading">地域を選ぶ</h2>
    <div class="region-grid">
      <article class="region-card"><h3><a href="./edo/">東京・江戸</a></h3><p>江戸地名 8,788件。100件単位、全88ページです。</p></article>
      <article class="region-card"><h3><a href="./kyoto/">京都・幕末</a></h3><p>幕末史跡 36件、全1ページです。</p></article>
    </div>
  </section>
  <section id="sources"><h2>出典・ライセンス</h2>
    <p class="source-note">東京・江戸はROIS-DS人文学オープンデータ共同利用センター（CODH）の「江戸マップ地名データセット」（CC BY 4.0、DOI: 10.20676/00000445）の改変版です。京都・幕末は複数の公的・学術資料を参照して本プロジェクトが独自編集し、説明文を独自に作成しています。京都の各地点には個別出典を掲載しています。</p>
    <p>${externalLink("https://codh.rois.ac.jp/edo-maps/", "江戸マップ地名データセットを確認")}</p>
  </section>
  <section id="privacy"><h2>プライバシー</h2>
    <p class="privacy-note">静的一覧は位置情報を取得せず、Cookie、localStorage、IndexedDB、Cache API、フォーム、広告、アクセス解析を使用しません。GitHub Pages配信時のアクセス記録や、外部出典リンクを開いた際の通信は各提供者の方針に従います。</p>
  </section>
</main>
${footer()}`;
  return pageDocument({
    title: "歴史地点一覧 | いま・むかし地図",
    description: "東京・江戸と京都・幕末の歴史地点をJavaScriptなしで確認できる静的HTML一覧です。",
    canonical: PUBLIC_BASE,
    cssHref: "./static-places.css",
    body,
  });
}

function pageFileName(page) {
  return page === 1 ? "index.html" : `page-${page}.html`;
}

function edoArticle(place) {
  return `<li><article id="${place.anchor}" class="place-card" data-place-region="edo">
  <h3>${escapeHtml(place.name)}</h3>
  <dl>
    <dt>分類</dt><dd>${escapeHtml(place.category || "未分類")}</dd>
    <dt>収載切絵図</dt><dd>${escapeHtml(place.sheet || "記載なし")}</dd>
    <dt>対象年代</dt><dd>江戸後期（嘉永～文久、1849～1862年頃）</dd>
    <dt>位置</dt><dd>ジオリファレンスによる推定位置</dd>
  </dl>
  <p>位置は現代地図への推定合わせで、数十メートル以上の誤差を含み得ます。測量・境界・権利関係の証拠には使用できません。</p>
  <p class="place-links">${externalLink(place.sourceUrl, "CODHの地名詳細ページを開く")}<a href="../../?region=edo&amp;era=edo-late">地図で東京・江戸を開く</a><a href="#${place.anchor}">この地点へのリンク</a></p>
</article></li>`;
}

function pagination(page, pageCount) {
  const previous = page > 1
    ? `<a rel="prev" href="./${pageFileName(page - 1)}">前へ</a>`
    : "";
  const next = page < pageCount
    ? `<a rel="next" href="./${pageFileName(page + 1)}">次へ</a>`
    : "";
  return `<nav class="page-nav" aria-label="EDO地点一覧のページ移動">${previous}<span class="page-status" aria-current="page">${page} / ${pageCount}ページ</span>${next}</nav>`;
}

function edoRangeIndex(pages) {
  const items = pages.map((items, index) => {
    const page = index + 1;
    const href = `./${pageFileName(page)}`;
    return `<li><a href="${href}">${page}ページ：${escapeHtml(items[0].name)} ～ ${escapeHtml(items.at(-1).name)}</a></li>`;
  }).join("\n");
  return `<section aria-labelledby="page-ranges-heading"><h2 id="page-ranges-heading">ページごとの地点名範囲</h2><p>読み仮名を推測せず、現在の決定的な検索順で各ページの最初と最後の地点名を示しています。</p><ol class="page-range-list">${items}</ol></section>`;
}

function edoPage(items, page, pages) {
  const pageCount = pages.length;
  const body = `${header({
    topHref: "../",
    regionHref: "./",
    mapHref: "../../?region=edo&era=edo-late",
    sourcesHref: "../#sources",
    privacyHref: "../#privacy",
  })}
<main id="main-content">
  <h1>東京・江戸の歴史地点一覧</h1>
  <section aria-labelledby="about-heading"><h2 id="about-heading">この一覧について</h2><p>江戸地名8,788件を100件ずつ88ページに分けています。1ページの大きさとページ数のバランスを取り、低性能端末と印刷でも扱いやすくするため100件を採用しました。地点名を探す場合はブラウザのページ内検索を利用できます。</p></section>
  ${page === 1 ? edoRangeIndex(pages) : ""}
  <section aria-labelledby="places-heading"><h2 id="places-heading">地点一覧</h2>${pagination(page, pageCount)}<ol class="place-list">${items.map(edoArticle).join("\n")}</ol>${pagination(page, pageCount)}</section>
  <section aria-labelledby="caution-heading"><h2 id="caution-heading">注意事項</h2><p class="notice">江戸地名の位置は江戸切絵図を現代地図へ合わせた推定です。現代住所、読み仮名、英語名、長文解説、史跡状態、座標確度は元データにないため追加していません。</p></section>
</main>
${footer()}`;
  return pageDocument({
    title: `東京・江戸の歴史地点一覧 ${page}/${pageCount} | いま・むかし地図`,
    description: `江戸後期の地名8,788件を確認できる静的HTML一覧の${page}/${pageCount}ページです。`,
    canonical: `${PUBLIC_BASE}edo/${page === 1 ? "" : pageFileName(page)}`,
    cssHref: "../static-places.css",
    body,
  });
}

function kyotoArticle(place, sourceRegistry, presentation) {
  const sourceLinks = place.sourceIds.map((sourceId) => {
    const source = sourceRegistry.get(sourceId);
    return `<li>${externalLink(source.url, `${source.publisher}「${source.title}」`)}</li>`;
  }).join("");
  const mediumWarning = place.coordinateConfidence === "medium"
    ? `<p class="notice">${escapeHtml(presentation.mediumConfidenceWarning)}</p>`
    : "";
  return `<li><article id="${place.anchor}" class="place-card" data-place-region="kyoto">
  <h3>${escapeHtml(place.nameJa)}</h3>
  ${place.nameEn ? `<p lang="en">${escapeHtml(place.nameEn)}</p>` : ""}
  <dl>
    <dt>分類</dt><dd>${escapeHtml(presentation.categoryLabels[place.category])}</dd>
    <dt>時期</dt><dd>${escapeHtml(place.dateDisplayJa)}</dd>
    <dt>現在地と歴史位置</dt><dd>${escapeHtml(presentation.locationBasisLabels[place.locationBasis])}</dd>
    <dt>史跡の状態</dt><dd>${escapeHtml(presentation.historicalSiteStatusLabels[place.historicalSiteStatus])}</dd>
    <dt>位置精度</dt><dd>${escapeHtml(presentation.coordinateConfidenceLabels[place.coordinateConfidence])}</dd>
  </dl>
  <p>${escapeHtml(place.summaryJa)}</p>
  <p>位置について：${escapeHtml(place.locationNoteJa)}</p>
  ${mediumWarning}
  <h4>出典</h4><ul>${sourceLinks}</ul>
  <p class="place-links"><a href="../../?region=kyoto&amp;era=bakumatsu">地図で京都・幕末を開く</a><a href="#${place.anchor}">この地点へのリンク</a></p>
</article></li>`;
}

function kyotoPage(places, sourceRegistry, presentation) {
  const body = `${header({
    topHref: "../",
    regionHref: "./",
    mapHref: "../../?region=kyoto&era=bakumatsu",
    sourcesHref: "../#sources",
    privacyHref: "../#privacy",
  })}
<main id="main-content">
  <h1>京都・幕末の史跡一覧</h1>
  <section aria-labelledby="about-heading"><h2 id="about-heading">この一覧について</h2><p>根拠確認済みの幕末史跡36件を掲載します。説明文は公的・学術資料を照合して本プロジェクトが独自に作成したものです。</p></section>
  <section aria-labelledby="places-heading"><h2 id="places-heading">地点一覧</h2><nav class="page-nav" aria-label="京都地点一覧のページ"><span class="page-status" aria-current="page">1 / 1ページ</span></nav><ol class="place-list">${places.map((place) => kyotoArticle(place, sourceRegistry, presentation)).join("\n")}</ol></section>
  <section aria-labelledby="caution-heading"><h2 id="caution-heading">注意事項</h2><p class="notice">現在の碑、再建建物、顕彰地が幕末当時の建物・事件現場と一致しない場合があります。位置精度、史跡状態、各地点の位置注意を合わせて確認してください。</p></section>
</main>
${footer()}`;
  return pageDocument({
    title: "京都・幕末の史跡一覧 | いま・むかし地図",
    description: "京都・幕末の史跡36件について、説明、位置注意、史跡状態、個別出典を確認できる静的HTML一覧です。",
    canonical: `${PUBLIC_BASE}kyoto/`,
    cssHref: "../static-places.css",
    body,
  });
}

function validatePresentation(value) {
  exactKeys(value, [
    "categoryLabels",
    "locationBasisLabels",
    "historicalSiteStatusLabels",
    "coordinateConfidenceLabels",
    "mediumConfidenceWarning",
  ], "京都表示メタデータ");
  for (const key of [
    "categoryLabels",
    "locationBasisLabels",
    "historicalSiteStatusLabels",
    "coordinateConfidenceLabels",
  ]) {
    if (typeof value[key] !== "object" || value[key] === null) {
      fail("京都表示ラベルが不正です");
    }
    for (const label of Object.values(value[key])) text(label, "京都表示ラベル", 220);
  }
  text(value.mediumConfidenceWarning, "位置精度注意", 300);
  return value;
}

export function generateStaticPlaceFiles({ edoRaw, kyotoRaw, sourceData, presentation, css, inputSha256 }) {
  const sourceRegistry = validateSources(sourceData);
  for (const source of sourceRegistry.values()) {
    validateExternalSourceUrl(source.url, new Set([new URL(source.url).origin]));
  }
  const checkedPresentation = validatePresentation(presentation);
  const edoPlaces = parseStaticEdoPlaces(edoRaw);
  const kyotoPlaces = parseStaticKyotoPlaces(kyotoRaw, sourceRegistry, checkedPresentation);
  const edoPages = Array.from(
    { length: Math.ceil(edoPlaces.length / STATIC_EDO_PER_PAGE) },
    (_, index) => edoPlaces.slice(
      index * STATIC_EDO_PER_PAGE,
      (index + 1) * STATIC_EDO_PER_PAGE,
    ),
  );
  const files = new Map();
  files.set("index.html", topPage());
  edoPages.forEach((items, index) => {
    const page = index + 1;
    files.set(`edo/${pageFileName(page)}`, edoPage(items, page, edoPages));
  });
  files.set("kyoto/index.html", kyotoPage(kyotoPlaces, sourceRegistry, checkedPresentation));
  files.set("static-places.css", css.endsWith("\n") ? css : `${css}\n`);

  const manifest = {
    schemaVersion: 1,
    generatorVersion: STATIC_GENERATOR_VERSION,
    inputGeoJsonSha256: inputSha256,
    edo: {
      placeCount: edoPlaces.length,
      pageCount: edoPages.length,
      perPage: STATIC_EDO_PER_PAGE,
      finalPageCount: edoPages.at(-1).length,
    },
    kyoto: { placeCount: kyotoPlaces.length, pageCount: 1 },
    files: Object.fromEntries(
      [...files].map(([path, content]) => [path, sha256(content)]),
    ),
  };
  files.set("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze({ files, manifest, edoPlaces, kyotoPlaces });
}

function readUtf8(path) {
  const value = readFileSync(path, "utf8");
  if (value.includes("\uFFFD")) fail(`${relative(ROOT, path)}がUTF-8ではありません`);
  return value;
}

export function buildStaticPlacePages(root = ROOT, outputRoot = OUTPUT_ROOT) {
  const inputSha256 = {};
  for (const [path, expected] of Object.entries(EXPECTED_DATA_SHA256)) {
    const actual = sha256(readFileSync(join(root, path)));
    if (actual !== expected) fail(`${path}のSHA-256が期待値と一致しません`);
    inputSha256[path] = actual;
  }
  const generated = generateStaticPlaceFiles({
    edoRaw: readUtf8(join(root, "public/data/edo-places.geojson")),
    kyotoRaw: readUtf8(join(root, "public/data/kyoto-bakumatsu-places.geojson")),
    sourceData: JSON.parse(readUtf8(join(root, "src/kyoto-source-registry.json"))),
    presentation: JSON.parse(readUtf8(join(root, "src/kyoto-place-presentation.json"))),
    css: readUtf8(join(root, "src/static-places.css")),
    inputSha256,
  });
  rmSync(outputRoot, { recursive: true, force: true });
  for (const [path, content] of generated.files) {
    const output = join(outputRoot, path);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, content, "utf8");
  }
  return generated;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const generated = buildStaticPlacePages();
  const htmlFiles = [...generated.files.keys()].filter((path) => path.endsWith(".html"));
  console.log(`静的地点一覧: EDO ${generated.manifest.edo.placeCount}件/${generated.manifest.edo.pageCount}ページ、京都 ${generated.manifest.kyoto.placeCount}件/${generated.manifest.kyoto.pageCount}ページ`);
  console.log(`生成HTML: ${htmlFiles.length}ファイル`);
  console.log(`manifest SHA-256: ${sha256(generated.files.get("manifest.json"))}`);
}
