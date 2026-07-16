# いま・むかし地図 (edo-history-map)

現在の地図と江戸後期(嘉永〜文久期、1849–1862年頃)の江戸地名・町家領域・
江戸末期海岸線を
重ねて表示し、「いまいる場所が昔はどんな場所だったか」を確認できる、
無料・広告なし・トラッカーなしの静的 Web アプリです。

- 現在公開中の地域: 東京・江戸（東京23区周辺）のみ
- 将来の地域追加に備え、地域・年代・承認済みデータ・出典を結び付ける地域パック方式を採用
- 京都・滋賀・大阪の歴史データ、地点、画像、GISは未導入
- 公開 URL: <https://jigsawrin.github.io/edo-history-map/>

## 機能

- 地理院タイル(標準・淡色)による現代地図の表示、ズーム・パン、
  キーボード操作、モバイル対応
- 江戸後期の歴史地名 8,788 点(江戸マップ地名データセット)の重ね合わせ
- 江戸切絵図から抽出・位置合わせされた町家領域28 FeatureのCanvas表示、
  ON/OFF、専用不透明度、凡例
- 19世紀末の地図等を現代座標へ位置合わせした江戸末期海岸線3 Featureの
  Canvas表示、ON/OFF、町家と独立した専用不透明度、破線凡例
- レジストリから生成する年代選択(現代 / 江戸後期 1849–1862)
- 地図位置を維持した装飾的な歴史背景の切替、現代地図との比較表示、
  比較用基図と歴史地点を分離した不透明度設定
- 地点クリックで歴史情報カードを表示(名称・分類・収載切絵図・
  対象年代・位置の確度・出典・ライセンス)
- 「現在地を表示」ボタン(押した時のみ位置情報を1回取得。保存しない)
- アプリ内の出典・ライセンス画面、プライバシー画面

## 使用データと出典

| データ | 提供元 | ライセンス |
|---|---|---|
| 地理院タイル(標準地図・淡色地図) | [国土地理院](https://maps.gsi.go.jp/development/ichiran.html) | 出典明示で利用可(国土地理院コンテンツ利用規約) |
| 『江戸マップ地名データセット』 doi:10.20676/00000445 | [ROIS-DS人文学オープンデータ共同利用センター(CODH)](https://codh.rois.ac.jp/edo-maps/) | CC BY 4.0 |
| 「江戸切絵図」町家領域データセット doi:10.20676/00000446 | [CODH](https://codh.rois.ac.jp/edo-maps/rekichizu/index.html.ja) | CC BY 4.0 |
| 『江戸末期海岸線／水域データセット』海岸線データ doi:10.20676/00000453 | [CODH](https://codh.rois.ac.jp/historical-gis/edo-coast/) | CC BY 4.0 |

`public/data/edo-places.geojson`、`public/data/edo-machiya-areas.geojson`、
`public/data/edo-coastlines.geojson`は
上記データセットの改変版です。町家領域はWGS 84 ShapefileからGeoJSONへ
変換し、必要属性だけを保持、小数6桁丸め、ring方向を正規化しています。
海岸線は東京対象boundsと交差する公式元レコード3件を切断せず保持し、
小数6桁へ丸めています。いずれも簡略化は行っていません。
詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と
[DATA_SOURCES.yml](DATA_SOURCES.yml) を参照してください。

### 古地図画像について

江戸切絵図などの古地図「画像」そのものは、画像単位の利用条件確認が
完了していないため **本アプリには含まれていません**。コードは画像レイヤーの
追加に対応した設計ですが、現在は無効です。今後、権利確認済み
(DATA_SOURCES.yml で `review_status: approved`)の画像のみ追加できます。

現在表示できる「歴史背景＋江戸地名」は、プロジェクト独自の装飾的な
和紙風CSS背景、承認済み町家領域、承認済み江戸末期海岸線、承認済み地名ポイントで
構成しています。背景自体は古地図画像でも、当時の道路・河川・町割りの復元でもありません。
レイヤー順、未導入GIS、クロスフェード、画像承認条件は
[歴史基図レイヤー設計](docs/HISTORICAL_BASEMAP.md)を参照してください。

## 注意事項

江戸地名ポイント、町家領域、江戸末期海岸線は史料のジオリファレンスによる **推定** です。
海岸線は約20万分の1相当で、現代の浸水・津波・高潮リスクを示しません。
町家領域は正確な地籍・人口・所有・境界ではありません。古地図・歴史データを測量図や
権利関係の証拠として使用しないでください。
詳細は [DISCLAIMER.md](DISCLAIMER.md) を参照してください。

## プライバシー

- 位置情報はボタン操作時のみ1回取得し、メモリ内でのみ使用します。
  サーバー・URL・Cookie・localStorage へ保存しません。
- アクセス解析・広告・トラッカー・Cookie は使用していません。
- 地図タイル取得のため国土地理院のサーバーへ、配信のため GitHub Pages へ
  通信が発生します。詳細は [PRIVACY.md](PRIVACY.md) を参照してください。

## セットアップ(開発)

```bash
git clone https://github.com/jigsawrin/edo-history-map.git
cd edo-history-map
npm ci --ignore-scripts
npm run dev
```

### データの再生成

原データ CSV はリポジトリに含まれていません。公式配布元
(<https://codh.rois.ac.jp/edo-maps/dataset/>)から `owariya.csv` を取得し:

```bash
node scripts/convert-owariya.mjs path/to/owariya.csv
```

町家領域は公式Shapefile版をGit管理外へ展開し、`.shp`を指定して再生成します。

```bash
npm run data:convert:machiya -- path/to/machiya_all_241022.shp
```

江戸末期海岸線は公式ライン版ZIPをGit管理外へ安全に展開し、`coast.shp`を指定します。

```bash
npm run data:convert:coastline -- path/to/coast.shp
```

### 開発コマンド

```bash
npm test                  # テスト(機能・セキュリティ・アクセシビリティ)
npm run lint              # ESLint(innerHTML/eval 禁止などを強制)
npm run typecheck         # TypeScript strict
npm run build             # 本番ビルド(dist/)
npm run audit:prepublish  # 公開前監査(秘密情報・ライセンス・出典検査)
```

## 技術構成

TypeScript / Vite / Leaflet / Vitest / ESLint。
サーバー・データベース・アカウント・外部CDN・外部フォント・
アクセス解析・LLM 機能は使用していません。
実行時の外部通信先は地理院タイル(cyberjapandata.gsi.go.jp)のみで、
Content Security Policy で制限しています。

地域パックは年代カタログと地域固有の年代バインディングを分離し、承認済みデータセットIDを固定ローカルパスへ解決します。新地域の追加には、データセットごとの公式出典、個別ライセンス、再配布・改変可否、位置精度、CRS、SHAの確認が必要です。既存地域のデータや出典を別地域へ無断で流用してはいけません。

## ドキュメント

- [PRIVACY.md](PRIVACY.md) — プライバシー
- [SECURITY.md](SECURITY.md) — 脆弱性報告・セキュリティ設計
- [DISCLAIMER.md](DISCLAIMER.md) — 免責事項
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) — 第三者コンテンツの帰属
- [DATA_SOURCES.yml](DATA_SOURCES.yml) — データ管理台帳
- [DATA_LICENSE_REVIEW.md](DATA_LICENSE_REVIEW.md) — ライセンス調査記録
- [CONTRIBUTING.md](CONTRIBUTING.md) — 開発ルール
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — 脅威モデル
- [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) — アクセシビリティ設計と今後の代替操作
- [docs/HISTORICAL_BASEMAP.md](docs/HISTORICAL_BASEMAP.md) — 年代・pane・歴史画像の安全な拡張設計
- [docs/REGION_PACKS.md](docs/REGION_PACKS.md) — 地域パックの構造と安全な追加手順
- [docs/BROWSER_QA.md](docs/BROWSER_QA.md) — Canvas操作とPagesキャッシュの実ブラウザ確認手順

## ライセンス

オリジナルコードは [MIT License](LICENSE) です。
第三者の地図タイル・データ・ライブラリには適用されません
(各提供元の条件に従います)。
