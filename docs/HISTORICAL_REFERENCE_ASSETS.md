# 歴史参考画像台帳

## 目的

古地図表示カタログの`artifactBinding.kind = "reference-asset"`から将来参照する、
歴史参考画像専用の安全な台帳基盤である。測地同期したoverlayラスタとは別物で、
`reference-panel`向けの参考資料（図版・写真・図面など）を扱う。

安全基盤上の和田倉御門資料1件は2026-07-23にtechnical approved / publishedへ昇格した。raw / derived画像はGit管理外のまま、同一バイトの公開PNGだけを`/data/historical-reference-assets/tokyo-archive-4300033114-wadakura-gate-reference-image/wadakura-gate-reference.png`で追跡する（PNG、2450×1800、1680142 bytes、SHA-256 `92e7493dc52be2b18670f1b1bd80e1688ba6c7f491d94f3d2f172cce9b4b3e81`）。

## 測地同期ラスタとの違い

| 種別 | 用途 | binding |
|------|------|---------|
| historical-raster | 地図上へ測地同期して重ねる | `georeferenced-overlay` |
| reference-asset | 参考パネルに表示する | `reference-panel` |

reference assetは正確な測地範囲や位置合わせ精度を主張しない。
参照元candidateの`intendedUses`には`reference-panel`が必要であり、overlay専用candidateから参考画像へ昇格できない。reference-panel専用資料では測地同期・タイル化の許可を要求せず、閲覧・再配布・改変・cropの権利と混同しない。用途追加は個別史料監査を経て行う。

## 段階導入

権利・派生画像・歴史情報保護・候補台帳／表示カタログ相互参照のゲートを先に固定した。
現在は`catalogStatus=reviewed`、assets 1件、published 1件である。runtimeはprivate台帳をimport/fetchせず、公開UIに必要な値だけを持つ`src/historical-reference-panel-registry.json`を利用し、専用監査で正本・公開画像との一致を固定する。

## 公開パネル

東京・江戸地域で地図中心がdisplay-trigger-area内（境界を含む）にあり、zoom 17以上で案内を表示する。表示後はzoom 16.5以上で維持する。年代選択は条件にせず、1717年と江戸後期表示（1849–1862）の差をdialogで常時明示する。画像は初回openまで読み込まず、画像viewportだけをスクロールでき、100 / 150 / 200%と全体表示へ戻す操作、Esc、focus復帰、モバイル表示、読込失敗通知に対応する。control point、tile、overlay、測地範囲には使用しない。

## 原画像と派生画像の分離

- 原画像: `originalFile.rawPath` = `data-raw/historical-reference-assets/<asset-id>/<filename>`
- 派生画像: `derivedFile.derivedPath` = `data-derived/historical-reference-assets/<asset-id>/<filename>`
- 公開パス: `derivedFile.publicPath` = `/data/historical-reference-assets/<asset-id>/<filename>`

`rawPath`と`derivedPath`を`publicPath`にできない。原画像はGit追跡禁止。
`publicPath`は`publicationStatus=published`の場合のみ必須で、それ以外は禁止。
raw / derivedは`.gitignore`配下でGit追跡を拒否し、publishedのpublicファイルだけを
Git追跡対象として要求する。

絶対パス、`..`、backslash、colon、URL、query、hash、認証情報、symlink、
HTML / SVG / JavaScript / ZIP / PDF / 実行可能形式は拒否する。

## cropとrotationの順序

crop座標は**回転前の原画像座標**である。派生画像ではcrop後に`rotationDegrees`を適用する。
原画像は上書きしない。

回転後の期待寸法:

- `0` / `180`: width = crop.width、height = crop.height
- `90` / `270`: width = crop.height、height = crop.width

## 歴史情報保護

切り取り許可（`removedElements`）:

- capture-background / ruler / color-chart / shelfmark-label / mounting-border / non-content-margin

除去してはいけない情報:

- 原題、方角、凡例、識語、年代、版元、家紋
- 地図・図面本体、史料上の注記
- 原本自体に記載された縮尺や採寸情報

`technicalReviewStatus=approved`および`publicationStatus=published`では
`preservesHistoricalContent=true`が必須。falseの資料は`candidate`または`shortlisted`に留める。

## 権利ゲートと商用利用

`published`には次がすべて必要である。

- rights / technical ともに approved
- commercialUseAllowed / redistributionAllowed / modificationAllowed / croppingAllowed がすべて true
- licenseUrl が認証情報なしの HTTPS
- licenseCategory が public-domain / cc0 / cc-by / custom-commercial-open のいずれか
- attribution.ja / derivativeDisclosure.ja
- derivedFile と publicPath
- preservesHistoricalContent=true

将来の広告・寄付導入でも使えるよう、商用利用を含む条件を要求する。
NC・ND・利用条件不明・申請が必要なだけで許諾未取得の画像は`published`にできない。
`licenseCode`は区切り文字でtoken化し、NC / NONCOMMERCIAL / ND / NODERIVATIVES /
ALL-RIGHTS-RESERVED / ARRを誤った部分文字列一致なしに拒否する。

publishedでは`licenseCategory`と`licenseCode`も最低限一致させる。`cc0`はCC0、
`cc-by`はCC-BY、`public-domain`はPD / PDM / Public-Domainの明示が必要である。
`custom-commercial-open`はCC / CC0 / Public-Domain等の別カテゴリを名乗れず、
候補台帳のrights evidenceと商用・再配布・改変・crop許可をすべて要求する。

## attribution / derivative disclosure

利用者向け表示のための出典表示（`attribution`）と、切り抜き・回転などの派生加工の開示
（`derivativeDisclosure`）を必須フィールドとして持つ。日本語正本、英語任意。

## sourceId相互参照

非空台帳では`sourceId`が`data-curation/historical-raster-candidates.json`の
`candidateId`と一致する必要がある。`published`では対応候補の
`rightsReviewStatus=approved`と、商用・再配布・改変・cropの全許可が必須。
asset側は候補側より保守的なstatus・booleanへ下げられるが、候補側の能力を超えられない。
`custom-commercial-open`では候補台帳のrights evidenceも必須とする。

## display catalog相互参照

`data-curation/historical-map-display-catalog.json`を読み、次を監査する。

- `reference-asset` bindingの`assetId`が本台帳に存在する
- display mapが`published`ならassetも`published`
- display mapとassetの`sourceId`が一致
- published assetはsourceIdが一致するpublished display mapから1件以上参照される
- display未接続の段階導入はassetを`shortlisted`に留め、publicPathとpublicファイルを持たせない
- `historical-raster` bindingはこの台帳の対象外
- 空display catalog + 空asset台帳は正常

reference asset監査は`public/data/historical-rasters`や
`src/historical-raster-registry.json`の内容を承認・拒否しない。ラスタの正当性は
`npm run audit:historical-rasters`へ委譲し、reference assetがhistorical-raster bindingを
置換することは表示カタログ側の型・相互参照規則で引き続き禁止する。

## 監査

```bash
npm run audit:historical-reference-assets
npm run verify:historical-reference-assets-local
```

通常auditはpublished public画像を必須検証し、存在するraw / derivedも検証する。
local verifierは非rejected assetのrawと、宣言済みderivedを必須検証する。

実ファイルでは通常ファイル・symlink不使用・SHA-256・bytes・MIME magic・拡張子・寸法を
metadataと照合する。PNGはsignatureとIHDR、WebPはRIFF/WEBPと画像chunkを解析し、
派生画像はVP8Lのlossless WebPのみ許可する。published件数が0なら公開ディレクトリ自体を
拒否し、1件以上なら宣言済み`publicPath`だけを許可して欠落・orphan・隠し項目・余分な階層を拒否する。

公開画像一覧はbuild時に`dist/places/manifest.json`の`historicalReferenceAssets`へ
publicPath・SHA-256・bytesを記録し、auditで台帳との双方向一致を確認する。0件時は項目を
追加しないため、既存manifestの内容とSHAを変えない。
