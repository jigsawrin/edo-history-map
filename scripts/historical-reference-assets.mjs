import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
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
export const REFERENCE_ASSET_LICENSE_CATEGORIES = Object.freeze([
  "public-domain",
  "cc0",
  "cc-by",
  "custom-commercial-open",
  "restricted",
  "unknown",
]);

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
  "licenseCategory",
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
const PUBLIC_DIRECTORY_RELATIVE_PATH = "public/data/historical-reference-assets";
const STATIC_MANIFEST_RELATIVE_PATH = "dist/places/manifest.json";
const RUNTIME_SOURCE_EXTENSIONS = Object.freeze([".ts", ".mts", ".js"]);
const PUBLISHED_LICENSE_CATEGORIES = new Set([
  "public-domain",
  "cc0",
  "cc-by",
  "custom-commercial-open",
]);
const RESTRICTED_LICENSE_TOKENS = new Set(["NC", "NONCOMMERCIAL", "ND", "NODERIVATIVES", "ARR"]);

export const RUNTIME_REFERENCE_ASSET_REFERENCE_NEEDLES = Object.freeze([
  "historical-reference-assets",
  "data-curation/historical-reference-assets.json",
  "loadHistoricalReferenceAssetCatalog",
  "validateHistoricalReferenceAssetCatalog",
  "summarizeHistoricalReferenceAssetCatalog",
  "auditHistoricalReferenceAssetRepository",
  "verifyHistoricalReferenceAssetFiles",
  "createHistoricalReferenceAssetStaticManifest",
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

function normalizedLicenseTokens(licenseCode) {
  return licenseCode
    .normalize("NFKC")
    .toUpperCase()
    .split(/[^A-Z0-9]+/u)
    .filter(Boolean);
}

function hasRestrictedLicenseToken(licenseCode) {
  const tokens = normalizedLicenseTokens(licenseCode);
  if (tokens.some((token) => RESTRICTED_LICENSE_TOKENS.has(token))) return true;
  const joined = tokens.join(" ");
  return joined.includes("ALL RIGHTS RESERVED") || joined.includes("NO DERIVATIVES");
}

function hasLicenseTokenSequence(tokens, ...sequence) {
  return tokens.some((token, index) =>
    sequence.every((expected, offset) => tokens[index + offset] === expected),
  );
}

function assertPublishedLicenseConsistency(licenseCategory, licenseCode, label) {
  const tokens = normalizedLicenseTokens(licenseCode);
  const hasCc0 = tokens.includes("CC0");
  const hasCcBy = hasLicenseTokenSequence(tokens, "CC", "BY");
  const hasPublicDomain =
    tokens.includes("PDM") ||
    tokens.includes("PD") ||
    hasLicenseTokenSequence(tokens, "PUBLIC", "DOMAIN");

  if (licenseCategory === "cc0") {
    assert(hasCc0, `${label}: licenseCategory=cc0にはCC0を示すlicenseCodeが必要です`);
  } else if (licenseCategory === "cc-by") {
    assert(hasCcBy && !hasCc0, `${label}: licenseCategory=cc-byにはCC-BYを示すlicenseCodeが必要です`);
  } else if (licenseCategory === "public-domain") {
    assert(
      hasPublicDomain && !hasCc0 && !hasCcBy,
      `${label}: licenseCategory=public-domainには明示的なPD/PDM/Public-DomainのlicenseCodeが必要です`,
    );
  } else if (licenseCategory === "custom-commercial-open") {
    assert(
      !hasCc0 && !hasCcBy && !hasPublicDomain && !tokens.includes("CC"),
      `${label}: custom-commercial-openのlicenseCodeに別licenseCategoryを指定できません`,
    );
  }
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
  assert(
    REFERENCE_ASSET_LICENSE_CATEGORIES.includes(value.licenseCategory),
    `${label}.licenseCategoryが不正です`,
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
    assert(
      PUBLISHED_LICENSE_CATEGORIES.has(value.licenseCategory),
      `${label}: publishedには公開可能なlicenseCategoryが必要です`,
    );
    assert(
      !hasRestrictedLicenseToken(value.licenseCode),
      `${label}: publishedのlicenseCodeにNC/ND/権利留保を指定できません`,
    );
    assertPublishedLicenseConsistency(value.licenseCategory, value.licenseCode, label);
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
    licenseCategory: value.licenseCategory,
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

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function parsePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert(buffer.length >= 33 && buffer.subarray(0, 8).equals(signature), "PNG signatureが不正です");
  assert(buffer.readUInt32BE(8) === 13 && buffer.subarray(12, 16).toString("ascii") === "IHDR", "PNG IHDRが不正です");
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  assert(width > 0 && height > 0, "PNG寸法が不正です");
  return Object.freeze({ mimeType: "image/png", width, height, lossless: true });
}

function parseVp8Dimensions(data) {
  assert(
    data.length > 10 && data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a,
    "lossy WebP VP8 frame headerが不正です",
  );
  const dimensions = Object.freeze({
    width: data.readUInt16LE(6) & 0x3fff,
    height: data.readUInt16LE(8) & 0x3fff,
  });
  assert(dimensions.width > 0 && dimensions.height > 0, "lossy WebP寸法が不正です");
  return dimensions;
}

function parseVp8lDimensions(data) {
  assert(data.length > 5 && data[0] === 0x2f, "lossless WebP VP8L headerが不正です");
  return Object.freeze({
    width: 1 + data[1] + ((data[2] & 0x3f) << 8),
    height: 1 + (data[2] >> 6) + (data[3] << 2) + ((data[4] & 0x0f) << 10),
  });
}

function parseWebp(buffer, { allowLossy }) {
  assert(
    buffer.length >= 20 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP",
    "WebP RIFF/WEBP containerが不正です",
  );
  assert(buffer.readUInt32LE(4) + 8 === buffer.length, "WebP RIFF sizeが実ファイルと一致しません");

  let offset = 12;
  let extendedDimensions = null;
  let image = null;
  while (offset < buffer.length) {
    assert(offset + 8 <= buffer.length, "WebP chunk headerが切れています");
    const type = buffer.subarray(offset, offset + 4).toString("ascii");
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    assert(end <= buffer.length, `WebP ${type} chunkが範囲外です`);
    const data = buffer.subarray(start, end);
    assert(type !== "ANIM" && type !== "ANMF", "animated WebPはreference画像に使用できません");
    if (type === "VP8X") {
      assert(size === 10, "WebP VP8X chunkが不正です");
      assert((data[0] & 0xc3) === 0 && data[1] === 0 && data[2] === 0 && data[3] === 0, "WebP VP8Xの予約bitまたはanimation指定は許可されません");
      extendedDimensions = Object.freeze({
        width: 1 + data.readUIntLE(4, 3),
        height: 1 + data.readUIntLE(7, 3),
      });
    } else if (type === "VP8L") {
      assert(image === null, "WebPに複数の画像data chunkがあります");
      image = Object.freeze({ ...parseVp8lDimensions(data), lossless: true });
    } else if (type === "VP8 ") {
      assert(image === null, "WebPに複数の画像data chunkがあります");
      image = Object.freeze({ ...parseVp8Dimensions(data), lossless: false });
    }
    offset = end + (size % 2);
  }
  assert(offset === buffer.length && image !== null, "WebP画像data chunkがありません");
  if (extendedDimensions) {
    assert(
      image.width === extendedDimensions.width && image.height === extendedDimensions.height,
      "WebP VP8X寸法が画像dataと一致しません",
    );
  }
  assert(allowLossy || image.lossless, "派生reference画像にはlossy WebPを使用できません");
  return Object.freeze({ mimeType: "image/webp", ...image });
}

function parseJpeg(buffer) {
  assert(buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8, "JPEG SOI magic bytesが不正です");
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    assert(offset < buffer.length, "JPEG markerが切れています");
    const marker = buffer[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    assert(offset + 2 <= buffer.length, "JPEG segment lengthが切れています");
    const length = buffer.readUInt16BE(offset);
    assert(length >= 2 && offset + length <= buffer.length, "JPEG segmentが範囲外です");
    if (sofMarkers.has(marker)) {
      assert(length >= 8, "JPEG SOF segmentが不正です");
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      assert(width > 0 && height > 0, "JPEG寸法が不正です");
      return Object.freeze({ mimeType: "image/jpeg", width, height, lossless: false });
    }
    offset += length;
  }
  fail("JPEG SOF markerがありません");
}

function parseImage(buffer, expectedMimeType, { allowLossyWebp }) {
  let parsed;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    parsed = parsePng(buffer);
  } else if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    parsed = parseWebp(buffer, { allowLossy: allowLossyWebp });
  } else if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    parsed = parseJpeg(buffer);
  } else {
    fail(`画像magic bytesを判定できません（期待MIME=${expectedMimeType}）`);
  }
  assert(parsed.mimeType === expectedMimeType, `画像magic bytesとmimeTypeが一致しません（実際=${parsed.mimeType}）`);
  return parsed;
}

function safelyResolveRepositoryPath(root, relativePath, requiredPrefix) {
  const rootPath = resolve(root);
  const fullPath = resolve(rootPath, ...relativePath.split("/"));
  const allowedRoot = resolve(rootPath, ...requiredPrefix.split("/"));
  assert(
    fullPath === allowedRoot || fullPath.startsWith(`${allowedRoot}${sep}`),
    `${relativePath}が許可ディレクトリ外へ解決されます`,
  );
  assert(fullPath.startsWith(`${rootPath}${sep}`), `${relativePath}がrepository外へ解決されます`);
  return fullPath;
}

function lstatIfPresent(path) {
  try {
    return lstatSync(path);
  } catch (cause) {
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return null;
    throw cause;
  }
}

function assertNoSymlinkComponents(root, relativePath) {
  let current = resolve(root);
  const rootStat = lstatSync(current);
  assert(!rootStat.isSymbolicLink() && rootStat.isDirectory(), "repository rootが通常ディレクトリではありません");
  for (const segment of relativePath.split("/")) {
    current = join(current, segment);
    const stat = lstatIfPresent(current);
    if (stat === null) return;
    assert(!stat.isSymbolicLink(), `symlinkは禁止です: ${relativePath}`);
  }
}

function verifyImageFile(root, relativePath, metadata, { required, requiredPrefix, allowLossyWebp, label }) {
  const fullPath = safelyResolveRepositoryPath(root, relativePath, requiredPrefix);
  assertNoSymlinkComponents(root, relativePath);
  const stat = lstatIfPresent(fullPath);
  if (stat === null) {
    assert(!required, `${label}がありません: ${relativePath}`);
    return null;
  }
  assert(!stat.isSymbolicLink() && stat.isFile(), `${label}は通常ファイルである必要があります: ${relativePath}`);
  const buffer = readFileSync(fullPath);
  assert(buffer.length === metadata.bytes && stat.size === metadata.bytes, `${label}のbytesがmetadataと一致しません: ${relativePath}`);
  assert(sha256(buffer) === metadata.sha256, `${label}のSHA-256がmetadataと一致しません: ${relativePath}`);
  const parsed = parseImage(buffer, metadata.mimeType, { allowLossyWebp });
  assert(parsed.width === metadata.width && parsed.height === metadata.height, `${label}の寸法がmetadataと一致しません: ${relativePath}`);
  return Object.freeze({ path: relativePath, sha256: metadata.sha256, bytes: metadata.bytes, width: parsed.width, height: parsed.height, mimeType: parsed.mimeType });
}

function assertTreeContainsNoSymlinks(path, label) {
  const stat = lstatIfPresent(path);
  if (stat === null) return;
  assert(!stat.isSymbolicLink(), `${label}にsymlinkがあります`);
  if (!stat.isDirectory()) return;
  for (const name of readdirSync(path)) assertTreeContainsNoSymlinks(join(path, name), `${label}/${name}`);
}

function verifyPublicDirectory(root, catalog) {
  const published = catalog.assets.filter((asset) => asset.publicationStatus === "published");
  const publicRoot = join(root, ...PUBLIC_DIRECTORY_RELATIVE_PATH.split("/"));
  const publicRootStat = lstatIfPresent(publicRoot);
  if (published.length === 0) {
    assert(publicRootStat === null, `${PUBLIC_DIRECTORY_RELATIVE_PATH}はpublished asset 0件では禁止です`);
    return Object.freeze([]);
  }

  assert(publicRootStat !== null, `${PUBLIC_DIRECTORY_RELATIVE_PATH}がありません`);
  assert(!publicRootStat.isSymbolicLink() && publicRootStat.isDirectory(), `${PUBLIC_DIRECTORY_RELATIVE_PATH}は通常ディレクトリである必要があります`);
  const expected = new Map();
  for (const asset of published) {
    const publicPath = asset.derivedFile.publicPath;
    const relativePath = `public${publicPath}`;
    assert(!expected.has(relativePath), `publicPathが重複しています: ${publicPath}`);
    expected.set(relativePath, asset);
  }
  const expectedDirectoryNames = new Set(published.map((asset) => asset.id));

  const actual = [];
  for (const assetDirectoryName of readdirSync(publicRoot)) {
    assert(!assetDirectoryName.startsWith("."), `公開参考画像に隠し項目は禁止です: ${assetDirectoryName}`);
    assert(expectedDirectoryNames.has(assetDirectoryName), `公開参考画像の余分なassetディレクトリです: ${assetDirectoryName}`);
    const assetDirectory = join(publicRoot, assetDirectoryName);
    const assetDirectoryStat = lstatSync(assetDirectory);
    assert(!assetDirectoryStat.isSymbolicLink() && assetDirectoryStat.isDirectory(), `公開参考画像の余分な階層またはsymlinkです: ${assetDirectoryName}`);
    for (const fileName of readdirSync(assetDirectory)) {
      assert(!fileName.startsWith("."), `公開参考画像に隠し項目は禁止です: ${assetDirectoryName}/${fileName}`);
      const filePath = join(assetDirectory, fileName);
      const fileStat = lstatSync(filePath);
      assert(!fileStat.isSymbolicLink() && fileStat.isFile(), `公開参考画像はid直下の通常ファイルのみです: ${assetDirectoryName}/${fileName}`);
      actual.push(`public/data/historical-reference-assets/${assetDirectoryName}/${fileName}`);
    }
  }

  for (const relativePath of actual) assert(expected.has(relativePath), `公開参考画像orphanを検出しました: ${relativePath}`);
  for (const relativePath of expected.keys()) assert(actual.includes(relativePath), `宣言された公開参考画像がありません: ${relativePath}`);
  return Object.freeze([...expected.keys()]);
}

export function verifyHistoricalReferenceAssetFiles(root, catalog, options = {}) {
  const requireRawFiles = options.requireRawFiles === true;
  const requireDerivedFiles = options.requireDerivedFiles === true;
  const requirePublicFiles = options.requirePublicFiles === true;
  assertTreeContainsNoSymlinks(join(root, "data-raw", "historical-reference-assets"), "data-raw/historical-reference-assets");
  assertTreeContainsNoSymlinks(join(root, "data-derived", "historical-reference-assets"), "data-derived/historical-reference-assets");
  const rawFiles = [];
  const derivedFiles = [];
  const publicFiles = requirePublicFiles ? verifyPublicDirectory(root, catalog) : [];
  for (const asset of catalog.assets) {
    const raw = verifyImageFile(root, asset.originalFile.rawPath, asset.originalFile, {
      required: requireRawFiles && asset.rightsReviewStatus !== "rejected",
      requiredPrefix: "data-raw/historical-reference-assets",
      allowLossyWebp: true,
      label: "raw原画像",
    });
    if (raw) rawFiles.push(raw);
    if (!asset.derivedFile) continue;
    const derived = verifyImageFile(root, asset.derivedFile.derivedPath, asset.derivedFile, {
      required: requireDerivedFiles,
      requiredPrefix: "data-derived/historical-reference-assets",
      allowLossyWebp: false,
      label: "derivedローカル画像",
    });
    if (derived) derivedFiles.push(derived);
    if (asset.publicationStatus !== "published" || !requirePublicFiles) continue;
    const publicRelativePath = `public${asset.derivedFile.publicPath}`;
    const publicFile = verifyImageFile(root, publicRelativePath, asset.derivedFile, {
      required: true,
      requiredPrefix: PUBLIC_DIRECTORY_RELATIVE_PATH,
      allowLossyWebp: false,
      label: "published public画像",
    });
    if (derived) {
      assert(
        derived.sha256 === publicFile.sha256 && derived.bytes === publicFile.bytes && derived.width === publicFile.width && derived.height === publicFile.height && derived.mimeType === publicFile.mimeType,
        `${asset.id}: derivedローカル画像とpublic画像が一致しません`,
      );
    }
  }
  return Object.freeze({ rawFiles: Object.freeze(rawFiles), derivedFiles: Object.freeze(derivedFiles), publicFiles });
}

export function createHistoricalReferenceAssetStaticManifest(catalog) {
  const files = catalog.assets
    .filter((asset) => asset.publicationStatus === "published")
    .map((asset) => Object.freeze({
      publicPath: asset.derivedFile.publicPath,
      sha256: asset.derivedFile.sha256,
      bytes: asset.derivedFile.bytes,
    }))
    .sort((left, right) => left.publicPath.localeCompare(right.publicPath, "en"));
  return Object.freeze({ schemaVersion: 1, assetCount: files.length, files: Object.freeze(files) });
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

function loadCandidatesById(root, errors) {
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
        assert(REFERENCE_ASSET_RIGHTS_STATUSES.includes(candidate.rightsReviewStatus), `${candidate.candidateId}: 候補rightsReviewStatusが不正です`);
        assert(Array.isArray(candidate.intendedUses), `${candidate.candidateId}: 候補intendedUsesが不正です`);
        for (const field of ["commercialUseCompatible", "redistributionAllowed", "modificationAllowed", "croppingAllowed"]) {
          assert(candidate[field] === null || typeof candidate[field] === "boolean", `${candidate.candidateId}: 候補${field}が不正です`);
        }
        assert(Array.isArray(candidate.rightsEvidenceUrls), `${candidate.candidateId}: 候補rightsEvidenceUrlsが不正です`);
        map.set(candidate.candidateId, Object.freeze({
          rightsReviewStatus: candidate.rightsReviewStatus,
          intendedUses: Object.freeze([...candidate.intendedUses]),
          commercialUseCompatible: candidate.commercialUseCompatible,
          redistributionAllowed: candidate.redistributionAllowed,
          modificationAllowed: candidate.modificationAllowed,
          croppingAllowed: candidate.croppingAllowed,
          rightsEvidenceUrls: Array.isArray(candidate.rightsEvidenceUrls) ? Object.freeze([...candidate.rightsEvidenceUrls]) : Object.freeze([]),
        }));
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

function auditCrossReferences(catalog, candidates, displayBindings, errors) {
  if (catalog.assets.length === 0 && displayBindings.length === 0) return;

  const assetsById = new Map(catalog.assets.map((asset) => [asset.id, asset]));
  const publishedReferenceAssetIds = new Set();

  for (const asset of catalog.assets) {
    if (!candidates.has(asset.sourceId)) {
      errors.push(`${asset.id}: sourceId=${asset.sourceId}が候補台帳に存在しません`);
      continue;
    }
    const candidate = candidates.get(asset.sourceId);
    if (!candidate.intendedUses.includes("reference-panel")) {
      errors.push(`${asset.id}: source candidateにintendedUses=reference-panelがありません`);
    }
    const candidateRightsStatus = candidate.rightsReviewStatus;
    if (asset.publicationStatus === "published") {
      if (candidateRightsStatus !== "approved") {
        errors.push(
          `${asset.id}: publishedには候補のrightsReviewStatus=approvedが必要です（候補=${candidateRightsStatus}）`,
        );
      }
    }
    const statusRank = Object.freeze({ rejected: 0, pending: 1, approved: 2 });
    if (statusRank[asset.rightsReviewStatus] > statusRank[candidateRightsStatus]) {
      errors.push(`${asset.id}: asset rights=${asset.rightsReviewStatus}が候補rights=${candidateRightsStatus}を超えています`);
    }
    for (const [assetField, candidateField] of [
      ["commercialUseAllowed", "commercialUseCompatible"],
      ["redistributionAllowed", "redistributionAllowed"],
      ["modificationAllowed", "modificationAllowed"],
      ["croppingAllowed", "croppingAllowed"],
    ]) {
      if (asset[assetField] === true && candidate[candidateField] !== true) {
        errors.push(`${asset.id}: asset ${assetField}=trueが候補${candidateField}=${candidate[candidateField]}を超えています`);
      }
    }
    if (asset.publicationStatus === "published") {
      for (const candidateField of ["commercialUseCompatible", "redistributionAllowed", "modificationAllowed", "croppingAllowed"]) {
        if (candidate[candidateField] !== true) errors.push(`${asset.id}: publishedには候補${candidateField}=trueが必要です`);
      }
      if (asset.licenseCategory === "custom-commercial-open" && candidate.rightsEvidenceUrls.length === 0) {
        errors.push(`${asset.id}: custom-commercial-openには候補台帳のrights evidenceが必要です`);
      }
    }
  }

  for (const binding of displayBindings) {
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
    if (
      binding.publicationStatus === "published" &&
      asset.publicationStatus === "published" &&
      binding.sourceId === asset.sourceId
    ) {
      publishedReferenceAssetIds.add(asset.id);
    }
  }

  for (const asset of catalog.assets) {
    if (asset.publicationStatus === "published" && !publishedReferenceAssetIds.has(asset.id)) {
      errors.push(
        `${asset.id}: published assetはsourceIdが一致するpublished display mapからreference-asset参照される必要があります（orphan）`,
      );
    }
  }
}

function readGitTrackedPaths(root) {
  try {
    const inside = execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (inside !== "true") return null;
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(output.split("\0").filter(Boolean).map((path) => path.replace(/\\/gu, "/")));
  } catch {
    return null;
  }
}

function isGitIgnored(root, relativePath) {
  try {
    execFileSync("git", ["check-ignore", "--no-index", "--quiet", "--", relativePath], {
      cwd: root,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function auditGitState(root, catalog, errors) {
  const tracked = readGitTrackedPaths(root);
  if (tracked === null) return;
  for (const probe of [
    "data-raw/historical-reference-assets/.audit-ignore-probe",
    "data-derived/historical-reference-assets/.audit-ignore-probe",
  ]) {
    if (!isGitIgnored(root, probe)) errors.push(`${probe}が.gitignoreで保護されていません`);
  }
  for (const asset of catalog.assets) {
    if (tracked.has(asset.originalFile.rawPath)) errors.push(`${asset.id}: rawPathがGit追跡されています`);
    if (asset.derivedFile && tracked.has(asset.derivedFile.derivedPath)) errors.push(`${asset.id}: derivedPathがGit追跡されています`);
    if (asset.publicationStatus === "published") {
      const publicRelativePath = `public${asset.derivedFile.publicPath}`;
      if (!tracked.has(publicRelativePath)) errors.push(`${asset.id}: published publicPathがGit追跡されていません`);
    }
  }
}

function auditStaticManifest(root, catalog, errors) {
  const expected = createHistoricalReferenceAssetStaticManifest(catalog);
  const manifestPath = join(root, ...STATIC_MANIFEST_RELATIVE_PATH.split("/"));
  if (expected.assetCount === 0) {
    if (!existsSync(manifestPath)) return;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (Object.hasOwn(manifest, "historicalReferenceAssets")) {
        errors.push("static manifestにreference asset orphan entryがあります");
      }
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : "static manifestを解析できません");
    }
    return;
  }
  if (!existsSync(manifestPath)) {
    errors.push(`${STATIC_MANIFEST_RELATIVE_PATH}がありません`);
    return;
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const actual = manifest.historicalReferenceAssets;
    assert(actual && actual.schemaVersion === 1, "static manifestのhistoricalReferenceAssetsがありません");
    assert(actual.assetCount === expected.assetCount && Array.isArray(actual.files), "static manifestのreference asset件数が一致しません");
    const actualPaths = actual.files.map((file) => file?.publicPath);
    assert(new Set(actualPaths).size === actualPaths.length, "static manifestのreference asset publicPathが重複しています");
    assert(actual.files.length === expected.files.length, "static manifestにreference asset orphan entryがあります");
    const actualByPath = new Map(actual.files.map((file) => [file?.publicPath, file]));
    for (const expectedFile of expected.files) {
      const actualFile = actualByPath.get(expectedFile.publicPath);
      assert(actualFile, `static manifestにpublicPathがありません: ${expectedFile.publicPath}`);
      assert(actualFile.sha256 === expectedFile.sha256, `static manifestのSHA-256が一致しません: ${expectedFile.publicPath}`);
      assert(actualFile.bytes === expectedFile.bytes, `static manifestのbytesが一致しません: ${expectedFile.publicPath}`);
    }
    for (const actualPath of actualByPath.keys()) {
      assert(expected.files.some((file) => file.publicPath === actualPath), `static manifestにorphan entryがあります: ${actualPath}`);
    }
  } catch (cause) {
    errors.push(cause instanceof Error ? cause.message : "static manifestを解析できません");
  }
}

export function auditHistoricalReferenceAssetRepository(root, options = {}) {
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
    const allowedPublishedDistPaths = new Set(
      (catalog?.assets ?? [])
        .filter((asset) => asset.publicationStatus === "published")
        .map((asset) => `dist${asset.derivedFile.publicPath}`),
    );
    const leaked = collectFiles(distPath).some((file) => {
      const normalized = relative(root, file).replace(/\\/gu, "/");
      return (
        (normalized.includes("historical-reference-assets") && !allowedPublishedDistPaths.has(normalized)) ||
        normalized.includes("test-fixture-reference-asset")
      );
    });
    if (leaked) errors.push("歴史参考画像台帳またはtest fixtureがdistへ混入しています");
  }

  if (catalog) {
    try {
      verifyHistoricalReferenceAssetFiles(root, catalog, {
        requireRawFiles: options.verifyLocal === true,
        requireDerivedFiles: options.verifyLocal === true,
        requirePublicFiles: true,
      });
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : "歴史参考画像の実ファイルを検証できません");
    }
    const candidates = loadCandidatesById(root, errors);
    const displayBindings = loadDisplayReferenceBindings(root, errors);
    auditCrossReferences(catalog, candidates, displayBindings, errors);
    auditGitState(root, catalog, errors);
    auditStaticManifest(root, catalog, errors);
  }

  return Object.freeze({ errors: Object.freeze(errors), catalog });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const verifyLocal = process.argv.includes("--verify-local");
  const result = auditHistoricalReferenceAssetRepository(root, { verifyLocal });
  if (result.catalog) {
    const summary = summarizeHistoricalReferenceAssetCatalog(result.catalog);
    console.log(
      `歴史参考画像台帳: schema ${summary.schemaVersion}、${summary.assetCount}件、status ${summary.catalogStatus}`,
    );
    if (verifyLocal && result.errors.length === 0) console.log(`歴史参考画像ローカル実ファイル検証: ${summary.assetCount}件成功`);
  }
  for (const message of result.errors) console.error(`ERROR: ${message}`);
  process.exit(result.errors.length === 0 ? 0 : 1);
}
