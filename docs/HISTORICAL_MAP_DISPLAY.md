# 古地図表示カタログ

## 目的

表示範囲・ズーム・資料種別に応じて、将来の古地図自動切替を安全に行うための
表示カタログ基盤である。今回は空の安全基盤だけを追加し、古地図画像・実在資料・
位置合わせ・UI・runtime接続・public成果物は含めない。

## 今回の範囲

schema version 1の空カタログから開始する。本番`maps`は0件、
`catalogStatus`は`empty-foundation`である。coverageや座標の推測、実在古地図の登録は行わない。

空カタログの間はruntimeとpublicへ接続しない。

## displayRole / displayMode

- `overview` / `regional` / `detail` / `reference-only`
- `georeferenced-overlay` / `reference-panel`

`reference-only`は位置合わせ済みoverlayとして使えない。
`georeferenced-overlay`との組み合わせは拒否する。

## crop / zoom / LOD

cropは元画像寸法の内側だけを許可し、width/heightは正数、
`rotationDegrees`は`0` / `90` / `180` / `270`のみとする。

zoomは`minimum <= maximum`を要求する。detailへの入退場は
`enterDetailAt > leaveDetailBelow`のヒステリシスを必須にする。

## parent関係

`parentMapId`は任意である。自己参照とparent循環は拒否する。
存在しないparentも拒否する。

## 権利・技術・公開

`rightsReviewStatus`、`technicalReviewStatus`、`publicationStatus`を分離する。
`published`には技術approvedと権利approvedを要求する。
`published`でない資料はruntime使用不可とする。
カタログ登録だけではruntime registryやpublic配信へ昇格しない。

## LocalizedText

日本語を正本とし、英語は任意。空文字、前後空白、HTML、制御文字を拒否する。
翻訳API、自動英訳、runtime通信フォールバックは使わない。

## coveragePolygon

妥当なGeoJSON `Polygon`または`MultiPolygon`のみを許可する。
閉じたリングと緯度経度範囲を検証する。推測coverageは登録しない。

## 配置と監査

- 正本: `data-curation/historical-map-display-catalog.json`
- 検証: `npm run audit:historical-map-display`
- 公開前監査: `npm run audit:prepublish` から呼び出す

監査は`src/`配下の`.ts` / `.mts` / `.js`参照、public/dist混入、
本番raster増加、公開古地図ディレクトリ、source map、Service Workerを拒否する。
`scripts/`、`tests/`、`docs/`、`data-curation/`はruntime監査対象外である。
