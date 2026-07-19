# 歴史参考画像台帳

## 目的

古地図表示カタログの`artifactBinding.kind = "reference-asset"`から将来参照する、
歴史参考画像専用の安全な台帳基盤である。測地同期したoverlayラスタとは別物で、
`reference-panel`向けの参考資料（図版・写真・図面など）を扱う。

今回は空の安全基盤だけを追加する。実在画像・実在資料・ファイル・crop値・URL・
座標・公開物は登録していない。

## 測地同期ラスタとの違い

| 種別 | 用途 | binding |
|------|------|---------|
| historical-raster | 地図上へ測地同期して重ねる | `georeferenced-overlay` |
| reference-asset | 参考パネルに表示する | `reference-panel` |

reference assetは正確な測地範囲や位置合わせ精度を主張しない。

## 空台帳から開始する理由

権利・派生画像・歴史情報保護・候補台帳／表示カタログ相互参照のゲートを先に固定し、
実在資料を推測登録しないためである。`catalogStatus`は`empty-foundation`、
本番`assets`は0件から始める。

## 原画像と派生画像の分離

- 原画像: `originalFile.rawPath` = `data-raw/historical-reference-assets/<asset-id>/<filename>`
- 派生画像: `derivedFile.derivedPath` = `data-derived/historical-reference-assets/<asset-id>/<filename>`
- 公開パス: `derivedFile.publicPath` = `/data/historical-reference-assets/<asset-id>/<filename>`

`rawPath`と`derivedPath`を`publicPath`にできない。原画像はGit追跡禁止。
`publicPath`は`publicationStatus=published`の場合のみ必須で、それ以外は禁止。

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
- attribution.ja / derivativeDisclosure.ja
- derivedFile と publicPath
- preservesHistoricalContent=true

将来の広告・寄付導入でも使えるよう、商用利用を含む条件を要求する。
NC・ND・利用条件不明・申請が必要なだけで許諾未取得の画像は`published`にできない。

## attribution / derivative disclosure

利用者向け表示のための出典表示（`attribution`）と、切り抜き・回転などの派生加工の開示
（`derivativeDisclosure`）を必須フィールドとして持つ。日本語正本、英語任意。

## sourceId相互参照

非空台帳では`sourceId`が`data-curation/historical-raster-candidates.json`の
`candidateId`と一致する必要がある。`published`では対応候補の
`rightsReviewStatus=approved`が必須。候補側とasset側の権利判定が矛盾する場合は監査失敗。

## display catalog相互参照

`data-curation/historical-map-display-catalog.json`を読み、次を監査する。

- `reference-asset` bindingの`assetId`が本台帳に存在する
- display mapが`published`ならassetも`published`
- display mapとassetの`sourceId`が一致
- published assetがどのdisplay mapからも参照されない場合はorphanとして失敗
- `historical-raster` bindingはこの台帳の対象外
- 空display catalog + 空asset台帳は正常

## 監査

```bash
npm run audit:historical-reference-assets
```

prepublishとCIにも統合する。空台帳の間は`src/`参照、public/dist混入、
公開参考画像ディレクトリ、source map、Service Workerを拒否する。
