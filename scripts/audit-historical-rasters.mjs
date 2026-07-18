import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHistoricalRasterDefinitions } from "../src/historical-raster-schema.mjs";
import { validateHistoricalRasterControlPoints, hasDistributedControlPoints, validateHistoricalRasterGeoreference } from "../src/historical-raster-metadata.mjs";
import { verifyHistoricalRasterPackage } from "./historical-raster-package.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
function sourceEntries(text) {
  return new Map(text.split(/\n {2}- id: /u).slice(1).map((entry) => {
    const id = entry.split("\n")[0].trim();
    const field = (name) => entry.match(new RegExp(`^\\s+${name}:\\s*(.+)$`, "m"))?.[1]?.trim() ?? null;
    return [id, { entry, status: field("review_status"), assetType: field("asset_type"), field }];
  }));
}
function walkFiles(root) {
  if (!existsSync(root)) return [];
  const files = [];
  const walk = (directory) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const full = join(directory, entry.name); if (entry.isDirectory()) walk(full); else files.push(full); } };
  walk(root); return files;
}

export function auditHistoricalRasterRepository(root) {
  const errors = []; const infos = [];
  const error = (message) => errors.push(message);
  let definitions = [];
  try { definitions = [...validateHistoricalRasterDefinitions(JSON.parse(readFileSync(join(root, "src", "historical-raster-registry.json"), "utf8")))]; }
  catch (cause) { error(cause instanceof Error ? cause.message : "古地図ラスターレジストリを解析できません"); }
  const runtimeSource = readFileSync(join(root, "src", "historical-raster.ts"), "utf8");
  const approvalBlock = runtimeSource.match(/APPROVED_HISTORICAL_RASTER_SOURCE_IDS[\s\S]*?=\s*\[([\s\S]*?)\];/u)?.[1];
  if (approvalBlock === undefined) error("承認済み古地図source一覧を解析できません");
  const approvedSourceIds = new Set([...(approvalBlock ?? "").matchAll(/["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/gu)].map((match) => match[1]));
  const eraIds = new Set(JSON.parse(readFileSync(join(root, "src", "era-catalog.json"), "utf8")).map((era) => era.id));
  const packs = readdirSync(join(root, "src", "regions")).filter((name) => name.endsWith("-pack.json")).map((name) => JSON.parse(readFileSync(join(root, "src", "regions", name), "utf8")));
  const regionMap = new Map(packs.map((pack) => [pack.region.id, pack]));
  const attributionSource = readFileSync(join(root, "src", "attribution-registry.ts"), "utf8");
  const attributionIds = new Set([...attributionSource.matchAll(/^\s{4}"([a-z0-9-]+)":/gmu)].map((match) => match[1]));
  const sources = sourceEntries(readFileSync(join(root, "DATA_SOURCES.yml"), "utf8"));
  for (const sourceId of approvedSourceIds) {
    const source = sources.get(sourceId);
    if (!source || source.status !== "approved" || source.assetType !== "historical-raster") error(`${sourceId}: 承認一覧のsourceがapproved historical-rasterではありません`);
  }
  for (const definition of definitions) {
    if (definition.reviewStatus !== "approved") error(`${definition.id}: 実行時レジストリへpending/rejectedを登録できません`);
    if (!approvedSourceIds.has(definition.sourceId)) error(`${definition.id}: sourceが実行時承認一覧にありません`);
    const pack = regionMap.get(definition.regionId);
    if (!pack) { error(`${definition.id}: region IDが存在しません`); continue; }
    if (!eraIds.has(definition.eraId)) error(`${definition.id}: era IDが存在しません`);
    const binding = pack.eras.find((era) => era.eraId === definition.eraId && era.enabled);
    if (!binding || !binding.historicalRasterIds?.includes(definition.id) || binding.defaultHistoricalRasterId && !binding.historicalRasterIds.includes(binding.defaultHistoricalRasterId)) error(`${definition.id}: region/era接続が不正です`);
    if (!attributionIds.has(definition.attributionId) || !binding?.attributionIds.includes(definition.attributionId)) error(`${definition.id}: attribution IDが未登録または未接続です`);
    const source = sources.get(definition.sourceId);
    if (!source || source.status !== "approved" || source.assetType !== "historical-raster") error(`${definition.id}: sourceがapproved historical-rasterではありません`);
    else {
      for (const field of ["redistribution_allowed", "modification_allowed", "cropping_allowed", "georeferencing_allowed", "tiling_allowed"]) if (source.field(field) !== "true") error(`${definition.id}: ${field}=trueがありません`);
      for (const field of ["attribution", "historical_period", "geographic_bounds", "original_sha256", "tile_manifest_sha256", "tile_manifest_path", "review_audit"]) if (!source.field(field) || source.field(field) === "null") error(`${definition.id}: source.${field}がありません`);
      if (source.field("tile_manifest_path") !== `public/${definition.tileManifestPath}`) error(`${definition.id}: source.tile_manifest_pathが定義と一致しません`);
    }
    const manifestPath = join(root, "public", ...definition.tileManifestPath.split("/"));
    const tileRoot = join(root, "public", ...definition.localTilePath.slice(0, definition.localTilePath.indexOf("{z}")).split("/"));
    const controlPath = join(root, "data-curation", "historical-rasters", `${definition.id}.control-points.json`);
    const georeferencePath = join(root, "data-curation", "historical-rasters", `${definition.id}.georeference.json`);
    const reviewRelative = source?.field("review_audit");
    const reviewPath = reviewRelative && /^audit\/[a-z0-9-]+\.md$/u.test(reviewRelative) ? join(root, ...reviewRelative.split("/")) : null;
    try {
      const controlBuffer = readFileSync(controlPath); const control = validateHistoricalRasterControlPoints(JSON.parse(controlBuffer.toString("utf8")));
      const georeferenceBuffer = readFileSync(georeferencePath); const georeference = validateHistoricalRasterGeoreference(JSON.parse(georeferenceBuffer.toString("utf8")));
      if (control.rasterId !== definition.id || georeference.rasterId !== definition.id || control.points.length !== definition.controlPointCount || georeference.controlPointCount !== definition.controlPointCount || georeference.method !== definition.georeferenceMethod) error(`${definition.id}: 基準点または位置合わせ定義が一致しません`);
      if (control.points.some((point) => point.sourceIds.some((sourceId) => sources.get(sourceId)?.status !== "approved"))) error(`${definition.id}: 基準点に未承認または未登録のsource IDがあります`);
      if (!hasDistributedControlPoints(control)) error(`${definition.id}: approved基準点が画像全体へ十分に分散していません`);
      if (georeference.controlPointsSha256 !== sha256(controlBuffer)) error(`${definition.id}: control points SHAが一致しません`);
      if (georeference.meanErrorMeters !== definition.estimatedErrorMeters) error(`${definition.id}: 推定誤差が定義と一致しません`);
      if (georeference.maximumErrorMeters !== definition.maximumErrorMeters) error(`${definition.id}: 最大誤差が定義と一致しません`);
      if (control.points.some((point) => point.latitude < pack.region.bounds.minLat || point.latitude > pack.region.bounds.maxLat || point.longitude < pack.region.bounds.minLon || point.longitude > pack.region.bounds.maxLon)) error(`${definition.id}: 基準点が対象地域外です`);
      const verified = verifyHistoricalRasterPackage({ manifestPath, tileRoot, definition });
      if (verified.manifest.georeferenceMetadataSha256 !== sha256(georeferenceBuffer)) error(`${definition.id}: georeference metadata SHAが一致しません`);
      if (source?.field("original_sha256") !== verified.manifest.originalFileSha256 || source?.field("tile_manifest_sha256") !== verified.manifestSha256) error(`${definition.id}: source台帳の原本またはmanifest SHAが一致しません`);
      infos.push(`${definition.id}: ${verified.tileCount}タイル、${verified.totalBytes} bytes、manifest SHA ${verified.manifestSha256}`);
    } catch (cause) { error(`${definition.id}: ${cause instanceof Error ? cause.message : "ラスターパッケージ検証失敗"}`); }
    if (!reviewPath || !existsSync(reviewPath) || !readFileSync(reviewPath, "utf8").includes(definition.id)) error(`${definition.id}: pilot review監査記録がありません`);
  }
  const publicRasterRoot = join(root, "public", "data", "historical-rasters");
  if (definitions.length === 0 && walkFiles(publicRasterRoot).length > 0) error("実行時レジストリが空なのに公開古地図ファイルがあります");
  const distFiles = walkFiles(join(root, "dist"));
  if (distFiles.some((path) => path.includes("tests") || path.includes("project-grid") || path.includes("control-points.json") || path.includes("georeference.json"))) error("test fixtureまたは監査metadataがdistへ混入しています");
  infos.push(`実行時古地図ラスタ: ${definitions.length}件`);
  return Object.freeze({ errors: Object.freeze(errors), infos: Object.freeze(infos), definitions: Object.freeze(definitions) });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditHistoricalRasterRepository(root);
  for (const info of result.infos) console.log(info);
  for (const message of result.errors) console.error(`ERROR: ${message}`);
  console.log(`古地図ラスタ監査: ${result.errors.length === 0 ? "合格" : `不合格（${result.errors.length}件）`}`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
