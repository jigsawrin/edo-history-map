# 歴史基図レイヤー設計

## 年代レジストリ

`src/eras.ts` の `EraRegistry` が年代UI、基図モード、表示候補レイヤー、
地名データセット、出典、推定表示の注意文を一元管理する。UIへ表示する年代は
`enabled: true` の定義だけで、`meiji` や `edo-early` は権利確認済みデータと
表示設計が揃ってから定義を追加する。

江戸後期で現在実装済みなのは、CSSによる自作の和紙風背景
`reconstructed-background`、承認済み江戸末期海岸線`historical-coastline`、
承認済み町家領域`historical-commoner-areas`、承認済み8,788地名
`historical-points`である。水域、堀、街道、武家地、
寺社地、江戸城・城門はデータ未導入のため実行時レイヤーを作らない。

## Leaflet pane と重なり順

| pane | z-index | 内容 |
|---|---:|---|
| `modern-base-pane` | 200 | 地理院タイル |
| `historical-raster-pane` | 240 | 自作背景、将来の承認済み古地図画像 |
| `historical-water-line-pane` | 300 | 江戸末期海岸線（町家と独立した不透明度） |
| `historical-area-pane` | 320 | 町家領域、将来の承認済み面データ |
| `historical-line-pane` | 360 | 将来の堀・街道などの線 |
| `historical-points-pane` | 420 | 江戸地名ポイント(Canvas優先) |
| `current-location-pane` | 650 | 現在地マーカー・精度円 |
| `ui-overlay` | 700 | 将来の地図内UIオーバーレイ |

`historical-points-pane` だけは `pointer-events: auto` とし、Canvas rendererの
座標ヒットテストへクリック・タップを届ける。他の現行paneは
`pointer-events: none` とし、背景や現在地表示がドラッグ・ズームを遮らない。
海岸線と町家領域は別々のCanvas rendererへ`interactive: false`で描画し、
各paneのopacityは相互に影響しない。地点markerは
`bubblingMouseEvents: false` により、選択クリックを空白地点用の
地図クリック処理へ伝播させない。

年代変更では既存の `L.Map` を破棄せず、対象レイヤーの追加・不透明度変更・
削除だけを行う。そのため中心、ズーム、現在地、選択地点、情報カード、
フォーカス、基図の標準/淡色設定はそのまま残る。

## 江戸後期の表示モード

- 歴史背景＋江戸地名: 自作の和紙風CSS背景、江戸末期海岸線、町家領域、江戸地名。現代地図は非表示。
- 現代地図と比較: 上記に地理院タイルを比較用不透明度で重ねる。
- 現代地図＋江戸地名: 地理院タイルと江戸地名。海岸線・町家領域はモード切替時にOFFとなるが、利用者がONにできる。

町家領域は28 Feature・8,243頂点のGeoJSONを同一オリジンから一度だけ読み込み、
検証後にメモリ内で再利用する。形状簡略化は行わない。専用チェックボックスと
不透明度スライダーはレイヤー表示だけを変更し、`L.Map`を再作成しない。

海岸線はLineString 3 Feature・131,462頂点・約2.86MiBを同一オリジンから一度だけ
読み込み、専用上限で検証する。東京対象boundsと交差する公式元レコードを丸ごと
保持するため一部は広域に及ぶが、線の切断・簡略化・補間・結合は行っていない。
公式入力のNull Shape 2件は公開しない。水域ポリゴンや河川・池の分類は未導入である。

和紙風背景は古地図原本の複製でも地形データでもない。架空の海岸線、道路、
敷地境界は描かない。外部フォント・画像・アイコンも使用しない。
内部の `baseMode: "reconstructed"` と表示モード値 `reconstructed` は将来互換の
ため維持するが、現在の利用者向け名称に「復元地図」は使用しない。

## クロスフェード

`LayerTransitionController` が表示中レイヤーをIDで管理し、220msで切り替える。
切替タイマーは常に1本だけで、新しい変更時に旧タイマーを破棄する。最後の
変更に不要なレイヤーは完了時に削除する。`prefers-reduced-motion: reduce` では
時間を0にして即時切替する。

## 古地図画像の承認ゲート

`historical-image` は設計済みだが、実行時レジストリは空である。画像を有効に
するには次をすべて満たす必要がある。

1. `DATA_SOURCES.yml` へ `asset_type: historical-raster` で登録する。
2. `review_status: approved` とする。
3. 再配布、改変、切り抜き、位置合わせ、タイル化の許可をそれぞれ `true` で記録する。
4. 必須出典、対象年代、地理的範囲を記録する。
5. `public/data/historical-rasters/` 配下の全ファイルとSHA-256をJSON manifestへ
   記録し、台帳の `sha256_manifest` と `sha256` でmanifest自体も固定する。
6. `HistoricalRasterDefinition` と承認source IDの両方へ一致する定義を登録する。
7. ビルド後に公開前監査を通す。

pending/rejectedの台帳項目がローカルファイルを持つ場合、条件が不足したapproved
画像、SHA-256不一致、台帳にない画像、公開物だけに混入した画像は監査で失敗する。

古地図原本には当時の社会的背景を反映し、現在では不適切な名称・区分・表現が
含まれる場合がある。将来画像を導入するときは、原本の改変ではなく文脈説明を
併記するための注意欄を有効にする。
