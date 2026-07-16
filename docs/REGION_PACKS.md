# 地域パック追加ガイド

## 地域パックとは

地域パックは「地域 → 利用可能な年代 → その地域・年代で表示できる承認済みデータ、レイヤー、出典」を一組として管理する定義です。現在の本番用パックは東京・江戸 `edo` の1件だけです。京都・滋賀・大阪の定義やデータは未導入です。

年代そのものの名称と年範囲は `src/era-catalog.json` と `EraDefinition` が管理します。地域固有の設定は `src/regions/*-pack.json` と次の型へ分離します。

- `RegionDefinition`: 地域ID、日本語・英語名、bounds、初期中心、初期ズーム、初期年代、有効年代、有効状態
- `RegionEraDefinition`: 年代ID、有効状態、基図モード、表示レイヤー、承認済みデータセットID、地点データセットID、出典ID、注意文
- `EraDefinition`: 地域に依存しない年代ID、表示名、開始年、終了年

`RegionRegistry` は重複ID、不正座標、bounds外中心、不正ズーム、存在しない年代、無効な初期年代、未承認データセット、未登録出典を起動時に拒否します。返却定義はコピーして凍結され、テストでは独自Registryを注入できます。

## 新しい地域を追加する手順

1. 史実・座標を含まないテストでは、次のような架空fixtureを使います。

   ```ts
   const EXAMPLE_REGION = {
     id: "example",
     label: "例示地域",
     enabled: false,
   };
   ```

2. 本番パックでは、根拠を確認した地域bounds、初期中心、初期ズームだけを登録します。中心はbounds内でなければなりません。
3. 年代を `src/era-catalog.json` へ登録し、地域パックの `enabledEraIds` と各 `RegionEraDefinition` を対応させます。年代カタログへ地域固有のレイヤーや出典を入れません。
4. 歴史データは先に `DATA_SOURCES.yml` で個別ライセンス、再配布・改変可否、指定出典、位置精度、SHA、`review_status: approved` を確認します。未承認・pending・rejectedデータを地域パックから参照してはいけません。
5. approved IDと固定公開パスを `src/dataset-manifest.json` へ登録します。地域IDからURLやパスを生成せず、外部URL、絶対パス、`..`を使いません。
6. データ種別に応じた専用検証loaderを `src/datasets.ts` で割り当てます。地名・面・線の検証を安全性の弱い汎用JSON検証へ置き換えません。
7. 固定の出典IDを `src/attribution-registry.ts` と出典画面へ登録し、地域・年代バインディングの `attributionIds` からだけ参照します。
8. `visualLayers` に基づき、その地域に存在しないコントロールを非表示または無効にします。有効地域が1件なら地域selectは非表示、2件以上なら表示します。

## 地域切り替えと読み込み

地域変更では既存の `L.Map` を再利用し、新地域の初期中心・ズーム・初期年代へ移動します。情報カードは閉じますが、利用者が取得した現在地マーカーと精度円は削除しません。年代変更だけでは中心・ズーム・現在地を維持します。

データはページ内Promiseキャッシュで再利用します。localStorage、IndexedDB、Cache API、Service Workerは使いません。読み込み失敗はキャッシュから除去して再試行可能にします。世代番号と地域IDを照合し、旧地域の遅い成功、エラー、レイヤー、出典を現在地域へ反映しません。

データ種別ごとにエラーを分離し、1データの失敗で現代地図、別の歴史レイヤー、現在地、出典・プライバシー画面を停止させません。利用者向けには固定文だけを表示します。

## 公開前監査とテスト

`npm run audit:prepublish` は年代・地域・データセットmanifestを読み、少なくとも次を照合します。

- 有効地域、地域ID、初期年代、有効年代
- 地域パックのデータセットIDと `DATA_SOURCES.yml` のapproved状態・`local_files`
- 固定ローカルパス、公開ファイル、公開SHA、GeoJSONの`sourceId`
- CSP、外部通信先、原データ、source map、Service Worker、Actions SHA、古地図画像承認ゲート

新地域ではRegionRegistry、URL、地域UI、中心・ズーム、現在地保持、地域別レイヤー・出典、非同期競合、重複fetch、失敗後再試行、アクセシビリティのテストを追加します。公開前には個別のライセンスと位置精度を再確認し、ブラウザ手動QAも別途実施します。

既存の `edo-places.geojson` は公開URLと内容を維持するため `sourceId` を後付けしません。この1ファイルに限り、固定SHA、approved ID、固定パス、各FeatureのCODH公式`source` URLを組み合わせて同一性を検証します。新規データは固定`sourceId`を必須とします。
