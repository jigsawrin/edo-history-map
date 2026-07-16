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
  "([A-Za-z0-9._%+-]+@users\\.noreply\\.github\\.com|noreply@anthropic\\.com)",
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
          "official_source",
          "original_item",
          "data_version",
          "license",
          "license_url",
          "attribution",
          "doi",
          "modification",
          "accessed_at",
          "downloaded_at",
          "source_crs",
          "output_crs",
          "reviewer_note",
        ];
        for (const field of requiredTextFields) {
          if (!P(`^\\s+${field}:\\s*(?!null\\s*$).+`, "m").test(entry)) {
            addFinding("error", "歴史ベクターメタデータ", "DATA_SOURCES.yml", 0, `${id}: ${field} がありません`);
          }
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
              if (
                geojson?.type !== "FeatureCollection" ||
                !Array.isArray(geojson.features) ||
                geojson.features.length === 0 ||
                geojson.features.some(
                  (feature) =>
                    !["Polygon", "MultiPolygon"].includes(feature?.geometry?.type) ||
                    feature?.properties?.sourceId !== id,
                )
              ) {
                throw new Error();
              }
            } catch {
              addFinding("error", "歴史ベクター形式", file, 0, "Polygon/MultiPolygon FeatureCollectionまたはsourceIdが不正です");
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

// ---- 3. 出典表示の確認 -------------------------------------------------------

const attrChecks = [
  ["src/config.ts", "地理院タイル"],
  ["src/attribution.ts", "江戸マップ地名データセット"],
  ["THIRD_PARTY_NOTICES.md", "CC BY 4.0"],
  ["THIRD_PARTY_NOTICES.md", "Leaflet"],
  ["src/attribution.ts", "10.20676/00000446"],
  ["src/attribution.ts", "CC BY 4.0"],
  ["THIRD_PARTY_NOTICES.md", "町家領域データセット"],
];
for (const [file, needle] of attrChecks) {
  const p = join(ROOT, file);
  if (!existsSync(p) || !readFileSync(p, "utf8").includes(needle)) {
    addFinding("error", "出典表示漏れ", file, 0, `「${needle}」の表記が見つかりません`);
  }
}

// ---- 4. GitHub Actions の SHA 固定検査 ---------------------------------------

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

// ---- 5. dist(公開ビルド)の検査 ---------------------------------------------

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
      if (sourcePath.includes("machiya") && !approvedVectorFiles.has(sourcePath)) {
        addFinding("error", "未承認歴史ベクターの公開", rel, 0, "historical-vectorのapproved条件を満たしていません");
      }
    }
  }
  infos.push(`dist: ${distFiles.length} ファイル`);
} else {
  addFinding("warn", "ビルド未確認", "dist/", 0, "dist がありません(npm run build を実行して再監査すること)");
}

// ---- 6. Git 履歴の検査 --------------------------------------------------------

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
  if (t.startsWith("dist/") || t.startsWith("node_modules/") || t === "PROMPT.md" || t === "RULES.md" || t.startsWith(".claude/") || t.startsWith("audit/")) {
    addFinding("error", "追跡対象違反", t, 0, "公開対象外ファイルが Git 追跡されています");
  }
}

// ---- 7. npm 依存の検査 --------------------------------------------------------

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
