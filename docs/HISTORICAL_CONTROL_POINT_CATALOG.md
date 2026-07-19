# 歴史基準点カタログ

## 目的

複数の古地図から参照できる、現代側の歴史的ランドマーク候補を管理する。
古地図ごとの画像pixel基準点（`control-points.json`）とは別物であり、カタログ登録だけでは
transform点やvalidation点として使えない。各古地図上の同一点性とpixel位置は、地図単位の
別監査が必要である。

## 今回の範囲

schema version 1の空の安全基盤だけを追加した。本番カタログの`entries`は0件である。
桜田門・大手門・清水門を含む実在地点の調査・登録、座標推測、Web検索からの登録、
AIによる座標生成は行っていない。歴史地点データは後続の独立調査PRで追加する。

空カタログから始める理由は、権利確認済み候補があっても公式根拠付きtransform/validation点が
不足している段階で、推測座標や未監査地点を本番データへ混入させないためである。

## 管理する区別

カタログは次を区別する。

- 現存する建造物・地形（`extant`）
- 現存する遺構（`archaeological-remains`）
- 公的に位置が確定した消失地点（`officially-located-lost-site`）
- 不確実な地点（`uncertain`）
- 移設された対象（`moved` / `possibly-moved`）
- transformへ使える可能性（`eligible-candidate`）
- validationへ使える可能性（`validation-only-candidate`）
- 使用不可（`hold` / `rejected`）

`eligible-candidate`は候補としての適格性だけを示し、自動的にtransform確定を意味しない。

## 公的根拠・現存性・移設・座標精度・eligibility

公的根拠を優先する。各entryは`sourceIds`とHTTPSの`evidenceUrls`を必須とし、
`identityBasis`と`coordinateBasis`で同一点性と座標の根拠を日本語で記録する。

座標精度（`coordinateAccuracy`）は`surveyed`、`official-gis`、
`official-published-coordinate`、`official-map-derived`、`approximate`、`unknown`を使う。
`eligible-candidate`は次を拒否する。

- `currentExistence: uncertain`
- `movedStatus: moved` または `possibly-moved`
- `coordinateAccuracy: approximate` または `unknown`
- `sourceIds` / `evidenceUrls` の欠落

`validation-only-candidate`は`uncertain`、`moved`、`unknown`座標を拒否する。
`rejected`には`rejectionReason`が必須である。

## 日本語正本と英語任意

日本語を正本とする。`LocalizedText`は`{ ja: string; en?: string }`であり、
`src/historical-raster-localization.ts`と同じ拒否条件（空文字、前後空白、HTML、制御文字）を
監査スクリプト側で再実装して検証する。runtimeコードへの依存は作らない。

英語は任意である。存在する英語欄だけを検証し、日本語の複製、自動翻訳、翻訳API、
外部翻訳script、実行時フォールバック通信は使わない。

## 配置と監査

- 正本: `data-curation/historical-control-point-catalog.json`
- 検証: `npm run audit:historical-control-points`
- 公開前監査: `npm run audit:prepublish` から呼び出す

カタログはruntime（`src/main.ts`）へ接続せず、public JSONとしても配信しない。
テストfixtureはテストコード内だけに置き、`dist/`やPagesへ含めない。
