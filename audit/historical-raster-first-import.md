# 江戸古地図・初回技術検査

検査日: 2026-07-18

結論: **権利条件は適合、画像検査は合格、位置合わせ・誤差評価が未完のため本番導入見送り。**

## 検査対象

- candidateId: `taito-2017-chi-009-daimyo-koji`
- rasterId: なし（本番昇格しない）
- 資料名: 御大名小路辰之口辺図
- 所蔵機関: 台東区立中央図書館
- 資料ID: `2017_chi_009`
- 画像単位: `2017_chi_009_002` canvas 2
- 原本年代: 嘉永2年（1849）改
- 個別資料: https://adeac.jp/taito-lib/catalog/mp070490-100070
- IIIF manifest: https://adeac.jp/viewitem/taito-lib/viewer/iiif/2017_chi_009_002/manifest.json
- 取得URL: https://iiif.adeac.jp/iiif/3/1310615100%2F2017_chi_009_002%2F002.tif/full/max/0/default.jpg
- 権利: CC BY 4.0
- 商用利用: 可
- 再配布・加工・切り抜き・位置合わせ・タイル化: 可（表示条件を満たす）

## ファイル検査

- 取得先: `data-raw/historical-rasters/taito-2017-chi-009/`（Git除外）
- manifest canvas数: 3
- 地図本体: canvas 2（表紙・裏面と分離）
- 形式: JPEG（公式IIIF配信形式）
- bytes: 819,585
- width × height: 4,908 × 3,472 px
- SHA-256: `415562a866a568c9f68b9e520baab40157654a38fd7d74170abf4da739007353`
- JPEG marker: progressive DCT、8-bit、3 components、JFIF 1.02
- color space: YCbCr（JFIFからの推定）
- EXIF / XMP / orientation: なし
- ICC profile: なし
- 埋め込みサムネイル: なし
- ログイン・paywall: なし

## 目視検査

- 画像は地図本体であり、表紙・裏面・断片ではない。
- 外周に白い撮影余白がある。公開候補化する場合は地図本体を損なわない矩形で切り抜き、加工表示を付す。
- 主要な堀、門、屋敷区画、比較的大きな文字は判読できる。細字は拡大時に読めるが、公式JPEG由来の圧縮を含む。
- 大きな傾きは見られないが、折り目、紙の伸縮、局所歪み、汚れ、欠けがある。
- 江戸城、内外の堀、門が広く分布し、基準点候補は複数ある。
- 地図上の方向・縮尺は現代測量図と一致せず、単一の四隅変換だけで精度を保証できない。

## 位置合わせ検査

- control points候補監査: `audit/taito-daimyo-koji-control-points.md`
- georeference技術監査: `audit/taito-daimyo-koji-georeference-review.md`
- control points本番JSON: 未作成
- 確定基準点数: 0
- 変換方式: 未決定
- 使用ソフト: 未使用
- 平均誤差: 未評価
- 中央値誤差: 未評価
- 推定誤差: 未評価
- 最大誤差: 未評価
- bounds: 未確定
- tile形式・zoom・tile数・総容量: 未算出
- tile manifest SHA: 該当なし

15候補を公式資料で検討したが、transformへ昇格できる点0、独立validationへ昇格できる点0だった。門・堀・橋の候補を目視できるだけではapprovedにしない。現存性、移設の有無、現代座標の一次根拠を確認し、画像四隅付近を含む分散、変換に使わない検証点、残差の平均・中央値・P90・最大値を揃える必要がある。raw JPEGの容量はlossless PNG/WebPタイル容量の予測値には使わない。

## 導入見送りの理由

権利ゲートは通過したが、位置精度ゲートを通過していない。基準点0、誤差未評価、bounds未確定の値を推測で埋めると、古地図を現代測量図のように誤認させるため、本番source、attribution、raster definition、地域パック、公開タイル、静的説明ページを追加しない。

画像を別シートと合成せず、隙間・継ぎ目・歪みを補完しない。次回はこの1シートを優先し、位置合わせレビューを完了してからタイル容量と文字可読性を検査する。
