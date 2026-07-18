/**
 * 公開前監査スクリプト。
 * プロジェクト全体(Git追跡・未追跡・ビルド成果物・Git履歴・CI設定)を検査し、
 * audit/prepublish-report.md へレポートを生成する。
 *
 * - 検出値はマスキングし、レポートに秘密の実値・個人情報・絶対パスを残さない
 * - エラーが1件でもあれば exit code 1(公開ゲート不合格)
 *
 * 使い方: node scripts/prepublish-audit.mjs
 */
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
  readdirSync,
} from "node:fs";
import { join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { URL } from "node:url";
import { buildKyotoGeoJson } from "./build-kyoto-bakumatsu-places.mjs";
import { buildShigaGeoJson } from "./build-shiga-sengoku-places.mjs";
import { auditStaticPlaceLinks } from "./audit-static-place-links.mjs";
import { validateHistoricalThemeData } from "./build-static-theme-pages.mjs";
import { validateTimelineData } from "./build-static-timeline-pages.mjs";

const ROOT = process.cwd();
const findings = []; // {severity, category, file, line, note}
const infos = [];

function addFinding(severity, category, file, line, note) {
  findings.push({ severity, category, file, line, note });
}

/** 値のマスキング: 先頭2文字だけ残す */
function mask(s) {
  const t = String(s);
  return t.length <= 4 ? "****" : t.slice(0, 2) + "*".repeat(Math.min(t.length - 2, 12));
}

function git(...args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 256,
    });
  } catch {
    return null;
  }
}

// ---- 検査対象ファイルの列挙 -------------------------------------------------

const EXCLUDE_DIRS = new Set([
  ".git",
  ".claude",
  "node_modules",
  "audit",
  "coverage",
  "data-raw",
]);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).replace(new RegExp("\\\\", "g"), "/");
    const top = rel.split("/")[0];
    if (EXCLUDE_DIRS.has(top)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push({ rel, size: st.size });
  }
  return out;
}

const allFiles = walk(ROOT, []);
const trackedRaw = git("ls-files");
const tracked = trackedRaw ? trackedRaw.split("\n").filter(Boolean) : [];

// ---- パターン定義(自己一致を避けるため文字列連結で構築) --------------------

const P = (s, flags = "g") => new RegExp(s, flags);
const SECRET_PATTERNS = [
  ["GitHub token", P("gh" + "[pousr]_[A-Za-z0-9]{20,}")],
  ["GitHub PAT (fine-grained)", P("github" + "_pat_[A-Za-z0-9_]{20,}")],
  ["AWS key", P("AK" + "IA[0-9A-Z]{16}")],
  ["Google API key", P("AI" + "za[0-9A-Za-z_-]{30,}")],
  ["Slack token", P("xo" + "x[baprs]-[0-9A-Za-z-]{10,}")],
  ["秘密鍵", P("-----BEGIN [A-Z ]*" + "PRIVATE KEY-----")],
  ["JWT らしき文字列", P("eyJ" + "[A-Za-z0-9_-]{20,}\\.eyJ[A-Za-z0-9_-]{20,}")],
  ["Authorization ヘッダー", P("Authorization\\s*[:=]\\s*['\"]?(Bearer|Basic)\\s+[A-Za-z0-9+/=_-]{8,}", "gi")],
  ["password= 直書き", P("password\\s*[:=]\\s*['\"][^'\"]{4,}['\"]", "gi")],
  ["npm トークン", P("np" + "m_[A-Za-z0-9]{30,}")],
];

/**
 * 公開してよいメールアドレス(個人情報に当たらない公開用アドレス)。
 * - GitHub の noreply アドレス(コミット用の公開識別子)
 * - ツールの定型 Co-Authored-By アドレス
 */
const ALLOWED_EMAILS = P(
  "([A-Za-z0-9._%+-]+@users\\.noreply\\.github\\.com|dependabot\\[bot\\]@users\\.noreply\\.github\\.com|support@github\\.com|noreply@anthropic\\.com)",
);

const PII_PATTERNS = [
  ["メールアドレス", P("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")],
  ["日本の電話番号らしき文字列", P("0\\d{1,4}-\\d{1,4}-\\d{3,4}(?![\\d-])")],
];

const PATH_PATTERNS = [
  ["Windows 絶対パス", P("[A-Za-z]:\\\\(?:Users|home)\\\\[^\\s\"']+", "gi")],
  ["Unix ホームパス", P("(/home/|/Users/)[A-Za-z0-9._-]+")],
  ["ローカルユーザー名", P("nu" + "ies", "gi")],
];

const CODE_PATTERNS = [
  ["eval の使用", P("\\beval\\s*\\(")],
  ["new Function", P("new\\s+Function\\s*\\(")],
  ["innerHTML への代入", P("\\.innerHTML\\s*=")],
  ["document.write", P("document\\.write\\s*\\(")],
  ["Base64 デコード実行らしき記述", P("atob\\s*\\([^)]*\\)\\s*\\)?\\s*(\\)|;)?\\s*(eval|Function)", "g")],
];

/** 許可された外部通信先(https)。これ以外の https URL は警告。 */
const ALLOWED_HOSTS = new Set([
  "cyberjapandata.gsi.go.jp",
  "maps.gsi.go.jp",
  "www.gsi.go.jp",
  "codh.rois.ac.jp",
  "geoshape.ex.nii.ac.jp",
  "creativecommons.org",
  "dl.ndl.go.jp",
  "github.com",
  "jigsawrin.github.io",
  "registry.npmjs.org",
  "docs.github.com",
  "www2.city.kyoto.lg.jp",
  "www.city.kyoto.lg.jp",
  "ja.kyoto.travel",
  "kyoto-museums.city.kyoto.lg.jp",
  "www.pref.kyoto.jp",
  "www.kyoto-arc.or.jp",
  "www.doshisha.ac.jp",
  "kurodani.jp",
  "bunka.nii.ac.jp",
  "shimogyo.city.kyoto.lg.jp",
  "myomanji.jp",
  "www.env.go.jp",
  "policies.env.go.jp",
  "nijo-jocastle.city.kyoto.lg.jp",
  "www.kunaicho.go.jp",
  "rmda.kulib.kyoto-u.ac.jp",
  "www.ndl.go.jp",
  "www.archives.go.jp",
  "ryozen-museum.or.jp",
  "iwakura-tomomi.jp",
  "www.pref.shiga.lg.jp",
  "msearch.gsi.go.jp",
  "www.city.nagahama.lg.jp",
]);

const DANGEROUS_EXT = new Set([
  ".exe", ".dll", ".msi", ".scr", ".bat", ".cmd", ".ps1",
  ".zip", ".7z", ".rar", ".db", ".sqlite", ".gpkg", ".shp", ".shx",
  ".dbf", ".prj", ".cpg", ".qmd", ".pfx", ".p12", ".pem", ".key",
]);

const TEXT_EXT = new Set([
  ".ts", ".js", ".mjs", ".cjs", ".json", ".geojson", ".html", ".css", ".md",
  ".yml", ".yaml", ".txt", ".svg", ".gitignore", ".editorconfig",
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 自分自身(パターン定義を含む)には秘密情報パターン検査を適用しない
const SELF = "scripts/prepublish-audit.mjs";

// 承認済みデータファイル(座標を含むことが正当)
const APPROVED_DATA = new Set([
  "public/data/edo-places.geojson",
  "public/data/edo-machiya-areas.geojson",
  "public/data/edo-coastlines.geojson",
  "public/data/kyoto-bakumatsu-places.geojson",
  "public/data/shiga-sengoku-places.geojson",
]);

const KYOTO_DATASET_ID = "project-kyoto-bakumatsu-places";
const KYOTO_CURATION_FILE = "data-curation/kyoto-bakumatsu-places.json";
const KYOTO_PUBLIC_FILE = "public/data/kyoto-bakumatsu-places.geojson";
const KYOTO_SOURCE_REGISTRY_FILE = "src/kyoto-source-registry.json";
const KYOTO_SOURCE_REGISTRY_CODE = "src/kyoto-source-registry.ts";
const KYOTO_PACK_FILE = "src/regions/kyoto-pack.json";
const EDO_PACK_FILE = "src/regions/edo-pack.json";
const SHIGA_DATASET_ID = "project-shiga-sengoku-places";
const SHIGA_CURATION_FILE = "data-curation/shiga-sengoku-places.json";
const SHIGA_PUBLIC_FILE = "public/data/shiga-sengoku-places.geojson";
const HISTORICAL_THEME_CURATION_FILE = "data-curation/historical-themes.json";
const HISTORICAL_TIMELINE_CURATION_FILE = "data-curation/historical-timeline.json";
const KYOTO_BOUNDS = Object.freeze({
  minLat: 34.85,
  maxLat: 35.12,
  minLon: 135.65,
  maxLon: 135.85,
});
const KYOTO_SOURCE_ALLOWED_ORIGINS = new Set([
  "https://www2.city.kyoto.lg.jp",
  "https://www.city.kyoto.lg.jp",
  "https://ja.kyoto.travel",
  "https://kyoto-museums.city.kyoto.lg.jp",
  "https://www.pref.kyoto.jp",
  "https://www.kyoto-arc.or.jp",
  "https://www.doshisha.ac.jp",
  "https://kurodani.jp",
  "https://bunka.nii.ac.jp",
  "https://shimogyo.city.kyoto.lg.jp",
  "https://myomanji.jp",
  "https://www.env.go.jp",
  "https://policies.env.go.jp",
  "https://nijo-jocastle.city.kyoto.lg.jp",
  "https://www.kunaicho.go.jp",
  "https://rmda.kulib.kyoto-u.ac.jp",
  "https://www.ndl.go.jp",
  "https://dl.ndl.go.jp",
  "https://www.archives.go.jp",
  "https://ryozen-museum.or.jp",
  "https://iwakura-tomomi.jp",
]);

// ---- 1. ファイル単位の検査 --------------------------------------------------

function scanText(rel, content, { isDist = false } = {}) {
  const lines = content.split("\n");
  const apply = (patterns, category, severity) => {
    if (rel === SELF && category === "秘密情報") return;
    for (const [name, re] of patterns) {
      for (let i = 0; i < lines.length; i++) {
        const line =
          category === "個人情報"
            ? lines[i].replace(ALLOWED_EMAILS, "")
            : lines[i];
        re.lastIndex = 0;
        const m = re.exec(line);
        if (m) {
          addFinding(severity, category, rel, i + 1, `${name}: ${mask(m[0])}`);
        }
      }
    }
  };

  apply(SECRET_PATTERNS, "秘密情報", "error");
  if (!APPROVED_DATA.has(rel)) {
    apply(PII_PATTERNS, "個人情報", "error");
    apply(PATH_PATTERNS, "パス/ユーザー名", "error");
  }
  if (!isDist && rel !== SELF && !rel.startsWith("tests/")) {
    // eslint 設定やテストは "innerHTML" という文字列自体を含むため除外し、
    // ソース(src/, scripts/)にのみ適用
    if (rel.startsWith("src/") || (rel.startsWith("scripts/") && rel !== SELF)) {
      apply(CODE_PATTERNS, "危険なコード", "error");
    }
  }

  // http:// 平文通信(localhost 以外)。
  // tests/ は「http を拒否すること」を検証する意図的なテストデータを含むため除外。
  if (!rel.startsWith("tests/")) {
    const httpRe = P("http://(?!localhost|127\\.0\\.0\\.1|www\\.w3\\.org|schemas\\.)[A-Za-z0-9.-]+");
    for (let i = 0; i < lines.length; i++) {
      httpRe.lastIndex = 0;
      const m = httpRe.exec(lines[i]);
      if (m) addFinding("error", "平文HTTP", rel, i + 1, mask(m[0]));
    }
  }

  // 外部 https ホストの許可リスト検査。
  // package-lock.json の funding/homepage メタデータと、tests/ の
  // 「拒否されること」を検証するダミーURLは実行時の通信先ではないため除外。
  if (rel !== "package-lock.json" && !rel.startsWith("tests/")) {
    const hostRe = P("https://([A-Za-z0-9.-]+)");
    for (let i = 0; i < lines.length; i++) {
      hostRe.lastIndex = 0;
      let m;
      while ((m = hostRe.exec(lines[i])) !== null) {
        const host = m[1].replace(P("[\"'`).,;]+$"), "");
        if (!ALLOWED_HOSTS.has(host)) {
          addFinding("warn", "許可リスト外の外部URL", rel, i + 1, host);
        }
      }
    }
  }

  // .env らしき内容
  if (P("^[A-Z0-9_]{3,}=\\S+", "m").test(content) && rel.includes(".env")) {
    addFinding("error", ".env 内容", rel, 0, ".env 形式のファイル");
  }
}

for (const f of allFiles) {
  const ext = extname(f.rel).toLowerCase();

  if (DANGEROUS_EXT.has(ext)) {
    addFinding("error", "危険な拡張子", f.rel, 0, `拡張子 ${ext}`);
    continue;
  }
  if (f.size > MAX_FILE_SIZE) {
    addFinding("error", "大容量ファイル", f.rel, 0, `${(f.size / 1048576).toFixed(1)} MiB`);
  }
  const base = f.rel.split("/").pop() ?? "";
  if (base === ".env" || base.startsWith(".env.")) {
    addFinding("error", ".env ファイル", f.rel, 0, "環境変数ファイルは公開不可");
    continue;
  }

  const isText =
    TEXT_EXT.has(ext) || base === "LICENSE" || base === ".gitignore";
  if (!isText) {
    const buf = readFileSync(join(ROOT, f.rel));
    if (buf.includes(0)) {
      // 画像等のバイナリ: リポジトリには画像を含めない方針
      if (!f.rel.startsWith("dist/")) {
        addFinding("warn", "バイナリファイル", f.rel, 0, "内容を目視確認すること(EXIF等の位置メタデータを含む画像は公開不可)");
      }
      continue;
    }
  }
  try {
    const content = readFileSync(join(ROOT, f.rel), "utf8");
    scanText(f.rel, content, { isDist: f.rel.startsWith("dist/") });
  } catch {
    addFinding("warn", "読み取り不可", f.rel, 0, "テキストとして読めないファイル");
  }
}

// ---- 2. DATA_SOURCES.yml の検査 --------------------------------------------

const dsPath = join(ROOT, "DATA_SOURCES.yml");
const approvedFiles = new Set();
const approvedRasterFiles = new Set();
const approvedVectorFiles = new Set();
const dataSourceEntries = new Map();
if (!existsSync(dsPath)) {
  addFinding("error", "ライセンス台帳", "DATA_SOURCES.yml", 0, "台帳がありません");
} else {
  const ds = readFileSync(dsPath, "utf8");
  const entries = ds.split(P("\\n  - id: ")).slice(1);
  for (const entry of entries) {
    const id = entry.split("\n")[0].trim();
    const statusMatch = entry.match(new RegExp("review_status:\\s*(\\w+)"));
    const status = statusMatch ? statusMatch[1] : "missing";
    const files = [...entry.matchAll(P("^\\s+- (public/[^\\s]+)$", "gm"))].map((m) => m[1]);
    if (dataSourceEntries.has(id)) {
      addFinding("error", "ライセンス台帳", "DATA_SOURCES.yml", 0, `${id}: IDが重複しています`);
    }
    dataSourceEntries.set(id, { status, files, entry });
    if (status === "approved") {
      files.forEach((f) => approvedFiles.add(f));
      const assetType = entry.match(P("^\\s+asset_type:\\s*(\\S+)", "m"))?.[1];
      if (assetType === "historical-raster") {
        const requiredTrueFields = [
          "redistribution_allowed",
          "modification_allowed",
          "cropping_allowed",
          "georeferencing_allowed",
          "tiling_allowed",
        ];
        for (const field of requiredTrueFields) {
          if (!P(`^\\s+${field}:\\s*true\\s*$`, "m").test(entry)) {
            addFinding("error", "歴史画像権利条件", "DATA_SOURCES.yml", 0, `${id}: ${field}=true の確認がありません`);
          }
        }
        const requiredTextFields = [
          "attribution",
          "era_id",
          "geographic_bounds",
          "sha256_manifest",
        ];
        for (const field of requiredTextFields) {
          if (!P(`^\\s+${field}:\\s*(?!null\\s*$).+`, "m").test(entry)) {
            addFinding("error", "歴史画像メタデータ", "DATA_SOURCES.yml", 0, `${id}: ${field} がありません`);
          }
        }
        const sha = entry.match(P("^\\s+sha256:\\s*([0-9a-f]{64})\\s*$", "m"))?.[1];
        if (!sha) {
          addFinding("error", "歴史画像ハッシュ", "DATA_SOURCES.yml", 0, `${id}: SHA-256 がありません`);
        }
        const manifest = entry.match(
          P("^\\s+sha256_manifest:\\s*(public/data/historical-rasters/[^\\s]+\\.json)\\s*$", "m"),
        )?.[1];
        if (!manifest || files.length !== 1 || files[0] !== manifest) {
          addFinding("error", "歴史画像manifest", "DATA_SOURCES.yml", 0, `${id}: local_files にはsha256_manifestだけを登録してください`);
        } else {
          approvedRasterFiles.add(manifest);
          const manifestFull = join(ROOT, manifest);
          if (!existsSync(manifestFull)) {
            addFinding("error", "歴史画像manifest", manifest, 0, "SHA-256 manifestがありません");
          } else {
            const manifestBuffer = readFileSync(manifestFull);
            const actual = createHash("sha256").update(manifestBuffer).digest("hex");
            if (sha && actual !== sha) {
              addFinding("error", "歴史画像ハッシュ", manifest, 0, "manifestのSHA-256が台帳と一致しません");
            }
            try {
              const hashes = JSON.parse(manifestBuffer.toString("utf8"));
              if (!hashes || Array.isArray(hashes) || typeof hashes !== "object") throw new Error();
              const hashEntries = Object.entries(hashes);
              if (hashEntries.length === 0) {
                addFinding("error", "歴史画像manifest", manifest, 0, "登録ファイルが空です");
              }
              for (const [file, expectedHash] of hashEntries) {
                if (
                  !file.startsWith("public/data/historical-rasters/") ||
                  file.includes("..") ||
                  !P("^[0-9a-f]{64}$").test(String(expectedHash))
                ) {
                  addFinding("error", "歴史画像manifest", manifest, 0, "不正なパスまたはSHA-256があります");
                  continue;
                }
                const full = join(ROOT, file);
                if (!existsSync(full) || statSync(full).isDirectory()) {
                  addFinding("error", "歴史画像ファイル", file, 0, "manifest登録ファイルがありません");
                  continue;
                }
                const fileHash = createHash("sha256").update(readFileSync(full)).digest("hex");
                if (fileHash !== expectedHash) {
                  addFinding("error", "歴史画像ハッシュ", file, 0, "manifestのSHA-256と一致しません");
                  continue;
                }
                approvedFiles.add(file);
                approvedRasterFiles.add(file);
              }
            } catch {
              addFinding("error", "歴史画像manifest", manifest, 0, "JSONとして解析できません");
            }
          }
        }
      }
      if (assetType === "historical-vector") {
        const requiredTextFields = [
          "title",
          "provider",
          ...(id.startsWith("project-") ? ["source_manifest"] : ["official_source"]),
          "original_item",
          "data_version",
          "license",
          "license_url",
          "attribution",
          "modification",
          "accessed_at",
          "downloaded_at",
          "source_crs",
          "output_crs",
          "historical_period",
          "geographic_bounds",
          "reviewer_note",
        ];
        for (const field of requiredTextFields) {
          if (!P(`^\\s+${field}:\\s*(?!null\\s*$).+`, "m").test(entry)) {
            addFinding("error", "歴史ベクターメタデータ", "DATA_SOURCES.yml", 0, `${id}: ${field} がありません`);
          }
        }
        const doiRequired = P("^\\s+doi_required:\\s*true\\s*$", "m").test(entry);
        const doiPresent = P("^\\s+doi:\\s*(?!null\\s*$).+", "m").test(entry);
        const doiExplicitlyAbsent = P("^\\s+doi:\\s*null\\s*$", "m").test(entry);
        if (!doiPresent && !(doiExplicitlyAbsent && !doiRequired)) {
          addFinding("error", "歴史ベクターDOI", "DATA_SOURCES.yml", 0, `${id}: DOI必須指定に対する値、または公式にDOIがないことを示すnullがありません`);
        }
        if (!P("^\\s+redistribution_allowed:\\s*true\\s*$", "m").test(entry)) {
          addFinding("error", "歴史ベクター権利条件", "DATA_SOURCES.yml", 0, `${id}: redistribution_allowed=true の確認がありません`);
        }
        const originalSha = entry.match(
          P("^\\s+original_sha256:\\s*([0-9a-f]{64})\\s*$", "m"),
        )?.[1];
        const convertedSha = entry.match(
          P("^\\s+converted_sha256:\\s*([0-9a-f]{64})\\s*$", "m"),
        )?.[1];
        if (!originalSha || !convertedSha) {
          addFinding("error", "歴史ベクターハッシュ", "DATA_SOURCES.yml", 0, `${id}: 原データまたは変換後SHA-256がありません`);
        }
        if (
          files.length !== 1 ||
          !files[0].startsWith("public/data/") ||
          !files[0].endsWith(".geojson") ||
          files[0].includes("..")
        ) {
          addFinding("error", "歴史ベクターファイル", "DATA_SOURCES.yml", 0, `${id}: local_filesは公開GeoJSON 1件に限定してください`);
        } else {
          const file = files[0];
          const full = join(ROOT, file);
          approvedVectorFiles.add(file);
          if (!existsSync(full) || statSync(full).isDirectory()) {
            addFinding("error", "歴史ベクターファイル", file, 0, "登録GeoJSONがありません");
          } else {
            const buffer = readFileSync(full);
            const actual = createHash("sha256").update(buffer).digest("hex");
            if (convertedSha && actual !== convertedSha) {
              addFinding("error", "歴史ベクターハッシュ", file, 0, "変換後SHA-256が台帳と一致しません");
            }
            try {
              const geojson = JSON.parse(buffer.toString("utf8"));
              const declaredGeometryTypes = entry.match(
                P("^\\s+geometry_types:\\s*\\[([^\\]]+)\\]\\s*$", "m"),
              )?.[1]?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
              const actualGeometryTypes = new Set(
                Array.isArray(geojson?.features)
                  ? geojson.features.map((feature) => feature?.geometry?.type)
                  : [],
              );
              const allowedGeometryTypes =
                id.startsWith("project-")
                  ? ["Point"]
                  : ["Polygon", "MultiPolygon", "LineString", "MultiLineString"];
              if (
                geojson?.type !== "FeatureCollection" ||
                !Array.isArray(geojson.features) ||
                geojson.features.length === 0 ||
                geojson.features.some(
                  (feature) =>
                    !allowedGeometryTypes.includes(feature?.geometry?.type) ||
                    feature?.properties?.sourceId !== id,
                ) ||
                declaredGeometryTypes.length === 0 ||
                [...actualGeometryTypes].some((type) => !declaredGeometryTypes.includes(type)) ||
                declaredGeometryTypes.some((type) => !actualGeometryTypes.has(type))
              ) {
                throw new Error();
              }
            } catch {
              addFinding("error", "歴史ベクター形式", file, 0, "geometry_types・FeatureCollection・sourceIdのいずれかが不正です");
            }
          }
        }
      }
      infos.push(`データ ${id}: approved (${files.length} ファイル)`);
    } else {
      if (files.length > 0) {
        addFinding("error", "未承認データ", "DATA_SOURCES.yml", 0, `${id} は ${status} だが local_files を持つ`);
      }
      infos.push(`データ ${id}: ${status} (ファイル同梱なし)`);
    }
  }
  // public/data 配下のファイルはすべて台帳の approved に載っていること
  for (const f of allFiles) {
    if (f.rel.startsWith("public/data/") && !approvedFiles.has(f.rel)) {
      addFinding("error", "台帳未登録データ", f.rel, 0, "DATA_SOURCES.yml の approved エントリに未登録");
    }
  }
}

// ---- 3. 地域パック・固定データセット参照の検査 -------------------------------

const eraCatalogPath = join(ROOT, "src", "era-catalog.json");
const datasetManifestPath = join(ROOT, "src", "dataset-manifest.json");
const regionManifestFiles = allFiles
  .map((file) => file.rel)
  .filter((rel) => P("^src/regions/[a-z0-9-]+-pack\\.json$").test(rel));

let eraIds = new Set();
let eraCatalog = [];
let datasetManifest = [];
if (!existsSync(eraCatalogPath)) {
  addFinding("error", "地域パック", "src/era-catalog.json", 0, "年代カタログがありません");
} else {
  try {
    eraCatalog = JSON.parse(readFileSync(eraCatalogPath, "utf8"));
    if (!Array.isArray(eraCatalog) || eraCatalog.length === 0) throw new Error();
    eraIds = new Set(eraCatalog.map((era) => era?.id));
    if (eraIds.size !== eraCatalog.length || [...eraIds].some((id) => !P("^[a-z0-9]+(?:-[a-z0-9]+)*$").test(String(id)))) {
      throw new Error();
    }
  } catch {
    eraCatalog = [];
    addFinding("error", "地域パック", "src/era-catalog.json", 0, "年代カタログが不正です");
  }
}

if (!existsSync(datasetManifestPath)) {
  addFinding("error", "地域データセット", "src/dataset-manifest.json", 0, "固定データセットmanifestがありません");
} else {
  try {
    datasetManifest = JSON.parse(readFileSync(datasetManifestPath, "utf8"));
    if (!Array.isArray(datasetManifest) || datasetManifest.length === 0) throw new Error();
    const ids = new Set();
    for (const dataset of datasetManifest) {
      if (
        !dataset ||
        typeof dataset.id !== "string" ||
        ids.has(dataset.id) ||
        dataset.sourceId !== dataset.id ||
        typeof dataset.path !== "string" ||
        !P("^data/[a-z0-9][a-z0-9.-]*\\.geojson$").test(dataset.path) ||
        dataset.path.includes("..") ||
        dataset.path.includes(":") ||
        dataset.path.startsWith("/") ||
        !P("^[0-9a-f]{64}$").test(String(dataset.publicSha256))
      ) {
        throw new Error();
      }
      ids.add(dataset.id);
      const source = dataSourceEntries.get(dataset.id);
      const publicFile = `public/${dataset.path}`;
      if (!source || source.status !== "approved") {
        addFinding("error", "地域データセット", "DATA_SOURCES.yml", 0, `${dataset.id}: approved台帳登録がありません`);
      } else if (source.files.length === 0 || !source.files.includes(publicFile)) {
        addFinding("error", "地域データセット", "DATA_SOURCES.yml", 0, `${dataset.id}: local_filesが固定パスと一致しません`);
      }
      const full = join(ROOT, publicFile);
      if (!existsSync(full)) {
        addFinding("error", "地域データセット", publicFile, 0, "公開ファイルがありません");
        continue;
      }
      const buffer = readFileSync(full);
      const actual = createHash("sha256").update(buffer).digest("hex");
      if (actual !== dataset.publicSha256) {
        addFinding("error", "地域データセット", publicFile, 0, "公開SHAが固定manifestと一致しません");
      }
      try {
        const geojson = JSON.parse(buffer.toString("utf8"));
        const invalidBase =
          geojson?.type !== "FeatureCollection" ||
          !Array.isArray(geojson.features) ||
          geojson.features.length === 0;
        const invalidSource =
          dataset.id.startsWith("project-")
            ? geojson.features.some(
                (feature) => feature?.properties?.sourceId !== dataset.id,
              )
            : dataset.kind === "places"
            ? geojson.features.some(
                (feature) =>
                  typeof feature?.properties?.source !== "string" ||
                  !feature.properties.source.startsWith(
                    "https://codh.rois.ac.jp/edo-maps/",
                  ),
              )
            : geojson.features.some(
                (feature) => feature?.properties?.sourceId !== dataset.sourceId,
              );
        if (invalidBase || invalidSource) throw new Error();
      } catch {
        addFinding("error", "地域データセット", publicFile, 0, "FeatureCollectionまたはsourceIdが不正です");
      }
    }
  } catch {
    addFinding("error", "地域データセット", "src/dataset-manifest.json", 0, "固定データセットmanifestが不正です");
    datasetManifest = [];
  }
}

if (regionManifestFiles.length === 0) {
  addFinding("error", "地域パック", "src/regions/", 0, "地域パックmanifestがありません");
} else {
  const regionIds = new Set();
  const datasetIds = new Set(datasetManifest.map((dataset) => dataset.id));
  let enabledRegionCount = 0;
  for (const rel of regionManifestFiles) {
    try {
      const pack = JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
      const region = pack?.region;
      if (
        !region ||
        !P("^[a-z0-9]+(?:-[a-z0-9]+)*$").test(String(region.id)) ||
        regionIds.has(region.id) ||
        !Array.isArray(region.enabledEraIds) ||
        !Array.isArray(pack.eras)
      ) throw new Error();
      regionIds.add(region.id);
      if (region.enabled) enabledRegionCount += 1;
      if (!region.enabledEraIds.includes(region.defaultEraId)) {
        addFinding("error", "地域パック", rel, 0, "defaultEraIdがenabledEraIdsに含まれません");
      }
      for (const eraId of region.enabledEraIds) {
        if (!eraIds.has(eraId)) addFinding("error", "地域パック", rel, 0, `存在しない年代IDです: ${eraId}`);
        const binding = pack.eras.find((era) => era?.eraId === eraId && era?.enabled === true);
        if (!binding) addFinding("error", "地域パック", rel, 0, `有効な年代バインディングがありません: ${eraId}`);
      }
      for (const binding of pack.eras) {
        if (!eraIds.has(binding?.eraId)) addFinding("error", "地域パック", rel, 0, `存在しない年代参照です: ${binding?.eraId}`);
        if (!Array.isArray(binding?.datasetIds)) throw new Error();
        for (const id of binding.datasetIds) {
          if (!datasetIds.has(id)) addFinding("error", "地域パック", rel, 0, `未承認データセット参照です: ${id}`);
        }
      }
    } catch {
      addFinding("error", "地域パック", rel, 0, "地域パックmanifestが不正です");
    }
  }
  if (enabledRegionCount < 1) {
    addFinding("error", "地域パック", "src/regions/", 0, "有効地域がありません");
  }
  infos.push(`地域パック: ${regionManifestFiles.length} 件、有効 ${enabledRegionCount} 件`);
}

// ---- 3.5 京都・幕末パック専用の公開ゲート -----------------------------------

function readKyotoJson(rel, category) {
  const full = join(ROOT, rel);
  if (!existsSync(full)) {
    addFinding("error", category, rel, 0, "必要なファイルがありません");
    return null;
  }
  try {
    return JSON.parse(readFileSync(full, "utf8"));
  } catch {
    addFinding("error", category, rel, 0, "JSONとして解析できません");
    return null;
  }
}

function hasControlCharacters(value) {
  return [...String(value)].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function hasUnsafeHistoricalText(value) {
  return (
    typeof value !== "string" ||
    hasControlCharacters(value) ||
    /<\/?[a-z][^>]*>/i.test(value) ||
    /\[[^\]]+\]\([^)]+\)/.test(value)
  );
}

function inKyotoBounds(longitude, latitude) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    latitude >= KYOTO_BOUNDS.minLat &&
    latitude <= KYOTO_BOUNDS.maxLat &&
    longitude >= KYOTO_BOUNDS.minLon &&
    longitude <= KYOTO_BOUNDS.maxLon
  );
}

const bakumatsuDefinition = eraCatalog.find((era) => era?.id === "bakumatsu");
if (
  !bakumatsuDefinition ||
  bakumatsuDefinition.startYear !== 1853 ||
  bakumatsuDefinition.endYear !== 1868
) {
  addFinding(
    "error",
    "京都年代",
    "src/era-catalog.json",
    0,
    "bakumatsu 1853-1868 の固定年代定義がありません",
  );
}

const kyotoPack = readKyotoJson(KYOTO_PACK_FILE, "京都地域パック");
const edoPack = readKyotoJson(EDO_PACK_FILE, "EDO地域パック");
if (kyotoPack) {
  const region = kyotoPack.region;
  const bakumatsu = Array.isArray(kyotoPack.eras)
    ? kyotoPack.eras.find((binding) => binding?.eraId === "bakumatsu")
    : null;
  if (
    region?.id !== "kyoto" ||
    region.enabled !== true ||
    region.defaultEraId !== "bakumatsu" ||
    !Array.isArray(region.enabledEraIds) ||
    !region.enabledEraIds.includes("modern") ||
    !region.enabledEraIds.includes("bakumatsu") ||
    !bakumatsu ||
    bakumatsu.enabled !== true ||
    !Array.isArray(bakumatsu.datasetIds) ||
    bakumatsu.datasetIds.length !== 1 ||
    bakumatsu.datasetIds[0] !== KYOTO_DATASET_ID ||
    bakumatsu.placeDatasetId !== KYOTO_DATASET_ID
  ) {
    addFinding(
      "error",
      "京都地域パック",
      KYOTO_PACK_FILE,
      0,
      "有効地域・初期年代・幕末データセット参照が固定仕様と一致しません",
    );
  }
  if (JSON.stringify(kyotoPack).includes("codh-edo-")) {
    addFinding(
      "error",
      "地域データ混入",
      KYOTO_PACK_FILE,
      0,
      "京都パックがEDO専用データを参照しています",
    );
  }
}
if (edoPack && JSON.stringify(edoPack).includes(KYOTO_DATASET_ID)) {
  addFinding(
    "error",
    "地域データ混入",
    EDO_PACK_FILE,
    0,
    "EDOパックが京都専用データを参照しています",
  );
}

const kyotoManifest = datasetManifest.find(
  (dataset) => dataset?.id === KYOTO_DATASET_ID,
);
if (
  !kyotoManifest ||
  kyotoManifest.kind !== "places" ||
  kyotoManifest.path !== "data/kyoto-bakumatsu-places.geojson" ||
  kyotoManifest.sourceId !== KYOTO_DATASET_ID ||
  !P("^[0-9a-f]{64}$").test(String(kyotoManifest.publicSha256))
) {
  addFinding(
    "error",
    "京都データセット",
    "src/dataset-manifest.json",
    0,
    "京都データセットの固定ID・パス・sourceId・SHAが不正です",
  );
}
const kyotoLedger = dataSourceEntries.get(KYOTO_DATASET_ID);
if (
  !kyotoLedger ||
  kyotoLedger.status !== "approved" ||
  kyotoLedger.files.length !== 1 ||
  kyotoLedger.files[0] !== KYOTO_PUBLIC_FILE ||
  !P(
    "^\\s+source_manifest:\\s*src/kyoto-source-registry\\.json\\s*$",
    "m",
  ).test(kyotoLedger.entry)
) {
  addFinding(
    "error",
    "京都ライセンス台帳",
    "DATA_SOURCES.yml",
    0,
    "京都データセットのapproved登録・source_manifest・local_filesが不正です",
  );
}

const sourceData = readKyotoJson(
  KYOTO_SOURCE_REGISTRY_FILE,
  "京都出典レジストリ",
);
const sourceIds = new Set();
if (!Array.isArray(sourceData) || sourceData.length === 0) {
  addFinding(
    "error",
    "京都出典レジストリ",
    KYOTO_SOURCE_REGISTRY_FILE,
    0,
    "固定出典が登録されていません",
  );
} else {
  for (const source of sourceData) {
    const id = source?.id;
    if (
      typeof id !== "string" ||
      !P("^[a-z0-9]+(?:-[a-z0-9]+)*$").test(id) ||
      sourceIds.has(id)
    ) {
      addFinding(
        "error",
        "京都出典レジストリ",
        KYOTO_SOURCE_REGISTRY_FILE,
        0,
        "出典IDが不正または重複しています",
      );
      continue;
    }
    sourceIds.add(id);
    try {
      const url = new URL(source.url);
      if (
        url.protocol !== "https:" ||
        url.username !== "" ||
        url.password !== "" ||
        !KYOTO_SOURCE_ALLOWED_ORIGINS.has(url.origin)
      ) {
        throw new Error();
      }
    } catch {
      addFinding(
        "error",
        "京都出典URL",
        KYOTO_SOURCE_REGISTRY_FILE,
        0,
        `${id}: HTTPS固定origin許可リスト外です`,
      );
    }
    for (const field of ["title", "publisher", "url"]) {
      if (hasUnsafeHistoricalText(source?.[field])) {
        addFinding(
          "error",
          "京都出典文字列",
          KYOTO_SOURCE_REGISTRY_FILE,
          0,
          `${id}: ${field} に不正な文字列があります`,
        );
      }
    }
  }
}

const sourceRegistryCodePath = join(ROOT, KYOTO_SOURCE_REGISTRY_CODE);
if (!existsSync(sourceRegistryCodePath)) {
  addFinding(
    "error",
    "京都出典レジストリ",
    KYOTO_SOURCE_REGISTRY_CODE,
    0,
    "安全な出典URL解決コードがありません",
  );
} else {
  const sourceCode = readFileSync(sourceRegistryCodePath, "utf8");
  for (const token of [
    'from "./kyoto-source-registry.json"',
    "new URL(url)",
    'parsedUrl.protocol !== "https:"',
    "ALLOWED_ORIGINS.has(parsedUrl.origin)",
  ]) {
    if (!sourceCode.includes(token)) {
      addFinding(
        "error",
        "京都出典レジストリ",
        KYOTO_SOURCE_REGISTRY_CODE,
        0,
        `安全要件「${token}」が維持されていません`,
      );
    }
  }
}

const curationData = readKyotoJson(KYOTO_CURATION_FILE, "京都キュレーション");
const publicData = readKyotoJson(KYOTO_PUBLIC_FILE, "京都公開GeoJSON");
const curatedIds = new Set();
const curatedCoordinates = new Set();
if (!Array.isArray(curationData) || curationData.length < 30 || curationData.length > 50) {
  addFinding(
    "error",
    "京都キュレーション",
    KYOTO_CURATION_FILE,
    0,
    "採用地点数が30-50件ではありません",
  );
} else {
  for (const place of curationData) {
    const id = place?.id;
    const longitude = place?.longitude;
    const latitude = place?.latitude;
    const coordinateKey = `${Number(longitude).toFixed(6)},${Number(latitude).toFixed(6)}`;
    if (
      typeof id !== "string" ||
      !P("^[a-z0-9]+(?:-[a-z0-9]+)*$").test(id) ||
      curatedIds.has(id)
    ) {
      addFinding("error", "京都地点ID", KYOTO_CURATION_FILE, 0, "IDが不正または重複しています");
    } else {
      curatedIds.add(id);
    }
    if (!inKyotoBounds(longitude, latitude)) {
      addFinding("error", "京都地点bounds", KYOTO_CURATION_FILE, 0, `${id}: 京都bounds外です`);
    }
    if (curatedCoordinates.has(coordinateKey)) {
      addFinding("error", "京都地点座標", KYOTO_CURATION_FILE, 0, `${id}: 座標が重複しています`);
    }
    curatedCoordinates.add(coordinateKey);
    if (place?.eraId !== "bakumatsu") {
      addFinding("error", "京都地点年代", KYOTO_CURATION_FILE, 0, `${id}: eraIdが不正です`);
    }
    if (place?.coordinateConfidence === "low") {
      addFinding("error", "京都地点精度", KYOTO_CURATION_FILE, 0, `${id}: low confidenceは公開できません`);
    }
    if (
      !Array.isArray(place?.sourceIds) ||
      place.sourceIds.length === 0 ||
      place.sourceIds.some((sourceId) => !sourceIds.has(sourceId))
    ) {
      addFinding("error", "京都地点出典", KYOTO_CURATION_FILE, 0, `${id}: sourceIdsが未登録または空です`);
    }
    for (const [key, value] of Object.entries(place ?? {})) {
      if (typeof value === "string" && hasUnsafeHistoricalText(value)) {
        addFinding("error", "京都地点文字列", KYOTO_CURATION_FILE, 0, `${id}: ${key} にHTML・Markdownリンク・制御文字があります`);
      }
    }
  }
}

const publicIds = new Set();
const publicCoordinates = new Set();
if (
  publicData?.type !== "FeatureCollection" ||
  !Array.isArray(publicData.features) ||
  publicData.features.length < 30 ||
  publicData.features.length > 50
) {
  addFinding(
    "error",
    "京都公開GeoJSON",
    KYOTO_PUBLIC_FILE,
    0,
    "FeatureCollectionまたはFeature数30-50件の条件を満たしません",
  );
} else {
  if (Array.isArray(curationData) && publicData.features.length !== curationData.length) {
    addFinding("error", "京都公開GeoJSON", KYOTO_PUBLIC_FILE, 0, "キュレーションと公開件数が一致しません");
  }
  for (const feature of publicData.features) {
    const properties = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    const id = properties?.id;
    const longitude = Array.isArray(coordinates) ? coordinates[0] : Number.NaN;
    const latitude = Array.isArray(coordinates) ? coordinates[1] : Number.NaN;
    const coordinateKey = `${Number(longitude).toFixed(6)},${Number(latitude).toFixed(6)}`;
    if (
      feature?.type !== "Feature" ||
      feature?.geometry?.type !== "Point" ||
      !Array.isArray(coordinates) ||
      coordinates.length !== 2 ||
      !inKyotoBounds(longitude, latitude)
    ) {
      addFinding("error", "京都公開GeoJSON", KYOTO_PUBLIC_FILE, 0, `${id}: Pointまたはboundsが不正です`);
    }
    if (typeof id !== "string" || publicIds.has(id)) {
      addFinding("error", "京都公開GeoJSON", KYOTO_PUBLIC_FILE, 0, "Feature IDが不正または重複しています");
    } else {
      publicIds.add(id);
    }
    if (publicCoordinates.has(coordinateKey)) {
      addFinding("error", "京都公開GeoJSON", KYOTO_PUBLIC_FILE, 0, `${id}: 座標が重複しています`);
    }
    publicCoordinates.add(coordinateKey);
    if (
      properties?.sourceId !== KYOTO_DATASET_ID ||
      properties?.eraId !== "bakumatsu" ||
      properties?.coordinateConfidence === "low" ||
      !Array.isArray(properties?.sourceIds) ||
      properties.sourceIds.length === 0 ||
      properties.sourceIds.some((sourceId) => !sourceIds.has(sourceId))
    ) {
      addFinding("error", "京都公開GeoJSON", KYOTO_PUBLIC_FILE, 0, `${id}: 固定ID・年代・精度・出典が不正です`);
    }
    for (const [key, value] of Object.entries(properties ?? {})) {
      if (typeof value === "string" && hasUnsafeHistoricalText(value)) {
        addFinding("error", "京都公開文字列", KYOTO_PUBLIC_FILE, 0, `${id}: ${key} にHTML・Markdownリンク・制御文字があります`);
      }
    }
  }
}

if (
  existsSync(join(ROOT, KYOTO_CURATION_FILE)) &&
  existsSync(join(ROOT, KYOTO_PUBLIC_FILE))
) {
  try {
    // direct-run分岐は通らないため、公開ファイルを書かずメモリ上だけで再現する。
    const rebuilt = buildKyotoGeoJson();
    const publicBuffer = readFileSync(join(ROOT, KYOTO_PUBLIC_FILE));
    const publicText = publicBuffer.toString("utf8");
    const publicSha = createHash("sha256").update(publicBuffer).digest("hex");
    if (rebuilt.output !== publicText || rebuilt.featureCount !== publicData?.features?.length) {
      addFinding(
        "error",
        "京都再現可能性",
        KYOTO_PUBLIC_FILE,
        0,
        "キュレーションからの読み取り専用再生成内容または件数が一致しません",
      );
    }
    if (rebuilt.sha256 !== publicSha || kyotoManifest?.publicSha256 !== publicSha) {
      addFinding(
        "error",
        "京都再現可能性",
        KYOTO_PUBLIC_FILE,
        0,
        "再現SHA・公開SHA・dataset manifest SHAが一致しません",
      );
    }
    if (kyotoLedger) {
      const curationBuffer = readFileSync(join(ROOT, KYOTO_CURATION_FILE));
      const curationSha = createHash("sha256").update(curationBuffer).digest("hex");
      const ledgerOriginalSha = kyotoLedger.entry.match(
        P("^\\s+original_sha256:\\s*([0-9a-f]{64})\\s*$", "m"),
      )?.[1];
      const ledgerConvertedSha = kyotoLedger.entry.match(
        P("^\\s+converted_sha256:\\s*([0-9a-f]{64})\\s*$", "m"),
      )?.[1];
      if (ledgerOriginalSha !== curationSha || ledgerConvertedSha !== publicSha) {
        addFinding(
          "error",
          "京都再現可能性",
          "DATA_SOURCES.yml",
          0,
          "キュレーションSHAまたは公開GeoJSON SHAが台帳と一致しません",
        );
      }
    }
    infos.push(`京都・幕末: ${rebuilt.featureCount} 地点、SHA ${publicSha.slice(0, 12)}…`);
  } catch (error) {
    addFinding(
      "error",
      "京都再現可能性",
      KYOTO_CURATION_FILE,
      0,
      `キュレーションの検証または読み取り専用再生成に失敗しました: ${
        error instanceof Error ? error.message : "原因不明"
      }`,
    );
  }
}

if (existsSync(join(ROOT, SHIGA_CURATION_FILE)) && existsSync(join(ROOT, SHIGA_PUBLIC_FILE))) {
  try {
    const rebuilt = buildShigaGeoJson();
    const publicBuffer = readFileSync(join(ROOT, SHIGA_PUBLIC_FILE));
    const publicSha = createHash("sha256").update(publicBuffer).digest("hex");
    const manifest = datasetManifest.find((item) => item?.id === SHIGA_DATASET_ID);
    const ledger = dataSourceEntries.get(SHIGA_DATASET_ID);
    const curationSha = createHash("sha256").update(readFileSync(join(ROOT, SHIGA_CURATION_FILE))).digest("hex");
    const ledgerOriginalSha = ledger?.entry.match(P("^\\s+original_sha256:\\s*([0-9a-f]{64})\\s*$", "m"))?.[1];
    const ledgerConvertedSha = ledger?.entry.match(P("^\\s+converted_sha256:\\s*([0-9a-f]{64})\\s*$", "m"))?.[1];
    if (rebuilt.output !== publicBuffer.toString("utf8") || rebuilt.featureCount !== 36 || rebuilt.sourceCount !== 17 || rebuilt.sha256 !== publicSha || manifest?.publicSha256 !== publicSha || ledgerOriginalSha !== curationSha || ledgerConvertedSha !== publicSha) {
      addFinding("error", "滋賀再現可能性", SHIGA_PUBLIC_FILE, 0, "生成内容・件数・出典数・SHA・台帳が一致しません");
    }
    infos.push(`滋賀・戦国: ${rebuilt.featureCount} 地点、出典 ${rebuilt.sourceCount}件、SHA ${publicSha.slice(0, 12)}…`);
  } catch (error) {
    addFinding("error", "滋賀再現可能性", SHIGA_CURATION_FILE, 0, `読み取り専用再生成に失敗しました: ${error instanceof Error ? error.message : "原因不明"}`);
  }
}

const allowedRuntimeFetches = new Map([
  ["src/places.ts", "fetch(baseUrl + PLACES_DATA_PATH"],
  ["src/machiya-areas.ts", "fetch(baseUrl + MACHIYA_DATA_PATH"],
  ["src/coastlines.ts", "fetch(`${baseUrl}${COASTLINE_DATA_PATH}`"],
  ["src/kyoto-bakumatsu-places.ts", "fetch(baseUrl + KYOTO_BAKUMATSU_DATA_PATH"],
  ["src/shiga-sengoku-places.ts", "fetch(`${baseUrl}${SHIGA_SENGOKU_DATA_PATH}`"],
]);
for (const file of allFiles) {
  if (!file.rel.startsWith("src/") || extname(file.rel).toLowerCase() !== ".ts") continue;
  const content = readFileSync(join(ROOT, file.rel), "utf8");
  if (!/\bfetch\s*\(/.test(content)) continue;
  const expected = allowedRuntimeFetches.get(file.rel);
  if (!expected || !content.includes(expected) || /fetch\s*\(\s*["']https?:/i.test(content)) {
    addFinding(
      "error",
      "外部fetch",
      file.rel,
      0,
      "固定同一オリジンGeoJSON以外のfetchが追加されています",
    );
  }
}

const forbiddenKyotoAssetExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".pdf",
  ".html",
  ".htm",
]);
const generatedKyotoStaticPages = new Set([
  "dist/places/kyoto/index.html",
  "dist/places/shiga/index.html",
]);
for (const file of allFiles) {
  const lower = file.rel.toLowerCase();
  const extension = extname(lower);
  if (lower.endsWith(".map")) {
    addFinding("error", "ソースマップ露出", file.rel, 0, "source mapは公開・追跡禁止です");
  }
  if (lower.startsWith("data-curation/") && ![KYOTO_CURATION_FILE, SHIGA_CURATION_FILE, HISTORICAL_THEME_CURATION_FILE, HISTORICAL_TIMELINE_CURATION_FILE].includes(file.rel)) {
    addFinding("error", "京都原資料", file.rel, 0, "キュレーションJSON以外の原文・画像コピーは公開禁止です");
  }
  if (
    (lower.includes("kyoto") || lower.includes("shiga") || lower.startsWith("data-curation/")) &&
    forbiddenKyotoAssetExtensions.has(extension) &&
    !generatedKyotoStaticPages.has(file.rel) &&
    !lower.startsWith("dist/timeline/")
  ) {
    addFinding("error", "京都原画像", file.rel, 0, "京都の原画像・PDF・HTMLコピーは公開禁止です");
  }
  if (
    lower.startsWith("src/kyoto") &&
    [".txt", ".md"].includes(extension)
  ) {
    addFinding("error", "京都原資料", file.rel, 0, "京都の原文・ページコピーはソースへ同梱できません");
  }
  if (
    lower.startsWith("public/data/kyoto") &&
    file.rel !== KYOTO_PUBLIC_FILE
  ) {
    addFinding("error", "京都公開データ", file.rel, 0, "承認済み京都GeoJSON以外の公開データがあります");
  }
  if (lower.startsWith("public/data/shiga") && file.rel !== SHIGA_PUBLIC_FILE) {
    addFinding("error", "滋賀公開データ", file.rel, 0, "承認済み滋賀GeoJSON以外の公開データがあります");
  }
}

// CSP・Service Workerの公開禁止を明示的に検査
const EXPECTED_TILE_ORIGIN = new URL(
  "https://cyberjapandata.gsi.go.jp",
).origin;

function cspDirectives(value) {
  const directives = new Map();
  for (const part of String(value).split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    const name = tokens.shift();
    if (name) directives.set(name, tokens);
  }
  return directives;
}

function isExactOriginSource(source, expectedOrigin) {
  try {
    const url = new URL(source);
    return (
      url.origin === expectedOrigin &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

const viteConfig = existsSync(join(ROOT, "vite.config.ts"))
  ? readFileSync(join(ROOT, "vite.config.ts"), "utf8")
  : "";
const viteImgSources = viteConfig.match(/"img-src\s+([^"\r\n]+)"/)?.[1]
  ?.split(/\s+/)
  .filter(Boolean) ?? [];
const viteConnectSources = viteConfig.match(/"connect-src\s+([^"\r\n]+)"/)?.[1]
  ?.split(/\s+/)
  .filter(Boolean) ?? [];
if (
  viteConnectSources.length !== 2 ||
  viteConnectSources[0] !== "'self'" ||
  viteConnectSources[1] !== "data:" ||
  !viteImgSources.some((source) =>
    isExactOriginSource(source, EXPECTED_TILE_ORIGIN),
  )
) {
  addFinding("error", "CSP", "vite.config.ts", 0, "既存CSPの通信先制限が維持されていません");
}
for (const file of allFiles) {
  const base = file.rel.split("/").pop()?.toLowerCase() ?? "";
  if (P("^(service-worker|sw)(\\.|$)|^workbox").test(base)) {
    addFinding("error", "Service Worker", file.rel, 0, "Service Worker関連ファイルは公開禁止です");
  }
  if (
    file.rel !== SELF &&
    !file.rel.startsWith("tests/") &&
    TEXT_EXT.has(extname(file.rel).toLowerCase())
  ) {
    const content = readFileSync(join(ROOT, file.rel), "utf8");
    if (content.includes("serviceWorker.register")) {
      addFinding("error", "Service Worker", file.rel, 0, "Service Worker登録コードがあります");
    }
  }
}

// ---- 3.6 地域別地点検索の公開ゲート -----------------------------------------

const searchIndexPath = join(ROOT, "index.html");
const searchQueryPath = join(ROOT, "src/place-search/query.ts");
const searchAdaptersPath = join(ROOT, "src/place-search/adapters.ts");
const searchSourceFiles = allFiles.filter((file) =>
  file.rel.startsWith("src/place-search/") && file.rel.endsWith(".ts"),
);
if (!existsSync(searchIndexPath)) {
  addFinding("error", "地点検索UI", "index.html", 0, "検索UIを確認できません");
} else {
  const html = readFileSync(searchIndexPath, "utf8");
  const requiredMarkup = [
    ['id="place-search-open"', "検索を開くボタン"],
    ['aria-controls="place-search-panel"', "aria-controls"],
    ['id="place-search-panel"', "検索パネル"],
    ['aria-labelledby="place-search-heading"', "パネル見出し"],
    ['id="place-search-input"', "検索入力"],
    ['maxlength="100"', "100文字上限"],
    ['id="place-search-results"', "検索結果一覧"],
    ['id="place-search-status"', "検索status"],
    ['aria-live="polite"', "aria-live"],
    ['id="place-search-previous"', "前ページボタン"],
    ['id="place-search-next"', "次ページボタン"],
  ];
  for (const [needle, label] of requiredMarkup) {
    if (!html.includes(needle)) {
      addFinding("error", "地点検索UI", "index.html", 0, `${label}がありません`);
    }
  }
}

if (!existsSync(searchQueryPath) || !readFileSync(searchQueryPath, "utf8").includes("SEARCH_RESULTS_PER_PAGE = 50")) {
  addFinding("error", "地点検索性能", "src/place-search/query.ts", 0, "DOM上限50件の固定値がありません");
}

if (!existsSync(searchAdaptersPath)) {
  addFinding("error", "地点検索アダプター", "src/place-search/adapters.ts", 0, "固定アダプターがありません");
} else {
  const adapters = readFileSync(searchAdaptersPath, "utf8");
  for (const datasetId of [
    "codh-edo-maps-places",
    "project-kyoto-bakumatsu-places",
    "project-shiga-sengoku-places",
  ]) {
    if (!adapters.includes(`"${datasetId}"`)) {
      addFinding("error", "地点検索アダプター", "src/place-search/adapters.ts", 0, `${datasetId}の固定アダプターがありません`);
    }
  }
  for (const forbiddenDatasetId of [
    "codh-edo-machiya-areas",
    "codh-edo-coastline",
  ]) {
    if (adapters.includes(`"${forbiddenDatasetId}"`)) {
      addFinding("error", "地点検索対象", "src/place-search/adapters.ts", 0, `${forbiddenDatasetId}を地点検索へ含めています`);
    }
  }
}

const forbiddenSearchSource = [
  ["inner" + "HTML", "HTML文字列挿入"],
  ["insertAdjacent" + "HTML", "HTML文字列挿入"],
  ["new " + "RegExp", "利用者入力由来RegExp"],
  ["fetch" + "(", "検索語の外部送信"],
  ["local" + "Storage", "検索状態の永続保存"],
  ["session" + "Storage", "検索状態の永続保存"],
  ["indexed" + "DB", "検索状態の永続保存"],
  ["document." + "cookie", "検索状態のCookie保存"],
  ["console." + "log", "検索語のログ出力"],
];
for (const file of searchSourceFiles) {
  const source = readFileSync(join(ROOT, file.rel), "utf8");
  for (const [needle, label] of forbiddenSearchSource) {
    if (source.includes(needle)) {
      addFinding("error", "地点検索セキュリティ", file.rel, 0, `${label}は禁止です`);
    }
  }
}
infos.push(`地域別地点検索: UI・50件上限・固定アダプター・保存/送信禁止を確認`);

// ---- 3.7 歴史テーマ索引の公開ゲート ---------------------------------------

const themeMarkupPath = join(ROOT, "index.html");
const themeRegistryPath = join(ROOT, "src/historical-theme-registry.ts");
const themeControllerPath = join(ROOT, "src/historical-theme-controller.ts");
const themeCurationPath = join(ROOT, HISTORICAL_THEME_CURATION_FILE);
for (const [path, label] of [
  [themeRegistryPath, "テーマレジストリ"],
  [themeControllerPath, "テーマUIコントローラー"],
  [themeCurationPath, "テーマ固定データ"],
]) {
  if (!existsSync(path)) addFinding("error", "歴史テーマ索引", relative(ROOT, path), 0, `${label}がありません`);
}
if (existsSync(themeMarkupPath)) {
  const html = readFileSync(themeMarkupPath, "utf8");
  for (const [needle, label] of [
    ['id="historical-theme-open"', "開くボタン"],
    ['aria-controls="historical-theme-panel"', "aria-controls"],
    ['id="historical-theme-panel"', "テーマパネル"],
    ['id="historical-theme-input"', "テーマ検索入力"],
    ['id="historical-theme-type"', "種別select"],
    ['id="historical-theme-list"', "結果一覧"],
    ['id="historical-theme-status"', "aria-live status"],
  ]) {
    if (!html.includes(needle)) addFinding("error", "歴史テーマUI", "index.html", 0, `${label}がありません`);
  }
}
try {
  const validatedThemes = validateHistoricalThemeData(
    JSON.parse(readFileSync(themeCurationPath, "utf8")),
    {
      kyotoPlaces: JSON.parse(readFileSync(join(ROOT, KYOTO_CURATION_FILE), "utf8")),
      shigaPlaces: JSON.parse(readFileSync(join(ROOT, SHIGA_CURATION_FILE), "utf8")),
      kyotoSources: JSON.parse(readFileSync(join(ROOT, KYOTO_SOURCE_REGISTRY_FILE), "utf8")),
      shigaSources: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
    },
  );
  const relations = validatedThemes.flatMap((theme) => theme.relatedPlaces);
  if (validatedThemes.length !== 21 || relations.length !== 87) {
    addFinding("error", "歴史テーマ件数", HISTORICAL_THEME_CURATION_FILE, 0, "承認済み21テーマ・87関係と一致しません");
  }
  if (relations.some((reference) => reference.datasetId === "codh-edo-maps-places")) {
    addFinding("error", "歴史テーマ対象", HISTORICAL_THEME_CURATION_FILE, 0, "構造化関係を持たないEDO地名が含まれています");
  }
  infos.push(`歴史テーマ索引: ${validatedThemes.length}テーマ・${relations.length}関係を固定ID・地点所属出典で検証`);
} catch (error) {
  addFinding("error", "歴史テーマ検証", HISTORICAL_THEME_CURATION_FILE, 0, error instanceof Error ? error.message : "検証に失敗しました");
}
for (const file of allFiles.filter((item) => item.rel.startsWith("src/historical-theme") && item.rel.endsWith(".ts"))) {
  const source = readFileSync(join(ROOT, file.rel), "utf8");
  for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "document.cookie", "console.log", "innerHTML", "insertAdjacentHTML"]) {
    if (source.includes(forbidden)) addFinding("error", "歴史テーマセキュリティ", file.rel, 0, `${forbidden}は禁止です`);
  }
}

// ---- 3.8 歴史年表の公開ゲート ---------------------------------------------

for (const [rel, label] of [
  [HISTORICAL_TIMELINE_CURATION_FILE, "年表キュレーション"],
  ["src/historical-timeline-registry.ts", "年表レジストリ"],
  ["src/historical-timeline-search.ts", "年表検索"],
  ["src/historical-timeline-controller.ts", "年表UIコントローラー"],
  ["scripts/build-static-timeline-pages.mjs", "静的年表生成器"],
  ["audit/historical-timeline-review.md", "年表採否監査"],
  ["docs/HISTORICAL_TIMELINE.md", "年表設計文書"],
]) {
  if (!existsSync(join(ROOT, rel))) addFinding("error", "歴史年表", rel, 0, `${label}がありません`);
}
if (existsSync(join(ROOT, "index.html"))) {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  for (const [needle, label] of [
    ['id="historical-timeline-open"', "開くbutton"],
    ['aria-controls="historical-timeline-panel"', "aria-controls"],
    ['id="historical-timeline-panel"', "年表パネル"],
    ['id="historical-timeline-track"', "時代区分select"],
    ['id="historical-timeline-type"', "出来事種別select"],
    ['id="historical-timeline-input"', "検索input"],
    ['id="historical-timeline-list"', "年表一覧"],
    ['id="historical-timeline-detail"', "年表詳細"],
    ['id="historical-timeline-status"', "aria-live status"],
    ['id="historical-timeline-close"', "閉じるbutton"],
    ['href="./timeline/"', "静的年表リンク"],
  ]) if (!html.includes(needle)) addFinding("error", "歴史年表UI", "index.html", 0, `${label}がありません`);
}
try {
  const timelineInput = readFileSync(join(ROOT, HISTORICAL_TIMELINE_CURATION_FILE), "utf8");
  const timeline = validateTimelineData(JSON.parse(timelineInput), {
    themes: JSON.parse(readFileSync(join(ROOT, HISTORICAL_THEME_CURATION_FILE), "utf8")),
    kyotoPlaces: JSON.parse(readFileSync(join(ROOT, KYOTO_CURATION_FILE), "utf8")),
    shigaPlaces: JSON.parse(readFileSync(join(ROOT, SHIGA_CURATION_FILE), "utf8")),
    kyotoSources: JSON.parse(readFileSync(join(ROOT, KYOTO_SOURCE_REGISTRY_FILE), "utf8")),
    shigaSources: JSON.parse(readFileSync(join(ROOT, "src/shiga-source-registry.json"), "utf8")),
  });
  const placeRelations = timeline.flatMap((entry) => entry.relatedPlaces);
  const themeRelations = timeline.flatMap((entry) => entry.relatedThemeIds);
  if (timeline.length !== 35 || timeline.filter((entry) => entry.track === "shiga-sengoku").length !== 17 || timeline.filter((entry) => entry.track === "kyoto-bakumatsu").length !== 18) addFinding("error", "歴史年表件数", HISTORICAL_TIMELINE_CURATION_FILE, 0, "承認済み35項目・滋賀17・京都18と一致しません");
  if (placeRelations.some((reference) => reference.datasetId === "codh-edo-maps-places")) addFinding("error", "歴史年表対象", HISTORICAL_TIMELINE_CURATION_FILE, 0, "EDO地名参照があります");
  if (new Set(themeRelations).size !== 21) addFinding("error", "歴史年表テーマ", HISTORICAL_TIMELINE_CURATION_FILE, 0, "関連テーマが承認済み21件と一致しません");
  infos.push(`歴史年表: ${timeline.length}項目・${placeRelations.length}地点関係・${themeRelations.length}テーマ関係を固定ID・地点所属出典・明示日付で検証`);
} catch (error) {
  addFinding("error", "歴史年表検証", HISTORICAL_TIMELINE_CURATION_FILE, 0, error instanceof Error ? error.message : "検証に失敗しました");
}
for (const rel of ["src/historical-timeline-registry.ts", "src/historical-timeline-search.ts", "src/historical-timeline-controller.ts"]) {
  if (!existsSync(join(ROOT, rel))) continue;
  const source = readFileSync(join(ROOT, rel), "utf8");
  for (const forbidden of ["fetch(", "localStorage", "sessionStorage", "indexedDB", "document.cookie", "history.pushState", "new Date(", "Date.parse(", "innerHTML", "insertAdjacentHTML"]) {
    if (source.includes(forbidden)) addFinding("error", "歴史年表セキュリティ", rel, 0, `${forbidden}は禁止です`);
  }
}

// ---- 4. 出典表示の確認 -------------------------------------------------------

const attrChecks = [
  ["src/config.ts", "地理院タイル"],
  ["src/attribution.ts", "江戸マップ地名データセット"],
  ["THIRD_PARTY_NOTICES.md", "CC BY 4.0"],
  ["THIRD_PARTY_NOTICES.md", "Leaflet"],
  ["src/attribution.ts", "10.20676/00000446"],
  ["src/attribution.ts", "CC BY 4.0"],
  ["THIRD_PARTY_NOTICES.md", "町家領域データセット"],
  ["src/attribution.ts", "10.20676/00000453"],
  ["THIRD_PARTY_NOTICES.md", "江戸末期海岸線／水域データセット"],
];
for (const [file, needle] of attrChecks) {
  const p = join(ROOT, file);
  if (!existsSync(p) || !readFileSync(p, "utf8").includes(needle)) {
    addFinding("error", "出典表示漏れ", file, 0, `「${needle}」の表記が見つかりません`);
  }
}

// ---- 5. GitHub Actions の SHA 固定検査 ---------------------------------------

for (const f of allFiles) {
  if (!f.rel.startsWith(".github/workflows/")) continue;
  const content = readFileSync(join(ROOT, f.rel), "utf8");
  const usesRe = P("uses:\\s*([^\\s]+)", "g");
  let m;
  while ((m = usesRe.exec(content)) !== null) {
    const ref = m[1];
    if (!P("@[0-9a-f]{40}$").test(ref)) {
      addFinding("error", "Actions 未固定参照", f.rel, 0, `${ref} はコミットSHAで固定されていません`);
    }
  }
  if (!content.includes("permissions:")) {
    addFinding("error", "Actions 権限", f.rel, 0, "permissions が明示されていません");
  }
}

// ---- 6. dist(公開ビルド)の検査 ---------------------------------------------

const distDir = join(ROOT, "dist");
if (existsSync(distDir)) {
  const distFiles = [];
  const walkDist = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) walkDist(full);
      else distFiles.push(relative(ROOT, full).replace(P("\\\\", "g"), "/"));
    }
  };
  walkDist(distDir);
  const distIndex = join(distDir, "index.html");
  if (!existsSync(distIndex)) {
    addFinding("error", "CSP", "dist/index.html", 0, "公開HTMLがありません");
  } else {
    const html = readFileSync(distIndex, "utf8");
    const csp = html.match(
      /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i,
    )?.[1];
    const directives = cspDirectives(csp ?? "");
    const connectSources = directives.get("connect-src") ?? [];
    const imgSources = directives.get("img-src") ?? [];
    if (
      !csp ||
      connectSources.length !== 2 ||
      connectSources[0] !== "'self'" ||
      connectSources[1] !== "data:" ||
      !imgSources.some((source) =>
        isExactOriginSource(source, EXPECTED_TILE_ORIGIN),
      ) ||
      [...directives.values()].flat().some((source) => {
        try {
          return new URL(source).protocol === "http:";
        } catch {
          return false;
        }
      })
    ) {
      addFinding("error", "CSP", "dist/index.html", 0, "CSP欠落、許可先変更、またはmixed contentがあります");
    }
  }
  for (const rel of distFiles) {
    if (rel.endsWith(".map")) {
      addFinding("error", "ソースマップ露出", rel, 0, "本番ビルドに .map を含めない");
    }
    if (rel.startsWith("dist/data/historical-rasters/")) {
      const sourcePath = `public/${rel.slice("dist/".length)}`;
      if (!approvedRasterFiles.has(sourcePath)) {
        addFinding("error", "未承認歴史画像の公開", rel, 0, "approved の全権利条件を満たす台帳登録がありません");
      }
    }
    if (rel.startsWith("dist/data/") && rel.endsWith(".geojson")) {
      const sourcePath = `public/${rel.slice("dist/".length)}`;
      if (!approvedFiles.has(sourcePath)) {
        addFinding("error", "未承認歴史データの公開", rel, 0, "approved台帳登録がありません");
      }
      if (
        sourcePath !== "public/data/edo-places.geojson" &&
        !approvedVectorFiles.has(sourcePath)
      ) {
        addFinding("error", "未承認歴史ベクターの公開", rel, 0, "historical-vectorのapproved条件を満たしていません");
      }
    }
  }
  infos.push(`dist: ${distFiles.length} ファイル`);
  try {
    const staticAudit = auditStaticPlaceLinks(ROOT, distDir);
    infos.push(
      `静的地点一覧: HTML ${staticAudit.htmlFileCount}、EDO ${staticAudit.edoCount}件、京都 ${staticAudit.kyotoCount}件、滋賀 ${staticAudit.shigaCount}件、manifest SHA ${staticAudit.manifestSha256.slice(0, 12)}…`,
    );
  } catch (error) {
    addFinding(
      "error",
      "静的地点一覧",
      "dist/places/",
      0,
      error instanceof Error ? error.message : "静的一覧監査に失敗しました",
    );
  }
} else {
  addFinding("warn", "ビルド未確認", "dist/", 0, "dist がありません(npm run build を実行して再監査すること)");
}

// ---- 7. Git 履歴の検査 --------------------------------------------------------

const historyText = git("log", "--all", "-p", "--no-color");
if (historyText !== null) {
  const histLines = historyText.split("\n");
  for (const [name, re] of [...SECRET_PATTERNS, ...PII_PATTERNS]) {
    for (let i = 0; i < histLines.length; i++) {
      re.lastIndex = 0;
      const m = re.exec(histLines[i].replace(ALLOWED_EMAILS, ""));
      if (m) {
        addFinding("error", "Git履歴", "(git history)", 0, `${name}: ${mask(m[0])}`);
        break; // 同一パターンは1回報告
      }
    }
  }
  infos.push("Git 履歴: 秘密情報・個人情報パターンを走査済み");
} else {
  infos.push("Git 履歴: リポジトリ未初期化のため対象なし");
}

const forbiddenRawExtensions = new Set([
  ".zip",
  ".shp",
  ".shx",
  ".dbf",
  ".prj",
  ".gpkg",
]);
for (const file of tracked) {
  if (forbiddenRawExtensions.has(extname(file).toLowerCase())) {
    addFinding("error", "原データ追跡", file, 0, "原ZIP/Shapefile/GeoPackageはGit追跡禁止です");
  }
}
const historyNames = git("log", "--all", "--name-only", "--pretty=format:");
if (historyNames !== null) {
  for (const file of new Set(historyNames.split("\n").filter(Boolean))) {
    if (forbiddenRawExtensions.has(extname(file).toLowerCase())) {
      addFinding("error", "原データ履歴", file, 0, "Git履歴に原ZIP/Shapefile/GeoPackageがあります");
    }
  }
}

// 追跡ファイルと .gitignore の整合(追跡中の除外対象がないか)
for (const t of tracked) {
  if (t.startsWith("dist/") || t.startsWith("node_modules/") || t === "PROMPT.md" || t === "RULES.md" || t.startsWith(".claude/") || (t.startsWith("audit/") && !["audit/shiga-sengoku-place-review.md", "audit/historical-theme-review.md"].includes(t))) {
    addFinding("error", "追跡対象違反", t, 0, "公開対象外ファイルが Git 追跡されています");
  }
}

// ---- 8. npm 依存の検査 --------------------------------------------------------

try {
  const auditOut = execFileSync("npm", ["audit", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    shell: process.platform === "win32",
    maxBuffer: 1024 * 1024 * 64,
  });
  const audit = JSON.parse(auditOut);
  const v = audit.metadata?.vulnerabilities ?? {};
  const high = (v.high ?? 0) + (v.critical ?? 0);
  const moderate = (v.moderate ?? 0) + (v.low ?? 0);
  if (high > 0) {
    addFinding("error", "npm脆弱性", "package-lock.json", 0, `high/critical ${high} 件`);
  }
  infos.push(`npm audit: critical=${v.critical ?? 0} high=${v.high ?? 0} moderate=${v.moderate ?? 0} low=${v.low ?? 0}`);
  if (moderate > 0) {
    infos.push("moderate/low は内容を確認し判断理由を記録すること");
  }
} catch {
  addFinding("warn", "npm脆弱性", "package-lock.json", 0, "npm audit を実行できませんでした");
}

// lock ファイルのレジストリ検査
try {
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  const bad = Object.entries(lock.packages ?? {})
    .filter(([k, v]) => k && v.resolved && !String(v.resolved).startsWith("https://registry.npmjs.org/"))
    .map(([k]) => k);
  if (bad.length > 0) {
    addFinding("error", "非公式レジストリ依存", "package-lock.json", 0, `${bad.length} 件`);
  }
  const withScripts = Object.entries(lock.packages ?? {})
    .filter(([k, v]) => k && v.hasInstallScript)
    .map(([k]) => k.replace("node_modules/", ""));
  infos.push(`install script を持つ依存: ${withScripts.join(", ") || "なし"}`);
} catch {
  addFinding("error", "lockファイル", "package-lock.json", 0, "package-lock.json を読めません");
}

// ---- レポート生成 -------------------------------------------------------------

mkdirSync(join(ROOT, "audit"), { recursive: true });
const errors = findings.filter((f) => f.severity === "error");
const warns = findings.filter((f) => f.severity === "warn");

const report = [
  "# 公開前監査レポート",
  "",
  `実行日時: ${new Date().toISOString()}`,
  `検査ファイル数: ${allFiles.length}(node_modules, .git, audit, data-raw を除く)`,
  `Git 追跡ファイル数: ${tracked.length}`,
  "",
  `## 結果: ${errors.length === 0 ? "合格(エラー 0 件)" : `不合格(エラー ${errors.length} 件)`}`,
  "",
  "## エラー",
  ...(errors.length === 0
    ? ["なし"]
    : errors.map((f) => `- [${f.category}] ${f.file}${f.line ? `:${f.line}` : ""} — ${f.note}`)),
  "",
  "## 警告(公開前に目視確認)",
  ...(warns.length === 0
    ? ["なし"]
    : warns.map((f) => `- [${f.category}] ${f.file}${f.line ? `:${f.line}` : ""} — ${f.note}`)),
  "",
  "## 情報",
  ...infos.map((s) => `- ${s}`),
  "",
  "検出値はマスキングされています。実値はレポートに記録していません。",
  "",
].join("\n");

writeFileSync(join(ROOT, "audit", "prepublish-report.md"), report);
console.log(report);
process.exit(errors.length === 0 ? 0 : 1);
