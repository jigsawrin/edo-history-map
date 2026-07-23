# 古地図表示カタログ

## 公開中のreference panel

`tokyo-archive-4300033114-wadakura-gate-reference-display`は2026-07-23にtechnical approved / publishedとなった。`displayRole=reference-only`、`displayMode=reference-panel`、`spatialBinding.kind=display-trigger-area`を維持し、trigger polygonは案内判定専用で、史料の測地範囲・史跡境界ではない。東京・江戸、中心点がpolygon内、zoom 17以上で案内し、表示後は16.5未満で解除する。`sourceEraId=edo-middle`は資料metadataであり、現代／江戸後期の選択を制限または変更しない。

runtimeはprivate display catalogを配信・読込みせず、`src/historical-reference-panel-registry.json`の縮約entryを専用監査でcatalogへ照合する。現在はdisplay 1、published 1、runtime eligible 1、runtime registry 1である。

## 目的

表示範囲・ズーム・資料種別に応じて、将来の古地図自動切替を安全に行うための
表示カタログ基盤である。カタログ登録は古地図画像・位置合わせ・UI・runtime接続・
public成果物の公開を意味しない。

## 今回の範囲

schema version 1を維持し、監査済みの表示候補だけを登録する。
カタログはruntimeとpublicへ接続せず、`published`かつ後続実装で明示接続されるまで表示しない。

## sourceIdとartifactBinding

`sourceId`は出典識別である。実際に表示するローカル成果物は`artifactBinding`で指定する。

- `georeferenced-overlay` → `{ kind: "historical-raster", rasterId }`
- `reference-panel` → `{ kind: "reference-asset", assetId }`
- `reference-only` → `reference-panel`かつ`reference-asset`のみ

各mapの`sourceId`が指すcandidateにも同じ用途が必要である。`reference-panel`は`reference-panel`用途、`georeferenced-overlay`は`georeferenced-overlay`用途を要求し、reference専用sourceをrasterへ昇格させない。両用途の資料はcandidateに両方を列挙する。

1つのbindingに`rasterId`と`assetId`を同時に含めない。

## spatialBinding

旧`coveragePolygon`は、意味を明確にした`spatialBinding`へ置換した。

- `georeferenced-overlay` → `{ kind: "georeferenced-coverage", geometry }`
- `reference-panel` → `{ kind: "display-trigger-area", geometry }`

`display-trigger-area`は参考資料を表示する地域トリガーであり、
資料の正確な測地範囲や位置精度を意味しない。
`reference-only`を`georeferenced-coverage`にできない。

和田倉御門の登録polygonは、和田倉噴水公園、和田倉橋、和田倉門跡周辺、
門跡へ至る公園内動線を閲覧している利用者へ参考パネルを案内するための、
意図的に粗い長方形のtrigger envelopeである。1717年図の正確な測地範囲、
現存石垣の境界、歴史座標、公園の法的・管理上の正式境界を示さない。
polygonの頂点や中心はcontrol point、測地同期、史跡境界の根拠に使用しない。

## displayRole / displayMode

- `overview` / `regional` / `detail` / `reference-only`
- `georeferenced-overlay` / `reference-panel`

`reference-only`は位置合わせ済みoverlayとして使えず、`reference-panel`のみとする。

## crop / cropReview / rotation

crop座標は**回転前の原画像座標**である。派生画像ではcrop後に`rotationDegrees`を適用する。
原画像は上書きしない。

`rotationDegrees`は`0` / `90` / `180` / `270`のみ。cropは元画像寸法の内側で、
width/heightは正数とする。

`cropReview`は必須である。

- 撮影背景、定規、カラーチャート、資料番号札、表装余白などは、
  監査済み派生画像で除去可能（`removedElements`）
- 原題、方角、凡例、識語、版元、年代、家紋などの原本歴史情報は除去しない
- `preservesHistoricalContent=true`がtechnical approved / publishedの前提
- falseの資料は`candidate`または`shortlisted`に留める
- full-frame cropでは`removedElements`空配列を許可する

## parent / LOD / priority

- `overview`は`parentMapId`を持てない
- `regional`がparentを持つ場合、parentは`overview`
- `detail`は`parentMapId`必須で、parentは`overview`または`regional`
- `reference-only`は単独表示できるため`parentMapId`任意。指定時のparentは`overview` / `regional` / `detail`
- `reference-only`を他mapのparentにできない
- childとparentの`regionId` / `eraId`は一致

`georeferenced-overlay`の親子では表示空白を避けるため、

- `parent.zoom.maximum >= child.zoom.enterDetailAt`
- `child.zoom.minimum <= parent.zoom.maximum`

を要求する。`reference-panel`にはこのズーム重複条件を必須としない。

`priority`は数値が大きい方を優先し、同値では`id`の昇順で決定する。
runtimeは該当候補を同じ規則で決定し、一度に1件だけ案内する。

## 和田倉御門reference display

`tokyo-archive-4300033114-wadakura-gate-reference-display`は、publishedの
reference assetを単独の`reference-only` / `reference-panel`表示として登録する。
親overlayが存在しないため、同じ画像を使った架空のoverview / regional entryは作らない。
表示領域は`display-trigger-area`であり、`georeferenced-coverage`ではない。

trigger envelopeの確認根拠は次の公式資料である。

- [環境省 皇居外苑地区案内図](https://www.env.go.jp/garden/content/000146165.pdf) — 和田倉噴水公園、和田倉橋、和田倉濠の周辺関係を確認
- [環境省 和田倉噴水公園](https://www.env.go.jp/garden/kokyogaien/1_intro/his_07.html) — 公園と周辺施設の案内を確認
- [国土交通省・観光庁 多言語解説文データベース](https://www.mlit.go.jp/tagengo-db/R1-03068.html) — 所在地が東京都千代田区皇居外苑3-1であり、公園奥の江戸時代の石垣が和田倉橋まで続くとの説明を確認
- [国土地理院 地理院地図で得られる値等について](https://maps.gsi.go.jp/help/howtouse.html) — 国内座標はJGD2011で、地図画面上の読取値には誤差があることを確認
- [国土地理院 地理院タイル仕様](https://maps.gsi.go.jp/development/siyou.html) — 地理院タイルの座標・表示仕様を確認

登録polygonはこれら公式図面の境界を複製したものではなく、表示誘導用の保守的な
trigger envelopeである。公式案内図や地理院タイル画像はリポジトリへ転載しない。

zoomは`minimum <= maximum`と、`enterDetailAt > leaveDetailBelow`のヒステリシスを必須にする。

## LocalizedText

日本語を正本とし、英語は任意。空文字、前後空白、HTML、制御文字を拒否する。
翻訳API、自動英訳、runtime通信フォールバックは使わない。

## coverage geometry

`geometry`は妥当なGeoJSON `Polygon`または`MultiPolygon`のみを許可する。
Positionは`[経度, 緯度]`の2要素に限定し、閉じたリング、異なる頂点3点以上、
面積0でないこと、緯度経度範囲を検証する。推測coverageは登録しない。

## 権利・技術・公開

`rightsReviewStatus`、`technicalReviewStatus`、`publicationStatus`を分離する。
`published`には技術approved、権利approved、歴史情報保持を要求する。
`published`でない資料はruntime使用不可とする。
カタログ登録だけではruntime registryやpublic配信へ昇格しない。

## 配置と監査

- 正本: `data-curation/historical-map-display-catalog.json`
- 検証: `npm run audit:historical-map-display`
- 公開前監査: `npm run audit:prepublish` から呼び出す

監査は`src/`配下の`.ts` / `.mts` / `.js`参照、public/dist混入、
本番raster増加、公開古地図ディレクトリ、source map、Service Workerを拒否する。
`scripts/`、`tests/`、`docs/`、`data-curation/`はruntime監査対象外である。
