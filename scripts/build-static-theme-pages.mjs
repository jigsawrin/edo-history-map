import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEME_OUTPUT_ROOT = join(ROOT, "dist", "themes");
const PLACES_OUTPUT_ROOT = join(ROOT, "dist", "places");
const PUBLIC_BASE = "https://jigsawrin.github.io/edo-history-map/";
export const THEME_SCHEMA_VERSION = 1;
export const THEME_TYPES = Object.freeze(["person", "event", "group", "concept"]);
export const RELATION_TYPES = Object.freeze(["residence", "battle", "politics", "castle", "temple-shrine", "memorial", "incident", "activity", "associated"]);
const DATASET_IDS = Object.freeze(["project-kyoto-bakumatsu-places", "project-shiga-sengoku-places"]);
const TYPE_META = Object.freeze({
  person: { label: "人物", directory: "people" },
  event: { label: "事件・戦い", directory: "events" },
  group: { label: "勢力・組織", directory: "groups" },
  concept: { label: "歴史テーマ", directory: "concepts" },
});
const RELATION_LABELS = Object.freeze({ residence: "居所・滞在", battle: "戦闘・軍事", politics: "政治", castle: "城郭・拠点", "temple-shrine": "寺社", memorial: "墓所・顕彰", incident: "事件", activity: "活動", associated: "関連" });
const DATASET_META = Object.freeze({
  "project-kyoto-bakumatsu-places": { label: "京都・幕末", region: "kyoto", era: "bakumatsu", anchorPrefix: "place-kyoto-" },
  "project-shiga-sengoku-places": { label: "滋賀・戦国", region: "shiga", era: "sengoku", anchorPrefix: "place-shiga-" },
});
const THEME_ID = /^(person|event|group|concept)-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f]|<[^>]*>|\[[^\]]*\]\([^)]*\)/u;
const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const ALLOWED_SOURCE_ORIGINS = new Set([
  "https://bunka.nii.ac.jp",
  "https://geoshape.ex.nii.ac.jp",
  "https://ja.kyoto.travel",
  "https://kurodani.jp",
  "https://msearch.gsi.go.jp",
  "https://myomanji.jp",
  "https://shimogyo.city.kyoto.lg.jp",
  "https://www.city.nagahama.lg.jp",
  "https://www.doshisha.ac.jp",
  "https://www.pref.kyoto.jp",
  "https://www.pref.shiga.lg.jp",
  "https://www2.city.kyoto.lg.jp",
]);

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function fail(message) { throw new Error(message); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
// eslint-disable-next-line no-control-regex
export function escapeHtml(value) { return String(value).replace(/[\u0000-\u001f\u007f]/gu, "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) fail(`${label}が通常のオブジェクトではありません`);
  if (Object.keys(value).some((key) => DANGEROUS_KEYS.has(key))) fail(`${label}に危険なキーがあります`);
  return value;
}
function text(value, label, max) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > max || FORBIDDEN_TEXT.test(value)) fail(`${label}が不正です`);
  return value;
}
function list(value, label) {
  if (!Array.isArray(value)) fail(`${label}が配列ではありません`);
  const result = value.map((item, index) => text(item, `${label}[${index}]`, 120));
  if (new Set(result).size !== result.length) fail(`${label}に重複があります`);
  return result;
}

export function validateHistoricalThemeData(themeData, context) {
  if (!Array.isArray(themeData) || themeData.length < 15 || themeData.length > 25) fail("テーマ数が15から25件ではありません");
  const places = new Map();
  for (const place of context.kyotoPlaces) places.set(`project-kyoto-bakumatsu-places:${place.id}`, place);
  for (const place of context.shigaPlaces) places.set(`project-shiga-sengoku-places:${place.id}`, place);
  const sources = new Map([...context.kyotoSources, ...context.shigaSources].map((source) => [source.id, source]));
  const ids = new Set();
  const themes = themeData.map((raw, index) => {
    const item = object(raw, `themes[${index}]`);
    const id = text(item.id, `themes[${index}].id`, 80);
    if (!THEME_ID.test(id) || ids.has(id)) fail("テーマIDが不正または重複しています");
    ids.add(id);
    const type = text(item.type, `${id}.type`, 20);
    if (!THEME_TYPES.includes(type) || !id.startsWith(`${type}-`)) fail(`${id}のtypeが不正です`);
    const aliasesJa = list(item.aliasesJa ?? [], `${id}.aliasesJa`);
    const titleJa = text(item.titleJa, `${id}.titleJa`, 80);
    if (aliasesJa.includes(titleJa)) fail(`${id}の別名がタイトルと重複しています`);
    if (!Array.isArray(item.relatedPlaces) || item.relatedPlaces.length < 2) fail(`${id}の関連地点が2件未満です`);
    const relatedPlaces = item.relatedPlaces.map((rawReference, referenceIndex) => {
      const reference = object(rawReference, `${id}.relatedPlaces[${referenceIndex}]`);
      const datasetId = text(reference.datasetId, `${id}.datasetId`, 80);
      const placeId = text(reference.placeId, `${id}.placeId`, 80);
      const relationType = text(reference.relationType, `${id}.relationType`, 40);
      if (!DATASET_IDS.includes(datasetId) || !SAFE_ID.test(placeId) || !RELATION_TYPES.includes(relationType)) fail(`${id}の地点参照が不正です`);
      const place = places.get(`${datasetId}:${placeId}`);
      if (!place) fail(`${id}が存在しない地点を参照しています`);
      const sourceIds = list(reference.sourceIds, `${id}.sourceIds`);
      if (sourceIds.length === 0 || sourceIds.some((sourceId) => !sources.has(sourceId) || !place.sourceIds.includes(sourceId))) fail(`${id}の出典が地点出典と一致しません`);
      return Object.freeze({ datasetId, placeId, relationType, relationSummaryJa: text(reference.relationSummaryJa, `${id}.relationSummaryJa`, 140), sourceIds: Object.freeze(sourceIds) });
    });
    const keys = relatedPlaces.map((reference) => `${reference.datasetId}:${reference.placeId}`);
    if (new Set(keys).size !== keys.length) fail(`${id}に重複地点があります`);
    relatedPlaces.sort((left, right) => compare(left.datasetId, right.datasetId) || compare(left.placeId, right.placeId));
    return Object.freeze({ id, type, titleJa, ...(item.titleEn === undefined ? {} : { titleEn: text(item.titleEn, `${id}.titleEn`, 100) }), aliasesJa: Object.freeze(aliasesJa), periodDisplayJa: text(item.periodDisplayJa, `${id}.periodDisplayJa`, 80), summaryJa: text(item.summaryJa, `${id}.summaryJa`, 180), relatedPlaces: Object.freeze(relatedPlaces) });
  });
  themes.sort((left, right) => compare(left.id, right.id));
  if (themes.filter((theme) => new Set(theme.relatedPlaces.map((reference) => reference.datasetId)).size > 1).length < 5) fail("地域横断テーマが5件未満です");
  return Object.freeze(themes);
}

function themeSlug(theme) { return theme.id.slice(`${theme.type}-`.length); }
function themePath(theme) { return `${TYPE_META[theme.type].directory}/${themeSlug(theme)}/index.html`; }
function externalSource(source) {
  let parsed;
  try { parsed = new URL(source.url); } catch { fail("出典URLが不正です"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || !ALLOWED_SOURCE_ORIGINS.has(parsed.origin)) fail("出典URLが安全ではありません");
  const provider = source.publisher ?? source.providerJa;
  const title = source.title ?? source.titleJa;
  return `<a class="external-link" href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(provider)}「${escapeHtml(title)}」（外部サイト）</a>`;
}
function documentPage({ title, description, canonical, cssHref, body }) {
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<meta name="description" content="${escapeHtml(description)}">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-src 'none'">\n<link rel="canonical" href="${escapeHtml(canonical)}">\n<link rel="stylesheet" href="${escapeHtml(cssHref)}">\n<title>${escapeHtml(title)}</title>\n</head>\n<body>\n<a class="skip-link" href="#main-content">本文へスキップ</a>\n${body}\n</body>\n</html>\n`;
}
function header(depth, current = "") {
  const root = depth === 0 ? "./" : "../".repeat(depth);
  return `<header class="site-header"><p class="site-title"><a href="${root}">歴史テーマ索引</a></p><nav class="global-nav" aria-label="歴史テーマ索引の主要ナビゲーション"><a href="${root}"${current === "top" ? ' aria-current="page"' : ""}>テーマトップ</a><a href="${root}people/"${current === "person" ? ' aria-current="page"' : ""}>人物</a><a href="${root}events/"${current === "event" ? ' aria-current="page"' : ""}>事件・戦い</a><a href="${root}groups/"${current === "group" ? ' aria-current="page"' : ""}>勢力・組織</a><a href="${root}concepts/"${current === "concept" ? ' aria-current="page"' : ""}>歴史テーマ</a><a href="${root}../places/">地点一覧</a><a href="${root}../">地図版</a></nav></header>`;
}
function footer() { return `<footer class="site-footer"><p>この索引は確認済み地点との関係を示すもので、完全な人物・事件データベースや因果関係図ではありません。JavaScript、フォーム、Cookie、storage、外部画像、外部フォントを使用しません。</p></footer>`; }
function themeCard(theme, href, headingTag = "h3") {
  const regions = [...new Set(theme.relatedPlaces.map((reference) => DATASET_META[reference.datasetId].label))].join("・");
  return `<article class="theme-card"><${headingTag}><a href="${escapeHtml(href)}">${escapeHtml(theme.titleJa)}</a></${headingTag}><p><span class="theme-type">${escapeHtml(TYPE_META[theme.type].label)}</span>／${escapeHtml(theme.periodDisplayJa)}</p><p>${escapeHtml(theme.summaryJa)}</p><p>${theme.relatedPlaces.length}地点／${escapeHtml(regions)}</p></article>`;
}
function topPage(themes, metrics) {
  const sections = THEME_TYPES.map((type) => { const items = themes.filter((theme) => theme.type === type); return `<section><h2>${TYPE_META[type].label}</h2><p>${items.length}テーマ</p><div class="theme-grid">${items.map((theme) => themeCard(theme, `./${TYPE_META[type].directory}/${themeSlug(theme)}/`)).join("\n")}</div></section>`; }).join("\n");
  const body = `${header(0, "top")}<main id="main-content"><h1>歴史テーマ索引</h1><p class="lead">人物、事件、勢力、歴史テーマから、根拠確認済みの京都・幕末と滋賀・戦国の地点へ進めます。</p><p class="notice">東京・江戸の地名データは人物・事件との関係を示す構造化情報を持たないため、現在のテーマ索引では主に京都・幕末と滋賀・戦国のキュレーション地点を対象としています。</p><dl><dt>テーマ数</dt><dd>${metrics.themeCount}</dd><dt>関係数</dt><dd>${metrics.relationCount}</dd><dt>地域横断テーマ</dt><dd>${metrics.crossRegionThemeCount}</dd></dl>${sections}<section id="sources"><h2>出典・ライセンス</h2><p>関係は各地点の固定出典と説明で確認し、詳細な根拠は個別テーマページと地点ページに掲載しています。長文転載、画像、PDFの同梱、自動推定は行っていません。</p></section><section id="privacy"><h2>プライバシー</h2><p>静的索引は位置情報、Cookie、localStorage、sessionStorage、フォーム、アクセス解析を使用しません。</p></section></main>${footer()}`;
  return documentPage({ title: "歴史テーマ索引 | いま・むかし地図", description: "京都・幕末と滋賀・戦国の地点を人物、事件、勢力、歴史テーマから探せるJavaScript不要の静的索引です。", canonical: `${PUBLIC_BASE}themes/`, cssHref: "./static-themes.css", body });
}
function typePage(type, themes) {
  const meta = TYPE_META[type];
  const body = `${header(1, type)}<main id="main-content"><h1>${meta.label}</h1><p>${themes.length}テーマを掲載しています。</p><div class="theme-grid">${themes.map((theme) => themeCard(theme, `./${themeSlug(theme)}/`, "h2")).join("\n")}</div></main>${footer()}`;
  return documentPage({ title: `${meta.label}の歴史テーマ | いま・むかし地図`, description: `${meta.label}から京都・幕末と滋賀・戦国の関連地点を探せる静的索引です。`, canonical: `${PUBLIC_BASE}themes/${meta.directory}/`, cssHref: "../static-themes.css", body });
}
function themePage(theme, themes, placeMaps, sourceMap) {
  const sameType = themes.filter((candidate) => candidate.type === theme.type);
  const index = sameType.findIndex((candidate) => candidate.id === theme.id);
  const navigation = [index > 0 ? `<a rel="prev" href="../${themeSlug(sameType[index - 1])}/">前のテーマ：${escapeHtml(sameType[index - 1].titleJa)}</a>` : "", index < sameType.length - 1 ? `<a rel="next" href="../${themeSlug(sameType[index + 1])}/">次のテーマ：${escapeHtml(sameType[index + 1].titleJa)}</a>` : ""].filter(Boolean).join("");
  const groups = DATASET_IDS.map((datasetId) => [datasetId, theme.relatedPlaces.filter((reference) => reference.datasetId === datasetId)]).filter(([, references]) => references.length > 0);
  const sections = groups.map(([datasetId, references]) => {
    const meta = DATASET_META[datasetId];
    const items = references.map((reference) => {
      const place = placeMaps.get(`${datasetId}:${reference.placeId}`);
      const sources = reference.sourceIds.map((sourceId) => `<li>${externalSource(sourceMap.get(sourceId))}</li>`).join("");
      const category = place.categoryLabel;
      return `<li><article class="relation-card"><h3>${escapeHtml(place.nameJa)}</h3><dl><dt>関係</dt><dd>${escapeHtml(RELATION_LABELS[reference.relationType])}</dd><dt>地域・時期</dt><dd>${escapeHtml(meta.label)}／${escapeHtml(place.dateDisplayJa)}</dd><dt>分類</dt><dd>${escapeHtml(category)}</dd><dt>位置精度</dt><dd>${escapeHtml(place.coordinateConfidenceLabel)}</dd></dl><p>${escapeHtml(reference.relationSummaryJa)}</p><p class="notice">位置について：${escapeHtml(place.locationNoteJa)}</p><p><a href="../../../places/${meta.region}/#${meta.anchorPrefix}${escapeHtml(place.id)}">地点詳細へ</a> <a href="../../../?region=${meta.region}&amp;era=${meta.era}">地図で${escapeHtml(meta.label)}を開く</a></p><h4>関係の根拠</h4><ul>${sources}</ul></article></li>`;
    }).join("\n");
    return `<section><h2>${escapeHtml(meta.label)}</h2><ol class="relation-list">${items}</ol></section>`;
  }).join("\n");
  const body = `${header(2, theme.type)}<main id="main-content"><p><a href="../">${escapeHtml(TYPE_META[theme.type].label)}一覧へ戻る</a></p><h1>${escapeHtml(theme.titleJa)}</h1>${theme.titleEn ? `<p lang="en">${escapeHtml(theme.titleEn)}</p>` : ""}<dl><dt>種別</dt><dd>${escapeHtml(TYPE_META[theme.type].label)}</dd><dt>時期</dt><dd>${escapeHtml(theme.periodDisplayJa)}</dd><dt>関連地点</dt><dd>${theme.relatedPlaces.length}件</dd></dl><p class="lead">${escapeHtml(theme.summaryJa)}</p><p class="notice">墓所、碑、再建建物、代表地点は、本人の当時の居所や事件範囲そのものとは限りません。各地点の位置注意を確認してください。</p>${sections}<nav class="theme-nav" aria-label="前後のテーマ">${navigation}</nav><p><a href="../../">歴史テーマ索引へ戻る</a></p></main>${footer()}`;
  return documentPage({ title: `${theme.titleJa} | 歴史テーマ索引`, description: `${theme.titleJa}と京都・幕末、滋賀・戦国の関連地点${theme.relatedPlaces.length}件を確認できる静的ページです。`, canonical: `${PUBLIC_BASE}themes/${TYPE_META[theme.type].directory}/${themeSlug(theme)}/`, cssHref: "../../static-themes.css", body });
}

function insertBacklinks(html, datasetId, themes) {
  const meta = DATASET_META[datasetId];
  let output = html.replace(/<section class="related-themes"[\s\S]*?<\/section>/gu, "");
  const themePriority = { person: 0, event: 1, group: 2, concept: 3 };
  const placeIds = [...new Set(themes.flatMap((theme) => theme.relatedPlaces.filter((reference) => reference.datasetId === datasetId).map((reference) => reference.placeId)))];
  for (const placeId of placeIds) {
    const related = themes.filter((theme) => theme.relatedPlaces.some((reference) => reference.datasetId === datasetId && reference.placeId === placeId)).sort((left, right) => themePriority[left.type] - themePriority[right.type] || compare(left.titleJa, right.titleJa)).slice(0, 5);
    const marker = `<article id="${meta.anchorPrefix}${placeId}"`;
    const start = output.indexOf(marker);
    if (start < 0) fail(`逆リンク対象アンカーがありません: ${placeId}`);
    const end = output.indexOf("</article>", start);
    const links = `<section class="related-themes" aria-labelledby="related-themes-${placeId}"><h4 id="related-themes-${placeId}">関連する歴史テーマ</h4><ul>${related.map((theme) => `<li><a href="../../themes/${TYPE_META[theme.type].directory}/${themeSlug(theme)}/">${escapeHtml(theme.titleJa)}</a></li>`).join("")}</ul></section>`;
    output = `${output.slice(0, end)}${links}${output.slice(end)}`;
  }
  return output;
}

function aggregateSha(files) { return sha256([...files].sort(([a], [b]) => compare(a, b)).map(([path, content]) => `${path}\0${sha256(content)}\n`).join("")); }

export function generateStaticThemeFiles({ themeData, kyotoPlaces, shigaPlaces, kyotoSources, shigaSources, kyotoPresentation, shigaPresentation, css, placeManifest, kyotoPlaceHtml, shigaPlaceHtml, themeInputSha256 }) {
  const themes = validateHistoricalThemeData(themeData, { kyotoPlaces, shigaPlaces, kyotoSources, shigaSources });
  const placeMaps = new Map();
  for (const place of kyotoPlaces) placeMaps.set(`project-kyoto-bakumatsu-places:${place.id}`, { ...place, categoryLabel: kyotoPresentation.categoryLabels[place.category], coordinateConfidenceLabel: kyotoPresentation.coordinateConfidenceLabels[place.coordinateConfidence] });
  for (const place of shigaPlaces) placeMaps.set(`project-shiga-sengoku-places:${place.id}`, { ...place, categoryLabel: shigaPresentation.categoryLabels[place.category], coordinateConfidenceLabel: shigaPresentation.coordinateConfidenceLabels[place.coordinateConfidence] });
  const sourceMap = new Map([...kyotoSources, ...shigaSources].map((source) => [source.id, source]));
  const typeCounts = Object.fromEntries(THEME_TYPES.map((type) => [type, themes.filter((theme) => theme.type === type).length]));
  const relations = themes.flatMap((theme) => theme.relatedPlaces);
  const metrics = { themeCount: themes.length, typeCounts, crossRegionThemeCount: themes.filter((theme) => new Set(theme.relatedPlaces.map((reference) => reference.datasetId)).size > 1).length, relationCount: relations.length, kyotoRelationCount: relations.filter((reference) => reference.datasetId === "project-kyoto-bakumatsu-places").length, shigaRelationCount: relations.filter((reference) => reference.datasetId === "project-shiga-sengoku-places").length };
  const files = new Map();
  files.set("index.html", topPage(themes, metrics));
  for (const type of THEME_TYPES) files.set(`${TYPE_META[type].directory}/index.html`, typePage(type, themes.filter((theme) => theme.type === type)));
  for (const theme of themes) files.set(themePath(theme), themePage(theme, themes, placeMaps, sourceMap));
  files.set("static-themes.css", css.endsWith("\n") ? css : `${css}\n`);
  const updatedKyotoHtml = insertBacklinks(kyotoPlaceHtml, "project-kyoto-bakumatsu-places", themes);
  const updatedShigaHtml = insertBacklinks(shigaPlaceHtml, "project-shiga-sengoku-places", themes);
  const manifest = JSON.parse(JSON.stringify(placeManifest));
  manifest.schemaVersion = 2;
  manifest.files["kyoto/index.html"] = sha256(updatedKyotoHtml);
  manifest.files["shiga/index.html"] = sha256(updatedShigaHtml);
  const htmlFiles = [...files].filter(([path]) => path.endsWith(".html"));
  manifest.themes = { schemaVersion: THEME_SCHEMA_VERSION, ...metrics, htmlPageCount: htmlFiles.length, inputCurationSha256: themeInputSha256, htmlSha256: aggregateSha(htmlFiles), existingPlacePagesSha256: aggregateSha([["kyoto/index.html", updatedKyotoHtml], ["shiga/index.html", updatedShigaHtml]]), cssSha256: sha256(files.get("static-themes.css")), files: Object.fromEntries([...files].map(([path, content]) => [path, sha256(content)])) };
  return Object.freeze({ themes, files, manifest, updatedKyotoHtml, updatedShigaHtml });
}

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
export function buildStaticThemePages(root = ROOT) {
  const themePathInput = join(root, "data-curation/historical-themes.json");
  const themeInput = readFileSync(themePathInput, "utf8");
  const generated = generateStaticThemeFiles({
    themeData: JSON.parse(themeInput),
    kyotoPlaces: readJson(join(root, "data-curation/kyoto-bakumatsu-places.json")),
    shigaPlaces: readJson(join(root, "data-curation/shiga-sengoku-places.json")),
    kyotoSources: readJson(join(root, "src/kyoto-source-registry.json")),
    shigaSources: readJson(join(root, "src/shiga-source-registry.json")),
    kyotoPresentation: readJson(join(root, "src/kyoto-place-presentation.json")),
    shigaPresentation: readJson(join(root, "src/shiga-place-presentation.json")),
    css: readFileSync(join(root, "src/static-themes.css"), "utf8"),
    placeManifest: readJson(join(PLACES_OUTPUT_ROOT, "manifest.json")),
    kyotoPlaceHtml: readFileSync(join(PLACES_OUTPUT_ROOT, "kyoto/index.html"), "utf8"),
    shigaPlaceHtml: readFileSync(join(PLACES_OUTPUT_ROOT, "shiga/index.html"), "utf8"),
    themeInputSha256: sha256(themeInput),
  });
  rmSync(THEME_OUTPUT_ROOT, { recursive: true, force: true });
  for (const [path, content] of generated.files) { const output = join(THEME_OUTPUT_ROOT, path); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, content, "utf8"); }
  writeFileSync(join(PLACES_OUTPUT_ROOT, "kyoto/index.html"), generated.updatedKyotoHtml, "utf8");
  writeFileSync(join(PLACES_OUTPUT_ROOT, "shiga/index.html"), generated.updatedShigaHtml, "utf8");
  writeFileSync(join(PLACES_OUTPUT_ROOT, "manifest.json"), `${JSON.stringify(generated.manifest, null, 2)}\n`, "utf8");
  return generated;
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (direct) {
  const generated = buildStaticThemePages();
  console.log(`静的テーマ索引: ${generated.manifest.themes.themeCount}テーマ、${generated.manifest.themes.relationCount}関係、HTML ${generated.manifest.themes.htmlPageCount}ページ`);
  console.log(`地域横断テーマ: ${generated.manifest.themes.crossRegionThemeCount}`);
  console.log(`テーマHTML SHA-256: ${generated.manifest.themes.htmlSha256}`);
  console.log(`manifest SHA-256: ${sha256(`${JSON.stringify(generated.manifest, null, 2)}\n`)}`);
}
