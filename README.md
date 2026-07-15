# いま・むかし地図 (edo-history-map)

現在の地図と江戸後期(嘉永〜文久期、1849–1862年頃)の歴史GIS地名データを
重ねて表示し、「いまいる場所が昔はどんな場所だったか」を確認できる、
無料・広告なし・トラッカーなしの静的 Web アプリです。

- 対象地域(MVP): 東京23区周辺
- 公開 URL: <https://jigsawrin.github.io/edo-history-map/>

## 機能

- 地理院タイル(標準・淡色)による現代地図の表示、ズーム・パン、
  キーボード操作、モバイル対応
- 江戸後期の歴史地名 8,788 点(江戸マップ地名データセット)の重ね合わせ
- 年代選択(現代のみ / 江戸後期)と歴史レイヤーの透明度スライダー
- 地点クリックで歴史情報カードを表示(名称・分類・収載切絵図・
  対象年代・位置の確度・出典・ライセンス)
- 「現在地を表示」ボタン(押した時のみ位置情報を1回取得。保存しない)
- アプリ内の出典・ライセンス画面、プライバシー画面

## 使用データと出典

| データ | 提供元 | ライセンス |
|---|---|---|
| 地理院タイル(標準地図・淡色地図) | [国土地理院](https://maps.gsi.go.jp/development/ichiran.html) | 出典明示で利用可(国土地理院コンテンツ利用規約) |
| 『江戸マップ地名データセット』 doi:10.20676/00000445 | [ROIS-DS人文学オープンデータ共同利用センター(CODH)](https://codh.rois.ac.jp/edo-maps/) | CC BY 4.0 |

`public/data/edo-places.geojson` は上記データセットの改変版です
(項目抽出・GeoJSON 変換・東京23区周辺への範囲限定)。
詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) と
[DATA_SOURCES.yml](DATA_SOURCES.yml) を参照してください。

### 古地図画像について

江戸切絵図などの古地図「画像」そのものは、画像単位の利用条件確認が
完了していないため **本アプリには含まれていません**。コードは画像レイヤーの
追加に対応した設計ですが、現在は無効です。今後、権利確認済み
(DATA_SOURCES.yml で `review_status: approved`)の画像のみ追加できます。

## 注意事項

歴史データの位置は古地図のジオリファレンスによる **推定** で、
数十メートル以上の誤差を含み得ます。古地図・歴史データを測量図や
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

## ライセンス

オリジナルコードは [MIT License](LICENSE) です。
第三者の地図タイル・データ・ライブラリには適用されません
(各提供元の条件に従います)。
