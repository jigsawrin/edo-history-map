import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";

export const HISTORICAL_REFERENCE_ASSET_SCHEMA_VERSION = 1;
export const HISTORICAL_REFERENCE_ASSET_CATALOG_STATUSES = Object.freeze([
  "empty-foundation",
  "reviewed",
]);
export const REFERENCE_ASSET_RIGHTS_STATUSES = Object.freeze(["approved", "pending", "rejected"]);
export const REFERENCE_ASSET_TECHNICAL_STATUSES = Object.freeze([
  "not-started",
  "in-review",
  "approved",
  "rejected",
]);
export const REFERENCE_ASSET_PUBLICATION_STATUSES = Object.freeze([
  "candidate",
  "shortlisted",
  "published",
]);
export const REFERENCE_ASSET_REMOVED_ELEMENTS = Object.freeze([
  "capture-background",
  "ruler",
  "color-chart",
  "shelfmark-label",
  "mounting-border",
  "non-content-margin",
]);
export const REFERENCE_ASSET_ORIGINAL_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const REFERENCE_ASSET_DERIVED_MIME_TYPES = Object.freeze(["image/png", "image/webp"]);
export const REFERENCE_ASSET_ROTATIONS = Object.freeze([0, 90, 180, 270]);

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const LICENSE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._+\-/]{0,127}$/u;
const SAFE_FILE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_TEXT = /[\u0000-\u001f\u007f<>]/u;
const FORBIDDEN_PATH_CHARS = /[\\:\s?#@]|^\.|\/\.\.|\.\.\//u;
const FORBIDDEN_EXTENSIONS = Object.freeze([
  ".html",
  ".htm",
  ".svg",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".zip",
  ".pdf",
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".ps1",
  ".sh",
]);
const ORIGINAL_MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": Object.freeze([".jpg", ".jpeg"]),
  "image/png": Object.freeze([".png"]),
  "image/webp": Object.freeze([".webp"]),
});
const DERIVED_MIME_EXTENSIONS = Object.freeze({
  "image/png": Object.freeze([".png"]),
  "image/webp": Object.freeze([".webp"]),
});

const ROOT_KEYS = Object.freeze(["schemaVersion", "catalogStatus", "reviewedAt", "assets"]);
const ASSET_KEYS = Object.freeze([
  "id",
  "sourceId",
  "title",
  "description",
  "rightsReviewStatus",
  "technicalReviewStatus",
  "publicationStatus",
  "licenseCode",
  "licenseUrl",
  "attribution",
  "derivativeDisclosure",
  "commercialUseAllowed",
  "redistributionAllowed",
  "modificationAllowed",
  "croppingAllowed",
  "originalFile",
  "crop",
  "removedElements",
  "preservesHistoricalContent",
  "cropReviewNote",
  "derivedFile",
]);
const ORIGINAL_FILE_KEYS = Object.freeze([
  "fileName",
  "mimeType",
  "width",
  "height",
  "bytes",
  "sha256",
  "rawPath",
]);
const CROP_KEYS = Object.freeze([
  "sourceWidth",
  "sourceHeight",
  "x",
  "y",
  "width",
  "height",
  "rotationDegrees",
]);
const DERIVED_FILE_KEYS = Object.freeze([
  "mimeType",
  "width",
  "height",
  "bytes",
  "sha256",
  "derivedPath",
  "publicPath",
]);

const CATALOG_RELATIVE_PATH = "data-curation/historical-reference-assets.json";
const CANDIDATE_RELATIVE_PATH = "data-curation/historical-raster-candidates.json";
const DISPLAY_CATALOG_RELATIVE_PATH = "data-curation/historical-map-display-catalog.json";
const RAW_PREFIX = "data-raw/historical-reference-assets/";
const DERIVED_PREFIX = "data-derived/historical-reference-assets/";
const PUBLIC_PREFIX = "/data/historical-reference-assets/";
const RUNTIME_SOURCE_EXTENSIONS = Object.freeze([".ts", ".mts", ".js"]);

export const RUNTIME_REFERENCE_ASSET_REFERENCE_NEEDLES = Object.freeze([
  "historical-reference-assets",
  "data-curation/historical-reference-assets.json",
  "loadHistoricalReferenceAssetCatalog",
  "validateHistoricalReferenceAssetCatalog",
  "summarizeHistoricalReferenceAssetCatalog",
  "auditHistoricalReferenceAssetRepository",
]);

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertObject(value, label, allowedKeys) {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label}がobjectではありません`);
  for (const key of Object.keys(value)) {
    assert(allowedKeys.includes(key), `${label}.${key}は未定義項目です`);
  }
  return value;
}

function assertId(value, label) {
  assert(typeof value === "string" && ID_PATTERN.test(value), `${label}が不正です`);
  return value;
}

function assertInteger(value, label, min, max) {
  assert(Number.isInteger(value) && value >= min && value <= max, `${label}が範囲外です`);
  return value;
}

function assertBoolean(value, label) {
  assert(typeof value === "boolean", `${label}はbooleanである必要があります`);
  return value;
}

/**
 * LocalizedText validation aligned with src/historical-raster-localization.ts.
 * Kept local so data-curation audit scripts stay independent of runtime imports.
 */
export function validateReferenceAssetLocalizedText(value, label) {
  assertObject(value, label, ["ja", "en"]);
  assert(
    typeof value.ja === "string" &&
      value.ja.trim() === value.ja &&
      value.ja.length > 0 &&
      !FORBIDDEN_TEXT.test(value.ja),
    `${label}.jaが不正です`,
  );
  if (value.en !== undefined) {
    assert(
      typeof value.en === "string" &&
        value.en.trim() === value.en &&
        value.en.length > 0 &&
        !FORBIDDEN_TEXT.test(value.en),
      `${label}.enが不正です`,
    );
  }
  return Object.freeze({
    ja: value.ja,
    ...(value.en === undefined ? {} : { en: value.en }),
  });
}

function assertHttpsUrl(value, label) {
  assert(typeof value === "string", `${label}はHTTPS URLである必要があります`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(`${label}はHTTPS URLである必要があります`);
  }
  assert(
    parsed.protocol === "https:" && !parsed.username && !parsed.password,
    `${label}は認証情報なしのHTTPS URLである必要があります`,
  );
  return value;
}

function assertSha256(value, label) {
  assert(typeof value === "string" && SHA256_PATTERN.test(value), `${label}は小文字64桁のSHA-256である必要があります`);
  return value;
}

function extensionOf(fileName) {
  const index = fileName.lastIndexOf(".");
  assert(index > 0, `ファイル名の拡張子がありません: ${fileName}`);
  return fileName.slice(index).toLowerCase();
}

function assertSafeRelativePath(value, label) {
  assert(typeof value === "string" && value.length > 0, `${label}が不正です`);
  assert(!value.startsWith("/") && !/^[A-Za-z]:/u.test(value), `${label}に絶対パスは使えません`);
  assert(!value.includes("\\"), `${label}にbackslashは使えません`);
  assert(!value.includes(".."), `${label}にpath traversalは使えません`);
  assert(!FORBIDDEN_PATH_CHARS.test(value), `${label}に禁止文字またはURL断片があります`);
  assert(!/^[a-z][a-z0-9+.-]*:/iu.test(value), `${label}にURLスキームは使えません`);
  return value;
}

function assertAssetScopedPath(value, label, prefix, assetId, fileName) {
  const path = assertSafeRelativePath(value, label);
  const expected = `${prefix}${assetId}/${fileName}`;
  assert(path === expected, `${label}は${expected}形式である必要があります`);
  const ext = extensionOf(fileName);
  assert(!FORBIDDEN_EXTENSIONS.includes(ext), `${label}の拡張子は禁止されています`);
  return path;
}

function assertPublicPath(value, label, assetId, fileName) {
  assert(typeof value === "string" && value.length > 0, `${label}が不正です`);
  assert(value.startsWith(PUBLIC_PREFIX), `${label}は${PUBLIC_PREFIX}配下である必要があります`);
  assert(!value.includes("\\"), `${label}にbackslashは使えません`);
  assert(!value.includes(".."), `${label}にpath traversalは使えません`);
  assert(!value.includes(":") && !value.includes("?") && !value.includes("#"), `${label}にURL断片は使えません`);
  assert(!value.includes("@"), `${label}に認証情報断片は使えません`);
  const expected = `${PUBLIC_PREFIX}${assetId}/${fileName}`;
  assert(value === expected, `${label}は${expected}形式である必要があります`);
  const ext = extensionOf(fileName);
  assert(!FORBIDDEN_EXTENSIONS.includes(ext), `${label}の拡張子は禁止されています`);
  assert(ext === ".png" || ext === ".webp", `${label}はpngまたはwebpのみです`);
  return value;
}

function expectedDerivedDimensions(crop) {
  if (crop.rotationDegrees === 90 || crop.rotationDegrees === 270) {
    return { width: crop.height, height: crop.width };
  }
  return { width: crop.width, height: crop.height };
}

function validateOriginalFile(raw, label, assetId) {
  const value = assertObject(raw, label, ORIGINAL_FILE_KEYS);
  for (const key of ORIGINAL_FILE_KEYS) assert(Object.hasOwn(value, key), `${label}.${key}がありません`);
  assert(
    typeof value.fileName === "string" && SAFE_FILE_NAME_PATTERN.test(value.fileName),
    `${label}.fileNameが不正です`,
  );
  assert(
    REFERENCE_ASSET_ORIGINAL_MIME_TYPES.includes(value.mimeType),
    `${label}.mimeTypeが不正です`,
  );
  const ext = extensionOf(value.fileName);
  assert(
    ORIGINAL_MIME_EXTENSIONS[value.mimeType].includes(ext),
    `${label}: mimeTypeと拡張子が一致しません`,
  );
  const width = assertInteger(value.width, `${label}.width`, 1, 100000);
  const height = assertInteger(value.height, `${label}.height`, 1, 100000);
  const bytes = assertInteger(value.bytes, `${label}.bytes`, 1, 2_000_000_000);
  const sha256 = assertSha256(value.sha256, `${label}.sha256`);
  const rawPath = assertAssetScopedPath(value.rawPath, `${label}.rawPath`, RAW_PREFIX, assetId, value.fileName);
  assert(rawPath.startsWith(RAW_PREFIX), `${label}.rawPathはdata-raw配下である必要があります`);
  return Object.freeze({
    fileName: value.fileName,
    mimeType: value.mimeType,
    width,
    height,
    bytes,
    sha256,
    rawPath,
  });
}

function validateCrop(raw, label, originalFile) {
  const crop = assertObject(raw, label, CROP_KEYS);
  for (const key of CROP_KEYS) assert(Object.hasOwn(crop, key), `${label}.${key}がありません`);
  const sourceWidth = assertInteger(crop.sourceWidth, `${label}.sourceWidth`, 1, 100000);
  const sourceHeight = assertInteger(crop.sourceHeight, `${label}.sourceHeight`, 1, 100000);
  assert(sourceWidth === originalFile.width, `${label}.sourceWidthは原画像幅と一致する必要があります`);
  assert(sourceHeight === originalFile.height, `${label}.sourceHeightは原画像高さと一致する必要があります`);
  const x = assertInteger(crop.x, `${label}.x`, 0, sourceWidth);
  const y = assertInteger(crop.y, `${label}.y`, 0, sourceHeight);
  const width = assertInteger(crop.width, `${label}.width`, 1, sourceWidth);
  const height = assertInteger(crop.height, `${label}.height`, 1, sourceHeight);
  assert(x + width <= sourceWidth, `${label}: cropが元画像幅の外側です`);
  assert(y + height <= sourceHeight, `${label}: cropが元画像高さの外側です`);
  assert(
    REFERENCE_ASSET_ROTATIONS.includes(crop.rotationDegrees),
    `${label}.rotationDegreesは0/90/180/270のみです`,
  );
  return Object.freeze({
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
    rotationDegrees: crop.rotationDegrees,
  });
}

function validateDerivedFile(raw, label, assetId, crop, originalSha, publicationStatus) {
  const value = assertObject(raw, label, DERIVED_FILE_KEYS);
  for (const key of DERIVED_FILE_KEYS) {
    if (key === "publicPath") continue;
    assert(Object.hasOwn(value, key), `${label}.${key}がありません`);
  }
  assert(
    REFERENCE_ASSET_DERIVED_MIME_TYPES.includes(value.mimeType),
    `${label}.mimeTypeはpngまたはwebpのみです`,
  );
  const width = assertInteger(value.width, `${label}.width`, 1, 100000);
  const height = assertInteger(value.height, `${label}.height`, 1, 100000);
  const bytes = assertInteger(value.bytes, `${label}.bytes`, 1, 2_000_000_000);
  const sha256 = assertSha256(value.sha256, `${label}.sha256`);
  assert(sha256 !== originalSha, `${label}.sha256は原画像SHAと同一にできません`);
  const expected = expectedDerivedDimensions(crop);
  assert(width === expected.width, `${label}.widthがcrop/rotation後の期待寸法と一致しません`);
  assert(height === expected.height, `${label}.heightがcrop/rotation後の期待寸法と一致しません`);

  assert(typeof value.derivedPath === "string", `${label}.derivedPathが不正です`);
  const derivedFileName = value.derivedPath.split("/").at(-1);
  assert(
    typeof derivedFileName === "string" && SAFE_FILE_NAME_PATTERN.test(derivedFileName),
    `${label}.derivedPathのファイル名が不正です`,
  );
  const derivedExt = extensionOf(derivedFileName);
  assert(
    DERIVED_MIME_EXTENSIONS[value.mimeType].includes(derivedExt),
    `${label}: mimeTypeと拡張子が一致しません`,
  );
  const derivedPath = assertAssetScopedPath(
    value.derivedPath,
    `${label}.derivedPath`,
    DERIVED_PREFIX,
    assetId,
    derivedFileName,
  );
  assert(derivedPath.startsWith(DERIVED_PREFIX), `${label}.derivedPathはdata-derived配下である必要があります`);
  assert(
    !derivedPath.startsWith(PUBLIC_PREFIX) && !derivedPath.startsWith("public/"),
    `${label}.derivedPathをpublicPathにできません`,
  );

  let publicPath;
  if (value.publicPath !== undefined) {
    assert(
      publicationStatus === "published",
      `${label}.publicPathはpublished以外では禁止です`,
    );
    publicPath = assertPublicPath(value.publicPath, `${label}.publicPath`, assetId, derivedFileName);
  }
  if (publicationStatus === "published") {
    assert(publicPath !== undefined, `${label}.publicPathはpublishedで必須です`);
  }

  return Object.freeze({
    mimeType: value.mimeType,
    width,
    height,
    bytes,
    sha256,
    derivedPath,
    ...(publicPath === undefined ? {} : { publicPath }),
  });
}

function validateAsset(raw, index) {
  const label = `assets[${index}]`;
  const value = assertObject(raw, label, ASSET_KEYS);
  for (const key of ASSET_KEYS) {
    if (key === "derivedFile") continue;
    assert(Object.hasOwn(value, key), `${label}.${key}がありません`);
  }

  const id = assertId(value.id, `${label}.id`);
  const sourceId = assertId(value.sourceId, `${label}.sourceId`);
  const title = validateReferenceAssetLocalizedText(value.title, `${label}.title`);
  const description = validateReferenceAssetLocalizedText(value.description, `${label}.description`);
  assert(
    REFERENCE_ASSET_RIGHTS_STATUSES.includes(value.rightsReviewStatus),
    `${label}.rightsReviewStatusが不正です`,
  );
  assert(
    REFERENCE_ASSET_TECHNICAL_STATUSES.includes(value.technicalReviewStatus),
    `${label}.technicalReviewStatusが不正です`,
  );
  assert(
    REFERENCE_ASSET_PUBLICATION_STATUSES.includes(value.publicationStatus),
    `${label}.publicationStatusが不正です`,
  );
  assert(
    typeof value.licenseCode === "string" && LICENSE_CODE_PATTERN.test(value.licenseCode),
    `${label}.licenseCodeが不正です`,
  );
  const licenseUrl = assertHttpsUrl(value.licenseUrl, `${label}.licenseUrl`);
  const attribution = validateReferenceAssetLocalizedText(value.attribution, `${label}.attribution`);
  const derivativeDisclosure = validateReferenceAssetLocalizedText(
    value.derivativeDisclosure,
    `${label}.derivativeDisclosure`,
  );
  const commercialUseAllowed = assertBoolean(value.commercialUseAllowed, `${label}.commercialUseAllowed`);
  const redistributionAllowed = assertBoolean(value.redistributionAllowed, `${label}.redistributionAllowed`);
  const modificationAllowed = assertBoolean(value.modificationAllowed, `${label}.modificationAllowed`);
  const croppingAllowed = assertBoolean(value.croppingAllowed, `${label}.croppingAllowed`);
  const originalFile = validateOriginalFile(value.originalFile, `${label}.originalFile`, id);
  assert(
    !originalFile.rawPath.startsWith(PUBLIC_PREFIX) && !originalFile.rawPath.startsWith("public/"),
    `${label}.originalFile.rawPathをpublicPathにできません`,
  );
  const crop = validateCrop(value.crop, `${label}.crop`, originalFile);

  assert(Array.isArray(value.removedElements), `${label}.removedElementsは配列である必要があります`);
  const removedElements = value.removedElements.map((element, elementIndex) => {
    assert(
      REFERENCE_ASSET_REMOVED_ELEMENTS.includes(element),
      `${label}.removedElements[${elementIndex}]が不正です`,
    );
    return element;
  });
  assert(new Set(removedElements).size === removedElements.length, `${label}.removedElementsに重複があります`);
  const preservesHistoricalContent = assertBoolean(
    value.preservesHistoricalContent,
    `${label}.preservesHistoricalContent`,
  );
  const cropReviewNote = validateReferenceAssetLocalizedText(
    value.cropReviewNote,
    `${label}.cropReviewNote`,
  );

  if (value.technicalReviewStatus === "approved" || value.publicationStatus === "published") {
    assert(
      preservesHistoricalContent === true,
      `${label}: technical approved / publishedにはpreservesHistoricalContent=trueが必要です`,
    );
  }
  if (!preservesHistoricalContent) {
    assert(
      value.publicationStatus === "candidate" || value.publicationStatus === "shortlisted",
      `${label}: 歴史情報非保持の資料はcandidateまたはshortlistedに留めてください`,
    );
    assert(
      value.technicalReviewStatus !== "approved",
      `${label}: 歴史情報非保持の資料をtechnical approvedにできません`,
    );
  }

  let derivedFile;
  if (value.derivedFile !== undefined) {
    derivedFile = validateDerivedFile(
      value.derivedFile,
      `${label}.derivedFile`,
      id,
      crop,
      originalFile.sha256,
      value.publicationStatus,
    );
  }

  if (value.publicationStatus === "published") {
    assert(value.rightsReviewStatus === "approved", `${label}: publishedにはrightsReviewStatus=approvedが必要です`);
    assert(
      value.technicalReviewStatus === "approved",
      `${label}: publishedにはtechnicalReviewStatus=approvedが必要です`,
    );
    assert(commercialUseAllowed === true, `${label}: publishedにはcommercialUseAllowed=trueが必要です（広告・寄付利用を含む）`);
    assert(redistributionAllowed === true, `${label}: publishedにはredistributionAllowed=trueが必要です`);
    assert(modificationAllowed === true, `${label}: publishedにはmodificationAllowed=trueが必要です（NC/NDは不可）`);
    assert(croppingAllowed === true, `${label}: publishedにはcroppingAllowed=trueが必要です`);
    assert(derivedFile !== undefined, `${label}: publishedにはderivedFileが必要です`);
    assert(derivedFile.publicPath !== undefined, `${label}: publishedにはpublicPathが必要です`);
    assert(preservesHistoricalContent === true, `${label}: publishedにはpreservesHistoricalContent=trueが必要です`);
  } else if (derivedFile?.publicPath !== undefined) {
    fail(`${label}: published以外ではpublicPathを持てません`);
  }

  return Object.freeze({
    id,
    sourceId,
    title,
    description,
    rightsReviewStatus: value.rightsReviewStatus,
    technicalReviewStatus: value.technicalReviewStatus,
    publicationStatus: value.publicationStatus,
    licenseCode: value.licenseCode,
    licenseUrl,
    attribution,
    derivativeDisclosure,
    commercialUseAllowed,
    redistributionAllowed,
    modificationAllowed,
    croppingAllowed,
    originalFile,
    crop,
    removedElements: Object.freeze(removedElements),
    preservesHistoricalContent,
    cropReviewNote,
    ...(derivedFile === undefined ? {} : { derivedFile }),
  });
}

export function validateHistoricalReferenceAssetCatalog(value) {
  const catalog = assertObject(value, "歴史参考画像台帳", ROOT_KEYS);
  assert(
    catalog.schemaVersion === HISTORICAL_REFERENCE_ASSET_SCHEMA_VERSION,
    "歴史参考画像台帳schemaVersionは1である必要があります",
  );
  assert(
    HISTORICAL_REFERENCE_ASSET_CATALOG_STATUSES.includes(catalog.catalogStatus),
    "歴史参考画像台帳catalogStatusが不正です",
  );
  assert(
    catalog.reviewedAt === null ||
      (typeof catalog.reviewedAt === "string" && DATE_PATTERN.test(catalog.reviewedAt)),
    "歴史参考画像台帳reviewedAtが不正です",
  );
  assert(Array.isArray(catalog.assets), "歴史参考画像台帳assetsは配列である必要があります");

  if (catalog.catalogStatus === "empty-foundation") {
    assert(catalog.assets.length === 0, "empty-foundationではassetsを空にする必要があります");
  }
  if (catalog.catalogStatus === "reviewed") {
    assert(
      typeof catalog.reviewedAt === "string" && DATE_PATTERN.test(catalog.reviewedAt),
      "reviewedではreviewedAtが必須です",
    );
  }

  const assets = catalog.assets.map(validateAsset);
  const ids = assets.map((asset) => asset.id);
  assert(new Set(ids).size === ids.length, "歴史参考画像台帳のidが重複しています");

  return Object.freeze({
    schemaVersion: HISTORICAL_REFERENCE_ASSET_SCHEMA_VERSION,
    catalogStatus: catalog.catalogStatus,
    reviewedAt: catalog.reviewedAt,
    assets: Object.freeze(assets),
  });
}

export function loadHistoricalReferenceAssetCatalog(root) {
  const path = join(root, CATALOG_RELATIVE_PATH);
  assert(existsSync(path), `${CATALOG_RELATIVE_PATH}がありません`);
  return validateHistoricalReferenceAssetCatalog(JSON.parse(readFileSync(path, "utf8")));
}

export function summarizeHistoricalReferenceAssetCatalog(catalog) {
  return Object.freeze({
    schemaVersion: catalog.schemaVersion,
    catalogStatus: catalog.catalogStatus,
    assetCount: catalog.assets.length,
    publishedCount: catalog.assets.filter((asset) => asset.publicationStatus === "published").length,
    approvedRightsCount: catalog.assets.filter((asset) => asset.rightsReviewStatus === "approved").length,
    runtimeConnected: false,
  });
}

function collectFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  let rootStat;
  try {
    rootStat = lstatSync(dir);
  } catch {
    return out;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let entryStat;
    try {
      entryStat = lstatSync(full);
    } catch {
      continue;
    }
    if (entryStat.isSymbolicLink()) continue;
    if (entryStat.isDirectory()) collectFiles(full, out);
    else if (entryStat.isFile()) out.push(full);
  }
  return out;
}

function hasRuntimeSourceExtension(filePath) {
  return RUNTIME_SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension));
}

export function findRuntimeHistoricalReferenceAssetReferences(root) {
  const srcRoot = join(root, "src");
  const hits = [];
  for (const file of collectFiles(srcRoot)) {
    const normalized = relative(root, file).replace(/\\/gu, "/");
    if (!normalized.startsWith("src/") || !hasRuntimeSourceExtension(normalized)) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const needle of RUNTIME_REFERENCE_ASSET_REFERENCE_NEEDLES) {
      if (content.includes(needle)) {
        hits.push(Object.freeze({ file: normalized, needle }));
        break;
      }
    }
  }
  return Object.freeze(hits);
}

function loadCandidateRightsById(root, errors) {
  const path = join(root, CANDIDATE_RELATIVE_PATH);
  if (!existsSync(path)) {
    errors.push(`${CANDIDATE_RELATIVE_PATH}がありません`);
    return new Map();
  }
  try {
    const registry = JSON.parse(readFileSync(path, "utf8"));
    assert(Array.isArray(registry.candidates), "candidatesは配列である必要があります");
    const map = new Map();
    for (const candidate of registry.candidates) {
      if (typeof candidate?.candidateId === "string") {
        map.set(candidate.candidateId, candidate.rightsReviewStatus);
      }
    }
    return map;
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "候補台帳を解析できません");
    return new Map();
  }
}

function loadDisplayReferenceBindings(root, errors) {
  const path = join(root, DISPLAY_CATALOG_RELATIVE_PATH);
  if (!existsSync(path)) {
    errors.push(`${DISPLAY_CATALOG_RELATIVE_PATH}がありません`);
    return [];
  }
  try {
    const catalog = JSON.parse(readFileSync(path, "utf8"));
    assert(Array.isArray(catalog.maps), "display mapsは配列である必要があります");
    const bindings = [];
    for (const map of catalog.maps) {
      const binding = map?.artifactBinding;
      if (!binding || binding.kind !== "reference-asset") continue;
      bindings.push(
        Object.freeze({
          mapId: map.id,
          assetId: binding.assetId,
          sourceId: map.sourceId,
          publicationStatus: map.publicationStatus,
        }),
      );
    }
    return bindings;
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "表示カタログを解析できません");
    return [];
  }
}

function auditCrossReferences(catalog, candidateRights, displayBindings, errors) {
  if (catalog.assets.length === 0 && displayBindings.length === 0) return;

  const assetsById = new Map(catalog.assets.map((asset) => [asset.id, asset]));

  for (const asset of catalog.assets) {
    if (!candidateRights.has(asset.sourceId)) {
      errors.push(`${asset.id}: sourceId=${asset.sourceId}が候補台帳に存在しません`);
      continue;
    }
    const candidateRightsStatus = candidateRights.get(asset.sourceId);
    if (asset.publicationStatus === "published") {
      if (candidateRightsStatus !== "approved") {
        errors.push(
          `${asset.id}: publishedには候補のrightsReviewStatus=approvedが必要です（候補=${candidateRightsStatus}）`,
        );
      }
    }
    if (
      asset.rightsReviewStatus === "approved" &&
      candidateRightsStatus !== undefined &&
      candidateRightsStatus !== "approved" &&
      candidateRightsStatus !== "pending"
    ) {
      // approved asset vs rejected candidate is a contradiction
    }
    if (
      asset.rightsReviewStatus === "approved" &&
      candidateRightsStatus === "rejected"
    ) {
      errors.push(`${asset.id}: 候補rights=rejectedなのにasset rights=approvedは矛盾です`);
    }
    if (
      asset.rightsReviewStatus === "rejected" &&
      candidateRightsStatus === "approved"
    ) {
      errors.push(`${asset.id}: 候補rights=approvedなのにasset rights=rejectedは矛盾です`);
    }
    if (
      asset.publicationStatus === "published" &&
      asset.rightsReviewStatus === "approved" &&
      candidateRightsStatus === "pending"
    ) {
      errors.push(`${asset.id}: publishedなのに候補rightsがpendingです`);
    }
  }

  const referencedAssetIds = new Set();
  for (const binding of displayBindings) {
    referencedAssetIds.add(binding.assetId);
    const asset = assetsById.get(binding.assetId);
    if (!asset) {
      errors.push(
        `display map ${binding.mapId}: reference-asset assetId=${binding.assetId}が参考画像台帳に存在しません`,
      );
      continue;
    }
    if (binding.publicationStatus === "published" && asset.publicationStatus !== "published") {
      errors.push(
        `display map ${binding.mapId}: published mapはpublished assetのみ参照できます（asset=${asset.publicationStatus}）`,
      );
    }
    if (binding.sourceId !== asset.sourceId) {
      errors.push(
        `display map ${binding.mapId}: sourceIdがassetと一致しません（map=${binding.sourceId}, asset=${asset.sourceId}）`,
      );
    }
  }

  for (const asset of catalog.assets) {
    if (asset.publicationStatus === "published" && !referencedAssetIds.has(asset.id)) {
      errors.push(`${asset.id}: published assetがどのdisplay mapからも参照されていません（orphan）`);
    }
  }
}

export function auditHistoricalReferenceAssetRepository(root) {
  const errors = [];
  let catalog = null;
  try {
    catalog = loadHistoricalReferenceAssetCatalog(root);
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "歴史参考画像台帳を解析できません");
  }

  const publicCatalogPath = join(root, "public", "data", "historical-reference-assets.json");
  if (existsSync(publicCatalogPath)) {
    errors.push("歴史参考画像台帳をpublicへ配信してはいけません");
  }

  const publicAssetDir = join(root, "public", "data", "historical-reference-assets");
  if (existsSync(publicAssetDir)) {
    errors.push("公開参考画像ディレクトリが存在します");
  }

  const publicRasterPath = join(root, "public", "data", "historical-rasters");
  if (existsSync(publicRasterPath)) {
    errors.push("公開古地図ディレクトリが存在します");
  }

  try {
    const runtime = JSON.parse(readFileSync(join(root, "src", "historical-raster-registry.json"), "utf8"));
    if (!Array.isArray(runtime) || runtime.length !== 0) {
      errors.push("本番ラスターレジストリが空ではありません");
    }
  } catch {
    errors.push("本番ラスターレジストリを確認できません");
  }

  for (const relativePath of [
    "public/service-worker.js",
    "public/sw.js",
    "dist/service-worker.js",
    "dist/sw.js",
  ]) {
    if (existsSync(join(root, relativePath))) {
      errors.push(`Service Workerが存在します: ${relativePath}`);
    }
  }

  if (existsSync(join(root, "dist"))) {
    const sourceMapLeak = collectFiles(join(root, "dist")).some((file) =>
      file.replace(/\\/gu, "/").endsWith(".map"),
    );
    if (sourceMapLeak) errors.push("source mapがdistへ混入しています");
  }

  const runtimeHits = findRuntimeHistoricalReferenceAssetReferences(root);
  for (const hit of runtimeHits) {
    errors.push(`runtime(${hit.file})が歴史参考画像台帳を参照しています: ${hit.needle}`);
  }

  const distPath = join(root, "dist");
  if (existsSync(distPath)) {
    const leaked = collectFiles(distPath).some((file) => {
      const normalized = file.replace(/\\/gu, "/");
      return (
        normalized.includes("historical-reference-assets") ||
        normalized.includes("test-fixture-reference-asset")
      );
    });
    if (leaked) errors.push("歴史参考画像台帳またはtest fixtureがdistへ混入しています");
  }

  if (catalog) {
    const candidateRights = loadCandidateRightsById(root, errors);
    const displayBindings = loadDisplayReferenceBindings(root, errors);
    auditCrossReferences(catalog, candidateRights, displayBindings, errors);
  }

  return Object.freeze({ errors: Object.freeze(errors), catalog });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = auditHistoricalReferenceAssetRepository(root);
  if (result.catalog) {
    const summary = summarizeHistoricalReferenceAssetCatalog(result.catalog);
    console.log(
      `歴史参考画像台帳: schema ${summary.schemaVersion}、${summary.assetCount}件、status ${summary.catalogStatus}`,
    );
  }
  for (const message of result.errors) console.error(`ERROR: ${message}`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
