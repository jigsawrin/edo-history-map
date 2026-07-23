import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";

export const FILE = "src/historical-reference-panel-registry.json";
const ENTRY_KEYS = ["id","assetId","sourceId","regionId","sourceEraId","sourceDateDisplayJa","historicalPeriodJa","titleJa","descriptionJa","altJa","image","trigger","priority","attributionJa","derivativeDisclosureJa","sourceUrl","licenseCode","licenseUrl","cautionJa"];
const IMAGE_KEYS = ["publicPath","mimeType","width","height","bytes","sha256"];
const ZOOM_KEYS = ["minimum","maximum","enterDetailAt","leaveDetailBelow"];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exactKeys = (value, keys) => value && typeof value === "object" && equal(Object.keys(value).sort(), [...keys].sort());
const safeText = (value) => typeof value === "string" && value.length > 0 && !value.includes("<") && !value.includes(">") && ![...value].some((character) => { const code = character.codePointAt(0); return code !== undefined && (code < 32 || code === 127); });
const area = (ring) => Math.abs(ring.slice(0, -1).reduce((sum, point, index) => sum + point[0] * ring[index + 1][1] - ring[index + 1][0] * point[1], 0) / 2);

export function auditHistoricalReferencePanelRegistry(root) {
  const errors = [];
  let registry;
  let assets;
  let displays;
  let candidates;
  try {
    registry = JSON.parse(readFileSync(join(root, FILE), "utf8"));
    assets = JSON.parse(readFileSync(join(root, "data-curation/historical-reference-assets.json"), "utf8"));
    displays = JSON.parse(readFileSync(join(root, "data-curation/historical-map-display-catalog.json"), "utf8"));
    candidates = JSON.parse(readFileSync(join(root, "data-curation/historical-raster-candidates.json"), "utf8"));
  } catch (error) {
    return { errors: [`JSONを読めません: ${error.message}`], registry: null };
  }
  const fail = (message) => errors.push(message);
  if (!exactKeys(registry, ["schemaVersion", "entries"]) || registry.schemaVersion !== 1 || !Array.isArray(registry.entries)) fail("registry schemaが不正です");
  const ids = new Set();
  for (const entry of registry.entries ?? []) {
    if (!exactKeys(entry, ENTRY_KEYS)) fail(`${entry.id ?? "entry"}: exact key不一致`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(entry.id ?? "") || ids.has(entry.id)) fail(`${entry.id}: ID不正または重複`);
    ids.add(entry.id);
    for (const key of ["titleJa","descriptionJa","altJa","attributionJa","derivativeDisclosureJa","cautionJa","sourceDateDisplayJa","historicalPeriodJa"]) if (!safeText(entry[key])) fail(`${entry.id}: ${key}にHTMLまたは制御文字`);
    if (!exactKeys(entry.image, IMAGE_KEYS) || !exactKeys(entry.trigger, ["geometry", "zoom"]) || !exactKeys(entry.trigger?.zoom, ZOOM_KEYS)) fail(`${entry.id}: image/trigger key不正`);
    if (!new Set(["image/png", "image/webp"]).has(entry.image?.mimeType)) fail(`${entry.id}: MIME不正`);
    if (!/^\/data\/historical-reference-assets\/[a-z0-9-]+\/[a-z0-9-]+\.(png|webp)$/u.test(entry.image?.publicPath ?? "") || /(rawPath|derivedPath|data-raw|data-derived|:\\|\.\.)/u.test(JSON.stringify(entry))) fail(`${entry.id}: private/local path不正`);
    let sourceUrl;
    let licenseUrl;
    try { sourceUrl = new URL(entry.sourceUrl); licenseUrl = new URL(entry.licenseUrl); } catch { fail(`${entry.id}: URL不正`); }
    if (sourceUrl?.href !== "https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960") fail(`${entry.id}: sourceUrl不正`);
    if (licenseUrl?.href !== "https://archive.library.metro.tokyo.lg.jp/da/windowRequestImage2") fail(`${entry.id}: licenseUrl不正`);
    const display = displays.maps.find((item) => item.id === entry.id);
    const asset = assets.assets.find((item) => item.id === entry.assetId);
    const candidate = candidates.candidates.find((item) => item.candidateId === entry.sourceId);
    if (!display) fail(`${entry.id}: orphan runtime entry`);
    if (!asset) fail(`${entry.id}: assetId不一致`);
    if (!candidate) fail(`${entry.id}: sourceId不一致`);
    if (display && [display.publicationStatus, display.technicalReviewStatus, display.rightsReviewStatus].join("/") !== "published/approved/approved") fail(`${entry.id}: display未承認`);
    if (asset && [asset.publicationStatus, asset.technicalReviewStatus, asset.rightsReviewStatus].join("/") !== "published/approved/approved") fail(`${entry.id}: asset未承認`);
    if (display && (display.sourceId !== entry.sourceId || display.artifactBinding.assetId !== entry.assetId)) fail(`${entry.id}: display binding不一致`);
    if (asset?.sourceId !== entry.sourceId) fail(`${entry.id}: asset sourceId不一致`);
    const expectedImage = asset && { publicPath:asset.derivedFile.publicPath, mimeType:asset.derivedFile.mimeType, width:asset.derivedFile.width, height:asset.derivedFile.height, bytes:asset.derivedFile.bytes, sha256:asset.derivedFile.sha256 };
    if (asset && !equal(entry.image, expectedImage)) fail(`${entry.id}: image metadata不一致`);
    if (display && (!equal(entry.trigger.geometry, display.spatialBinding.geometry) || !equal(entry.trigger.zoom, display.zoom) || entry.priority !== display.priority)) fail(`${entry.id}: Polygon/zoom/priority不一致`);
    if (display?.name.ja !== entry.titleJa) fail(`${entry.id}: title不一致`);
    if (asset && (asset.attribution.ja !== entry.attributionJa || asset.derivativeDisclosure.ja !== entry.derivativeDisclosureJa)) fail(`${entry.id}: attribution/加工説明不一致`);
    if (candidate && (candidate.publicationYearDisplay !== entry.sourceDateDisplayJa || candidate.historicalPeriod !== entry.historicalPeriodJa || candidate.exactItemUrl !== entry.sourceUrl || !candidate.intendedUses.includes("reference-panel"))) fail(`${entry.id}: candidate metadata不一致`);
    const geometry = entry.trigger?.geometry;
    if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates) || geometry.coordinates.some((ring) => ring.length < 4 || !equal(ring[0], ring.at(-1)) || area(ring) === 0)) fail(`${entry.id}: Polygon不正`);
    const file = join(root, `public${entry.image?.publicPath}`);
    if (!existsSync(file)) fail(`${entry.id}: public画像なし`);
    else {
      const buffer = readFileSync(file);
      if (statSync(file).size !== entry.image.bytes || createHash("sha256").update(buffer).digest("hex") !== entry.image.sha256 || buffer.toString("ascii", 1, 4) !== "PNG" || buffer.readUInt32BE(16) !== entry.image.width || buffer.readUInt32BE(20) !== entry.image.height) fail(`${entry.id}: public画像検証不一致`);
    }
  }
  for (const display of displays.maps.filter((item) => item.publicationStatus === "published" && item.displayMode === "reference-panel")) if (!ids.has(display.id)) fail(`${display.id}: published displayのregistry欠落`);
  const allowed = new Set((registry.entries ?? []).map((entry) => entry.image.publicPath.slice(1)));
  const directory = join(root, "public/data/historical-reference-assets");
  const walk = (path) => readdirSync(path, { withFileTypes:true }).flatMap((item) => item.isDirectory() ? walk(join(path, item.name)) : [join(path, item.name)]);
  if (existsSync(directory)) for (const file of walk(directory)) { const path = relative(join(root, "public"), file).split(sep).join("/"); if (!allowed.has(path)) fail(`public画像orphan: ${path}`); }
  return { errors, registry };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditHistoricalReferencePanelRegistry(root);
  console.log(`歴史参考パネルregistry: ${result.registry?.entries?.length ?? 0}件`);
  for (const error of result.errors) console.error(`ERROR: ${error}`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
