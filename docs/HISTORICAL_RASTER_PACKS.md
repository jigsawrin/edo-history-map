# 古地図ラスターパック

## 目的と非目的

古地図画像を現代測量図として扱わず、1シートを1つの`HistoricalRasterPack`として監査・表示する。
「結合」は同じLeaflet座標系でpan/zoomを共有し、シートを選択して重複範囲を比較する意味であり、
継ぎ目のない一枚へ過剰変形する意味ではない。複数シートの隙間や欠損をAI画像、推定道路、文字修正、
自動補完で埋めない。原本画像へ現在語の置換、ぼかし、自動翻訳を適用しない。

## 承認ゲート

画像単位の正確な資料ページ、公開範囲、取得方法、原著作物とデジタル画像の第三者権利、再配布、改変、
切り抜き、位置合わせ、タイル化、GitHub Pages再掲載、出典条件を確認する。一般利用案内、CODHでの表示、
Map Warperでの位置合わせ済み表示だけではapprovedにしない。不明点や問い合わせが残る場合は画像を
取得・コミット・公開せず、sourceとrasterをpending/rejectedにする。

公開には次のすべてが必要である。

- `DATA_SOURCES.yml`の具体的なsource IDが`historical-raster`かつapprovedで、5つの利用可否がtrue。
- `HistoricalRasterDefinition.reviewStatus`もapprovedで、source承認一覧に含まれる。
- region/era/attributionと地域パック参照が一致する。
- 原本SHA、control points、georeference metadata、tile manifest、監査レビューが一致する。
- `npm run audit:historical-rasters`と`npm run audit:prepublish`が成功する。

## 定義とシート境界

定義は固定ID、region/era/source/attribution、ローカルtile/manifest、PNGまたはlossless WebP、256px、
min/max/maxNative zoom、bounds、不透明度、変換方式、基準点数、推定・最大誤差、年代、範囲、注意、
`single-sheet`/`manual-selection`/`fixed-priority`、priority、review statusを持つ。複数シートは配列で
保持するが1枚だけを表示し、自動fitBoundsや透明合成をしない。範囲外は文字で案内し、利用者操作で
範囲表示する機能を将来追加できる。

## manifestとファイル配置

公開タイルは`public/data/historical-rasters/<id>/`、基準点と位置合わせmetadataは
`data-curation/historical-rasters/`へ置く。`data-raw/`と`data-derived/`はGit除外し、原本、巨大な中間画像、
QGIS/GDAL/Photoshop/Map Warper一時物、ZIP、OS metadataを公開しない。

manifest schema 1はraster/source/region/era、XYZ、format、256px、zoom、bounds、原本SHA、位置合わせmetadata
SHA、tile count、total bytes、全ファイルの相対path/SHA/bytes/width/heightを固定する。絶対パス、drive
letter、colon、backslash、`..`、重複、欠損、orphan、symlink、SVG、HTML、ZIP、JPEG、不正magic bytes、
不正寸法を拒否する。上限は個別5MiB、総100MiB、2万tile、zoom 22。初回画像は50MiB未満を目標にし、
100MiBを超えたら導入を止める。文字可読性を落とす損失圧縮は使わない。

## 基準点と誤差

基準点JSONは画像寸法、固有ID、画像内pixel、緯度経度、対応根拠、high/medium/low、固定source IDを持つ。
現存する門、寺社、橋、河川合流、城郭遺構を優先し、移設碑や消失対象を確定点にしない。最低数だけで
承認せず、変換方式と範囲に応じて四隅を含む空間分布と誤差評価を確認する。georeference metadataは
方式、基準点数、ソフトとversion、平均・中央値・最大誤差、範囲、歪み、隣接シート不一致、入力SHAを固定する。

UIでは推定誤差と最大誤差を区別し、nullを0mにしない。古地図は地籍、所有権、境界、測量、防災判断に
使えず、隣接シートと一致しないことを明示する。不適切表現を肯定せず、研究・歴史資料として原本表記を
保持した旨を別テキストで説明する。

## 表示・競合・プライバシー

`historical-map`は古地図、承認済みvector、歴史地点を表示して現代基図を隠す。`compare`は古地図と現代基図、
vector、地点を表示する。`points`は現代基図と地点だけ、`reconstructed`は画像未導入時の和紙風互換背景である。
古地図がないregion/eraでは`historical-map`と操作fieldsetを表示しない。

同じ`L.Map`を維持し、220ms遷移（reduced motionは即時）で中心、zoom、現在地・精度円、地点選択、カード、
検索、テーマ、年表状態を維持する。manifestは同一originから読み、ページ内Promiseで再利用する。地域tokenと
古地図世代番号で地域・年代・mode・sheetの高速変更、読込中の非表示、古い完了、失敗、tileerrorを処理する。
Service Worker、Cookie、localStorage、sessionStorage、IndexedDB、URL保存、外部画像通信を使わない。

## テストfixtureと現在の状態

`tests/fixtures/historical-rasters/project-grid/`はプロジェクトが決定的に生成する256×256 PNG 2枚の自作格子で、
manifest、bounds、zoom、opacity、欠損、orphan、SHA、bytes、magic bytes、寸法、基準点分布を検証する。
本番レジストリや`dist/`へ入れず、利用者向けに古地図と表示しない。

2026-07-18の候補「大名小路神田橋内内桜田之図」（NDL書誌ID `000007297269`）は紙資料の書誌情報までしか
確認できず、画像単位の取得・権利条件が不足したため不承認とした。公開画像、tile、静的説明ページは0件で、
江戸後期の`reconstructed`表示と京都・滋賀を維持する。東京8,788地点の整理は別フェーズである。
