import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, URL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_ROOT = join(ROOT, "dist", "timeline");
const PLACES_ROOT = join(ROOT, "dist", "places");
const THEMES_ROOT = join(ROOT, "dist", "themes");
const PUBLIC_BASE = "https://jigsawrin.github.io/edo-history-map/";
export const TIMELINE_SCHEMA_VERSION = 1;
const TRACKS = Object.freeze(["shiga-sengoku", "kyoto-bakumatsu"]);
const TYPES = Object.freeze(["battle", "politics", "construction", "religion", "incident", "movement", "death", "transition", "other"]);
const PRECISIONS = Object.freeze(["day", "month", "year", "range", "circa"]);
const CALENDARS = Object.freeze(["japanese-lunisolar", "gregorian", "year-only", "mixed"]);
const TRACK_META = Object.freeze({
  "shiga-sengoku": { label: "滋賀・戦国", datasetId: "project-shiga-sengoku-places", region: "shiga", era: "sengoku", placeAnchor: "place-shiga-" },
  "kyoto-bakumatsu": { label: "京都・幕末", datasetId: "project-kyoto-bakumatsu-places", region: "kyoto", era: "bakumatsu", placeAnchor: "place-kyoto-" },
});
const TYPE_LABELS = Object.freeze({ battle: "戦い", politics: "政治", construction: "築城・建設", religion: "宗教", incident: "事件", movement: "活動・移動", death: "死去・襲撃", transition: "転換", other: "その他" });
const PRECISION_LABELS = Object.freeze({ day: "日付確定", month: "月まで確認", year: "年まで確認", range: "期間", circa: "おおよその年代" });
const CALENDAR_LABELS = Object.freeze({ "japanese-lunisolar": "日本旧暦", gregorian: "グレゴリオ暦", "year-only": "西暦年のみ", mixed: "和暦・西暦併記" });
const THEME_DIRS = Object.freeze({ person: "people", event: "events", group: "groups", concept: "concepts" });
const THEME_TYPE_LABELS = Object.freeze({ person: "人物", event: "事件・戦い", group: "勢力・組織", concept: "歴史テーマ" });
const ID = /^timeline-(shiga|kyoto)-[0-9]{4}-[a-z0-9]+(?:-[a-z0-9]+)*$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u001f\u007f]|<[^>]*>|\[[^\]]*\]\([^)]*\)/u;
const SOURCE_ORIGINS = new Set(["https://bunka.nii.ac.jp", "https://geoshape.ex.nii.ac.jp", "https://ja.kyoto.travel", "https://kurodani.jp", "https://msearch.gsi.go.jp", "https://myomanji.jp", "https://shimogyo.city.kyoto.lg.jp", "https://www.city.nagahama.lg.jp", "https://www.doshisha.ac.jp", "https://www.pref.kyoto.jp", "https://www.pref.shiga.lg.jp", "https://www2.city.kyoto.lg.jp"]);

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
// eslint-disable-next-line no-control-regex
export function escapeHtml(value) { return String(value).replace(/[\u0000-\u001f\u007f]/gu, "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function fail(message) { throw new Error(message); }
function countBy(values, keys) { return Object.fromEntries(keys.map((key) => [key, values.filter((value) => value === key).length])); }
function aggregateSha(files) { return sha256([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, content]) => `${path}\0${sha256(content)}\n`).join("")); }
function themePath(theme) { return `${THEME_DIRS[theme.type]}/${theme.id.slice(`${theme.type}-`.length)}/index.html`; }
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function safeText(value, label, max = 240) { if (typeof value !== "string" || !value || value.trim() !== value || value.length > max || FORBIDDEN.test(value)) fail(`${label}が不正です`); return value; }
function safeSource(source) { const url = new URL(source.url); if (url.protocol !== "https:" || url.username || url.password || !SOURCE_ORIGINS.has(url.origin)) fail("年表出典URLが許可リスト外です"); return url.href; }
function sourceTitle(source) { return `${source.publisher ?? source.providerJa}「${source.title ?? source.titleJa}」`;
}

export function validateTimelineData(raw, context) {
  if (!Array.isArray(raw) || raw.length < 24 || raw.length > 50) fail("年表項目数が24から50件ではありません");
  const themeIds = new Set(context.themes.map((theme) => theme.id));
  const places = new Map([...context.kyotoPlaces.map((place) => [`project-kyoto-bakumatsu-places:${place.id}`, place]), ...context.shigaPlaces.map((place) => [`project-shiga-sengoku-places:${place.id}`, place])]);
  const sources = new Map([...context.kyotoSources, ...context.shigaSources].map((source) => [source.id, source]));
  const ids = new Set(); const orders = new Set(); let previousOrder = 0; let previousYear = 0;
  const entries = raw.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`timeline[${index}]が不正です`);
    safeText(entry.id, "id", 100); if (!ID.test(entry.id) || ids.has(entry.id)) fail("年表IDが不正または重複しています"); ids.add(entry.id);
    if (!Number.isInteger(entry.order) || entry.order <= previousOrder || orders.has(entry.order)) fail("orderが一意な昇順ではありません"); orders.add(entry.order); previousOrder = entry.order;
    if (!TRACKS.includes(entry.track) || !TYPES.includes(entry.type)) fail(`${entry.id}のtrackまたはtypeが不正です`);
    const date = entry.date; if (!date || typeof date !== "object" || Array.isArray(date)) fail(`${entry.id}の日付が不正です`);
    safeText(date.displayJa, `${entry.id}.date.displayJa`, 100);
    if (!Number.isInteger(date.startYear) || date.startYear < 1467 || date.startYear > 1868 || date.startYear < previousYear) fail(`${entry.id}のstartYearが不正です`); previousYear = date.startYear;
    for (const key of ["startMonth", "endMonth"]) if (date[key] !== undefined && (!Number.isInteger(date[key]) || date[key] < 1 || date[key] > 12)) fail(`${entry.id}の月が不正です`);
    for (const key of ["startDay", "endDay"]) if (date[key] !== undefined && (!Number.isInteger(date[key]) || date[key] < 1 || date[key] > 31)) fail(`${entry.id}の日が不正です`);
    if (!PRECISIONS.includes(date.precision) || !CALENDARS.includes(date.calendarBasis)) fail(`${entry.id}の日付精度が不正です`);
    if (date.precision === "day" && (!date.startMonth || !date.startDay || date.endYear !== undefined)) fail(`${entry.id}の日精度が不整合です`);
    if (date.precision === "month" && (!date.startMonth || date.startDay !== undefined || date.endYear !== undefined)) fail(`${entry.id}の月精度が不整合です`);
    if (["year", "circa"].includes(date.precision) && (date.startMonth !== undefined || date.endYear !== undefined)) fail(`${entry.id}の年精度が不整合です`);
    if (date.precision === "range" && !Number.isInteger(date.endYear)) fail(`${entry.id}の期間終了がありません`);
    if (Number.isInteger(date.endYear) && date.endYear < date.startYear) fail(`${entry.id}の期間が逆転しています`);
    safeText(entry.titleJa, `${entry.id}.titleJa`, 100); safeText(entry.summaryJa, `${entry.id}.summaryJa`, 240);
    if (!Array.isArray(entry.relatedThemeIds) || entry.relatedThemeIds.length === 0 || new Set(entry.relatedThemeIds).size !== entry.relatedThemeIds.length || entry.relatedThemeIds.some((id) => !themeIds.has(id))) fail(`${entry.id}のテーマ参照が不正です`);
    if (!Array.isArray(entry.relatedPlaces) || entry.relatedPlaces.length === 0) fail(`${entry.id}に関連地点がありません`);
    const placeKeys = new Set();
    for (const reference of entry.relatedPlaces) {
      if (reference.datasetId !== TRACK_META[entry.track].datasetId) fail(`${entry.id}のdataset IDがtrackと一致しません`);
      const key = `${reference.datasetId}:${reference.placeId}`; const place = places.get(key);
      if (!place || placeKeys.has(key)) fail(`${entry.id}の地点参照が不正です`); placeKeys.add(key);
      safeText(reference.relationSummaryJa, `${entry.id}.relationSummaryJa`, 180);
      if (!Array.isArray(reference.sourceIds) || reference.sourceIds.length === 0 || new Set(reference.sourceIds).size !== reference.sourceIds.length || reference.sourceIds.some((id) => !sources.has(id) || !place.sourceIds.includes(id))) fail(`${entry.id}の出典が地点出典と一致しません`);
    }
    return Object.freeze(entry);
  });
  for (const track of TRACKS) if (entries.filter((entry) => entry.track === track).length < 10) fail(`${track}が10件未満です`);
  if (new Set(entries.flatMap((entry) => entry.relatedThemeIds)).size < 12) fail("関連テーマが12件未満です");
  return Object.freeze(entries);
}

function documentPage({ title, description, canonical, cssHref, body }) {
  return `<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<meta name="description" content="${escapeHtml(description)}">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'self'; img-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'">\n<link rel="canonical" href="${escapeHtml(canonical)}">\n<link rel="stylesheet" href="${escapeHtml(cssHref)}">\n<title>${escapeHtml(title)}</title>\n</head>\n<body>\n<a class="skip-link" href="#main-content">本文へスキップ</a>\n${body}\n</body>\n</html>\n`;
}
function header(depth, current) { const root = depth === 0 ? "./" : "../"; return `<header class="site-header"><p class="site-title"><a href="${root}">歴史年表</a></p><nav class="global-nav" aria-label="歴史年表の主要ナビゲーション"><a href="${root}"${current === "top" ? ' aria-current="page"' : ""}>年表トップ</a><a href="${root}shiga-sengoku/"${current === "shiga-sengoku" ? ' aria-current="page"' : ""}>滋賀・戦国</a><a href="${root}kyoto-bakumatsu/"${current === "kyoto-bakumatsu" ? ' aria-current="page"' : ""}>京都・幕末</a><a href="${root}../themes/">テーマ索引</a><a href="${root}../places/">地点一覧</a><a href="${root}../">地図版</a></nav></header>`; }
function footer() { return `<footer class="site-footer"><p>この年表は収録地点から確認できる出来事だけを掲載し、日本史全体を連続的・網羅的に示すものではありません。JavaScript、フォーム、Cookie、storage、外部画像、外部フォントを使用しません。</p></footer>`; }
function machineDate(date) {
  if (date.precision === "year" || date.precision === "circa") return `<time datetime="${date.startYear}">${escapeHtml(date.displayJa)}</time>`;
  if (date.precision === "month" && date.calendarBasis === "gregorian") return `<time datetime="${date.startYear}-${String(date.startMonth).padStart(2, "0")}">${escapeHtml(date.displayJa)}</time>`;
  if (date.precision === "day" && date.calendarBasis === "gregorian") return `<time datetime="${date.startYear}-${String(date.startMonth).padStart(2, "0")}-${String(date.startDay).padStart(2, "0")}">${escapeHtml(date.displayJa)}</time>`;
  return `<span>${escapeHtml(date.displayJa)}</span>`;
}
function dateNote(entry) { if (entry.date.noteJa) return entry.date.noteJa; if (entry.date.precision === "year") return "資料から年まで確認できるため、月日を補っていません。"; if (entry.date.precision === "range") return "単日の出来事ではなく、一定期間の活動・攻防を示します。"; if (entry.date.precision === "circa") return "おおよその年代で、正確な月日を断定していません。"; return ""; }
function topPage(entries) {
  const cards = TRACKS.map((track) => { const meta = TRACK_META[track]; const count = entries.filter((entry) => entry.track === track).length; return `<article class="track-card"><h2><a href="./${track}/">${meta.label}</a></h2><p>${count}項目</p><p>${track === "shiga-sengoku" ? "1560年頃から1583年までの収録地点に関わる出来事です。" : "1858年から1868年までの収録地点に関わる出来事です。"}</p></article>`; }).join("\n");
  const body = `${header(0, "top")}<main id="main-content"><h1>歴史年表</h1><p class="lead">既存の滋賀・戦国と京都・幕末の地点・テーマを、監査済みの日付と関係から年代順にたどります。</p><p class="notice">戦国期と幕末期の間には大きな空白があります。この年表は両時代の間を含む日本史全体を連続的・網羅的に示すものではありません。</p><dl><dt>全項目数</dt><dd>${entries.length}</dd><dt>滋賀・戦国</dt><dd>${entries.filter((entry) => entry.track === "shiga-sengoku").length}</dd><dt>京都・幕末</dt><dd>${entries.filter((entry) => entry.track === "kyoto-bakumatsu").length}</dd></dl><div class="track-grid">${cards}</div><section id="sources"><h2>出典・ライセンス</h2><p>年表項目は各地点の固定出典で日付と関係を確認しています。本文の転載や日付の自動推測は行っていません。詳細は地図版の「出典・ライセンス」と各年表項目の固定出典を確認してください。</p><p><a href="#sources">このページの出典・ライセンス節</a></p></section><section id="privacy"><h2>プライバシー</h2><p>静的年表はJavaScript、Cookie、localStorage、sessionStorage、IndexedDB、フォーム、アクセス解析を使用しません。</p><p><a href="#privacy">このページのプライバシー節</a></p></section></main>${footer()}`;
  return documentPage({ title: "歴史年表 | いま・むかし地図", description: "滋賀・戦国と京都・幕末の収録地点を年代順にたどるJavaScript不要の歴史年表です。", canonical: `${PUBLIC_BASE}timeline/`, cssHref: "./static-timeline.css", body });
}
function trackPage(track, entries, themes, places, sources) {
  const meta = TRACK_META[track]; const themeMap = new Map(themes.map((theme) => [theme.id, theme])); const placeMap = new Map(places.map((place) => [place.id, place]));
  const articles = entries.map((entry, index) => {
    const relatedThemes = entry.relatedThemeIds.map((themeId) => { const theme = themeMap.get(themeId); return `<li><a href="../../themes/${themePath(theme).replace("/index.html", "/")}">${escapeHtml(theme.titleJa)}</a>（${escapeHtml(THEME_TYPE_LABELS[theme.type])}）</li>`; }).join("");
    const relatedPlaces = entry.relatedPlaces.map((reference) => { const place = placeMap.get(reference.placeId); return `<li><h3>${escapeHtml(place.nameJa)}</h3><p>${escapeHtml(reference.relationSummaryJa)}</p><p><a href="../../places/${meta.region}/#${meta.placeAnchor}${escapeHtml(place.id)}">地点詳細へ</a> <a href="../../?region=${meta.region}&amp;era=${meta.era}">地図で${escapeHtml(meta.label)}を開く</a></p></li>`; }).join("");
    const sourceIds = [...new Set(entry.relatedPlaces.flatMap((reference) => reference.sourceIds))];
    const sourceList = sourceIds.map((sourceId) => { const source = sources.get(sourceId); return `<li><a class="external-link" href="${escapeHtml(safeSource(source))}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceTitle(source))}（外部サイト）</a></li>`; }).join("");
    const note = dateNote(entry); const previous = index > 0 ? `<a rel="prev" href="#${entries[index - 1].id}">前：${escapeHtml(entries[index - 1].titleJa)}</a>` : ""; const next = index < entries.length - 1 ? `<a rel="next" href="#${entries[index + 1].id}">次：${escapeHtml(entries[index + 1].titleJa)}</a>` : "";
    return `<article class="timeline-entry" id="${entry.id}"><p>${machineDate(entry.date)}</p><h2>${escapeHtml(entry.titleJa)}</h2><p class="timeline-meta"><span class="timeline-tag">${escapeHtml(meta.label)}</span><span class="timeline-tag">${escapeHtml(TYPE_LABELS[entry.type])}</span><span class="timeline-tag">日付精度：${escapeHtml(PRECISION_LABELS[entry.date.precision])}</span></p><dl><dt>暦</dt><dd>${escapeHtml(CALENDAR_LABELS[entry.date.calendarBasis])}</dd></dl>${note ? `<p class="date-note">${escapeHtml(note)}</p>` : ""}<p>${escapeHtml(entry.summaryJa)}</p><section><h3>関連テーマ</h3><ul>${relatedThemes}</ul></section><section><h3>関連地点</h3><ol class="relation-list">${relatedPlaces}</ol></section><section><h3>出典</h3><ul>${sourceList}</ul></section><p><a href="./#${entry.id}">この年表項目へのリンク</a></p><nav class="timeline-nav" aria-label="前後の年表項目">${previous}${next}</nav></article>`;
  }).join("\n");
  const body = `${header(1, track)}<main id="main-content"><h1>${meta.label}の歴史年表</h1><p>${entries.length}項目を監査済みのorder順に掲載しています。</p><p class="notice">この地域の既存地点とテーマから直接確認できる出来事だけを掲載し、時代全体を網羅しません。</p>${articles}<p><a href="../">歴史年表トップへ戻る</a></p></main>${footer()}`;
  return documentPage({ title: `${meta.label}の歴史年表 | いま・むかし地図`, description: `${meta.label}の収録地点に関わる出来事${entries.length}件を年代順に確認できます。`, canonical: `${PUBLIC_BASE}timeline/${track}/`, cssHref: "../static-timeline.css", body });
}

function insertPlaceBacklinks(html, track, entries) {
  const meta = TRACK_META[track]; let output = html.replace(/<section class="related-timeline"[\s\S]*?<\/section>/gu, ""); let count = 0;
  const placeIds = [...new Set(entries.flatMap((entry) => entry.relatedPlaces.map((reference) => reference.placeId)))];
  for (const placeId of placeIds) {
    const related = entries.filter((entry) => entry.relatedPlaces.some((reference) => reference.placeId === placeId)).slice(0, 5);
    const marker = `<article id="${meta.placeAnchor}${placeId}"`; const start = output.indexOf(marker); if (start < 0) fail(`年表逆リンク対象の地点アンカーがありません: ${placeId}`); const end = output.indexOf("</article>", start);
    const links = related.map((entry) => { const reference = entry.relatedPlaces.find((item) => item.placeId === placeId); return `<li>${escapeHtml(entry.date.displayJa)}：<a href="../../timeline/${track}/#${entry.id}">${escapeHtml(entry.titleJa)}</a><p>${escapeHtml(reference.relationSummaryJa)}</p></li>`; }).join("");
    output = `${output.slice(0, end)}<section class="related-timeline" aria-labelledby="related-timeline-${placeId}"><h4 id="related-timeline-${placeId}">関連する歴史年表</h4><ul>${links}</ul></section>${output.slice(end)}`; count += related.length;
  }
  return { html: output, count };
}
function insertThemeBacklinks(html, theme, entries) {
  const related = entries.filter((entry) => entry.relatedThemeIds.includes(theme.id));
  const cleaned = html.replace(/<section class="related-timeline"[\s\S]*?<\/section>/gu, ""); if (related.length === 0) return { html: cleaned, count: 0 };
  const marker = '<nav class="theme-nav"'; const index = cleaned.indexOf(marker); if (index < 0) fail(`テーマページの挿入位置がありません: ${theme.id}`);
  const links = related.map((entry) => `<li>${escapeHtml(entry.date.displayJa)}：<a href="../../../timeline/${entry.track}/#${entry.id}">${escapeHtml(entry.titleJa)}</a>（${escapeHtml(TRACK_META[entry.track].label)}）</li>`).join("");
  return { html: `${cleaned.slice(0, index)}<section class="related-timeline"><h2>関連する歴史年表</h2><ul>${links}</ul></section>${cleaned.slice(index)}`, count: related.length };
}

export function generateStaticTimelineFiles({ timelineInput, themes, kyotoPlaces, shigaPlaces, kyotoSources, shigaSources, css, placeManifest, kyotoPlaceHtml, shigaPlaceHtml, themeFiles }) {
  const input = timelineInput;
  const entries = validateTimelineData(JSON.parse(input), { themes, kyotoPlaces, shigaPlaces, kyotoSources, shigaSources }); const sources = new Map([...kyotoSources, ...shigaSources].map((source) => [source.id, source]));
  const files = new Map(); files.set("index.html", topPage(entries)); files.set("shiga-sengoku/index.html", trackPage("shiga-sengoku", entries.filter((entry) => entry.track === "shiga-sengoku"), themes, shigaPlaces, sources)); files.set("kyoto-bakumatsu/index.html", trackPage("kyoto-bakumatsu", entries.filter((entry) => entry.track === "kyoto-bakumatsu"), themes, kyotoPlaces, sources)); files.set("static-timeline.css", css);
  const placeUpdates = {}; let placeBacklinkCount = 0;
  for (const track of TRACKS) { const meta = TRACK_META[track]; const result = insertPlaceBacklinks(meta.region === "kyoto" ? kyotoPlaceHtml : shigaPlaceHtml, track, entries.filter((entry) => entry.track === track)); placeUpdates[`${meta.region}/index.html`] = result.html; placeBacklinkCount += result.count; }
  const themeUpdates = new Map(); let themeBacklinkCount = 0;
  for (const theme of themes) { const path = themePath(theme); const html = themeFiles.get(path); if (!html) fail(`テーマ生成物がありません: ${path}`); const result = insertThemeBacklinks(html, theme, entries); themeUpdates.set(path, result.html); themeBacklinkCount += result.count; }
  const manifest = JSON.parse(JSON.stringify(placeManifest)); manifest.schemaVersion = 3;
  for (const [path, html] of Object.entries(placeUpdates)) manifest.files[path] = sha256(html);
  manifest.themes.files = Object.fromEntries(
    [...themeUpdates].map(([path, html]) => [path, sha256(html)]).concat([
      ["index.html", manifest.themes.files["index.html"]],
      ["people/index.html", manifest.themes.files["people/index.html"]],
      ["events/index.html", manifest.themes.files["events/index.html"]],
      ["groups/index.html", manifest.themes.files["groups/index.html"]],
      ["concepts/index.html", manifest.themes.files["concepts/index.html"]],
      ["static-themes.css", manifest.themes.files["static-themes.css"]],
    ]),
  );
  const finalThemeHtml = [...themeUpdates, ...["index.html", "people/index.html", "events/index.html", "groups/index.html", "concepts/index.html"].map((path) => [path, themeFiles.get(path)])];
  manifest.themes.htmlSha256 = aggregateSha(finalThemeHtml); manifest.themes.existingPlacePagesSha256 = aggregateSha(Object.entries(placeUpdates));
  const relations = entries.flatMap((entry) => entry.relatedPlaces); const themeRelations = entries.flatMap((entry) => entry.relatedThemeIds);
  manifest.timeline = { schemaVersion: TIMELINE_SCHEMA_VERSION, entryCount: entries.length, trackCounts: countBy(entries.map((entry) => entry.track), TRACKS), typeCounts: countBy(entries.map((entry) => entry.type), TYPES), precisionCounts: countBy(entries.map((entry) => entry.date.precision), PRECISIONS), calendarBasisCounts: countBy(entries.map((entry) => entry.date.calendarBasis), CALENDARS), placeRelationCount: relations.length, themeRelationCount: themeRelations.length, relatedThemeCount: new Set(themeRelations).size, htmlPageCount: 3, htmlSha256: aggregateSha([...files].filter(([path]) => path.endsWith(".html"))), inputCurationSha256: sha256(input), placeBacklinkCount, themeBacklinkCount, cssSha256: sha256(files.get("static-timeline.css")), files: Object.fromEntries([...files].map(([path, content]) => [path, sha256(content)])) };
  return { entries, files, manifest, placeUpdates, themeUpdates };
}

export function buildStaticTimelinePages(root = ROOT) {
  const themes = readJson(join(root, "data-curation/historical-themes.json"));
  const generated = generateStaticTimelineFiles({
    timelineInput: readFileSync(join(root, "data-curation/historical-timeline.json"), "utf8"), themes,
    kyotoPlaces: readJson(join(root, "data-curation/kyoto-bakumatsu-places.json")), shigaPlaces: readJson(join(root, "data-curation/shiga-sengoku-places.json")),
    kyotoSources: readJson(join(root, "src/kyoto-source-registry.json")), shigaSources: readJson(join(root, "src/shiga-source-registry.json")),
    css: readFileSync(join(root, "src/static-timeline.css"), "utf8"), placeManifest: readJson(join(PLACES_ROOT, "manifest.json")),
    kyotoPlaceHtml: readFileSync(join(root, "dist", "places", "kyoto", "index.html"), "utf8"), shigaPlaceHtml: readFileSync(join(root, "dist", "places", "shiga", "index.html"), "utf8"),
    themeFiles: new Map(Object.keys(readJson(join(PLACES_ROOT, "manifest.json")).themes.files).map((path) => [path, readFileSync(join(THEMES_ROOT, path), "utf8")]))
  });
  const { files, manifest, placeUpdates, themeUpdates } = generated;
  rmSync(OUTPUT_ROOT, { recursive: true, force: true }); for (const [path, content] of files) { const output = join(OUTPUT_ROOT, path); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, content, "utf8"); }
  for (const [path, html] of Object.entries(placeUpdates)) writeFileSync(join(PLACES_ROOT, path), html, "utf8"); for (const [path, html] of themeUpdates) writeFileSync(join(THEMES_ROOT, path), html, "utf8"); writeFileSync(join(PLACES_ROOT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return generated;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) { const generated = buildStaticTimelinePages(); console.log(`静的歴史年表: ${generated.manifest.timeline.entryCount}項目、HTML ${generated.manifest.timeline.htmlPageCount}ページ`); console.log(`年表HTML SHA-256: ${generated.manifest.timeline.htmlSha256}`); console.log(`年表キュレーション SHA-256: ${generated.manifest.timeline.inputCurationSha256}`); console.log(`manifest SHA-256: ${sha256(`${JSON.stringify(generated.manifest, null, 2)}\n`)}`); }
