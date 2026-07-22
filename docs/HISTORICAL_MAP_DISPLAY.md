# 古地図表示カタログ

## 目的

表示範囲・ズーム・資料種別に応じて、将来の古地図自動切替を安全に行うための
表示カタログ基盤である。今回は空の安全基盤だけを追加し、古地図画像・実在資料・
位置合わせ・UI・runtime接続・public成果物は含めない。

## 今回の範囲

schema version 1の空カタログから開始する。本番`maps`は0件、
`catalogStatus`は`empty-foundation`である。coverageや座標の推測、実在古地図の登録は行わない。

空カタログの間はruntimeとpublicへ接続しない。

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
- `reference-only`は`parentMapId`必須で、parentは`overview` / `regional` / `detail`
- `reference-only`を他mapのparentにできない
- childとparentの`regionId` / `eraId`は一致

`georeferenced-overlay`の親子では表示空白を避けるため、

- `parent.zoom.maximum >= child.zoom.enterDetailAt`
- `child.zoom.minimum <= parent.zoom.maximum`

を要求する。`reference-panel`にはこのズーム重複条件を必須としない。

`priority`は数値が大きい方を優先し、同値では`id`の昇順で決定する。
runtime実装は今回行わない。

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
