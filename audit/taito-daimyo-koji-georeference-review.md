# 御大名小路辰之口辺図・位置合わせ技術監査

監査日: 2026-07-18  
candidateId: `taito-2017-chi-009-daimyo-koji`  
判定: **品質ゲート不合格 / 本番公開なし**

## raw画像とIIIF

- Git除外パス: `data-raw/historical-rasters/taito-2017-chi-009/2017_chi_009_002-canvas-002.jpg`
- 公式manifest: https://adeac.jp/viewitem/taito-lib/viewer/iiif/2017_chi_009_002/manifest.json
- manifest ID: 同上
- 資料ページ: https://adeac.jp/taito-lib/catalog/mp070490-100070
- canvas: `.../canvas/p2`（index 2、地図本体）
- 取得画像: `2017_chi_009_002/002.tif/full/max/0/default.jpg`
- 取得日: 2026-07-18
- MIME / magic: `image/jpeg` / `ff d8 ff`
- JPEG: progressive DCT、8-bit、3 components、JFIF 1.02、YCbCr推定
- width × height: 4,908 × 3,472 px
- bytes: 819,585
- SHA-256: `415562a866a568c9f68b9e520baab40157654a38fd7d74170abf4da739007353`
- ICC: なし、EXIF: なし、XMP: なし、orientation: なし、埋め込みthumbnail: なし
- canvas 1: 3,096 × 4,241、表紙・題簽（地図本体ではない）
- canvas 2: 4,908 × 3,472、展開した地図本体
- canvas 3: 3,112 × 4,057、裏表紙・蔵書印等（地図本体ではない）

canvas 1・3は一時サムネイルで目視しただけで、リポジトリや公開物へ保存していない。canvas 2へ合成していない。

## 前処理

実施した派生画像処理は**なし**。原本JPEGを保持し、JPEGの再保存、AI補完、文字修正、汚れ除去、過度な色補正は行っていない。外周撮影余白の矩形切り抜き、軽微な回転、色管理、lossless出力は品質ゲート前の候補手順として検討したが、基準点ゲートに達しないため実行していない。

- 派生画像SHA: 該当なし
- 派生画像寸法・容量: 該当なし
- 使用画像処理ソフト: なし

## 変換方式比較

有効なtransform点8点と独立validation点4点がないため、数値を作るための推測点を投入しなかった。全方式は同じ前提不足により未実行である。

| 方式 | transform | validation | transform residual | validation residual | mean / median / P90 / max | 中央・端部・局所折れ・湾曲・文字 | nodata / bounds / pixels / bytes |
|---|---:|---:|---|---|---|---|---|
| projective | 0 | 0 | 算出不可 | 算出不可 | 算出不可 | 出力未生成、評価不可 | 未生成・未確定 |
| polynomial-1 | 0 | 0 | 算出不可 | 算出不可 | 算出不可 | 出力未生成、評価不可 | 未生成・未確定 |
| polynomial-2 | 0 | 0 | 算出不可 | 算出不可 | 算出不可 | 出力未生成、評価不可 | 未生成・未確定 |
| thin-plate-spline | 0 | 0 | 算出不可 | 算出不可 | 算出不可 | 推測点への過適合を避け未実行 | 未生成・未確定 |

最終方式は**選択なし**。最小残差を比較できず、TPSで見かけの残差だけを縮めることもしない。

## 残差・leave-one-out・視覚評価

- transform平均・中央値・最大: 算出不可
- validation平均・中央値・P90・最大: 算出不可
- validation個別・方向別残差: 算出不可
- 中央部と端部の差: 算出不可
- leave-one-out: 点集合が成立しないため未実施
- raw目視: 大きな文字・主要な堀・門は拡大時に判読可能。折り目、紙伸縮、局所歪み、汚れ、欠け、外周撮影余白がある。
- 変換後の端部反転・局所折れ・直線湾曲・文字伸長: 出力未生成のため未評価
- bounds、nodata、タイル容量見積り: 未確定。raw JPEG容量をlosslessタイル容量とみなさない。

## 品質ゲート v1

| 項目 | 結果 | 根拠 |
|---|---|---|
| 権利approved / 商用利用可 | 合格 | 個別資料・manifestがCC BY 4.0を明示 |
| CC BY 4.0 attribution | 設計済み・本番未登録 | 公開しないためDATA_SOURCES/runtime attributionは追加しない |
| transform 8点以上 | **不合格** | 0点 |
| validation 4点以上 | **不合格** | 0点 |
| transform / validation分布 | **不合格** | 点集合なし |
| 移設・不確実・lowをtransformへ不使用 | 合格 | transform 0、推測点を採用しなかった |
| validation平均≤150m・中央値≤100m・最大≤350m | **未評価（不合格扱い）** | 独立validationなし |
| 端部破綻・反転なし | **未評価（不合格扱い）** | 派生出力なし |
| 文字可読 | rawのみ概ね可 / 変換後未評価 | losslessタイル未生成 |
| bounds確定 | **不合格** | 未確定 |
| 誤差・方式公開 | **不合格** | 定量評価・方式選択なし |
| tile≤100MiB | **未評価（不合格扱い）** | タイル未生成 |
| manifest/SHA/dimensions | rawのみ合格 / packageなし | 公開package未生成 |
| 外部画像通信なし | 合格 | runtime registry 0、CSP変更なし |

総合: **不合格**。rightsReviewStatusは`approved`を維持し、technicalReviewStatusは`rejected`、publicationStatusは`shortlisted`とする。

## 公開判断と残存制約

- 本番source: 0
- 本番raster: 0
- public tiles / manifest: 0
- UI / historical-map: 非表示のまま
- 日英静的説明ページ: 作成しない
- control points / georeference本番JSON: 作成しない

再試験には、公式根拠で同一点性・非移設・精密座標・pixelを確定した12点以上を画像全体へ分散し、8点以上をtransform、4点以上を独立validationへ事前分離する必要がある。その後に4方式、validation残差、leave-one-out、端部と文字の目視、losslessタイル容量を評価する。
