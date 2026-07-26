# 古地図ラスタ候補ソース

## 候補台帳

江戸古地図候補は`data-curation/historical-raster-candidates.json`で1資料・1画像系列ごとに管理する。2026-07-26時点で17候補・4所蔵機関を登録し、権利面approved 15、pending 1、rejected 1である。用途はoverlay専用15件、reference-panel専用2件である。候補のapprovedは商用利用を含む権利条件の適合を示し、本番公開や位置精度の承認を意味しない。

reference-panel専用の和田倉御門候補は、公式JPEGを監査し、撮影補助物だけを除く保守的cropのPNGをpublished reference assetとして1件公開している。raw / derived画像はGit管理外、public PNGだけを追跡する。candidateの`intendedUses=["reference-panel"]`、測地同期・tile・control pointに使わない制約は維持し、candidate自体のtechnical/publication状態をasset/displayと同一視しない。1717年と江戸後期表示（1849–1862）の年代差、東京都立中央図書館所蔵、部分・加工、パブリックドメイン、公式資料・利用案内URLをpanelと出典dialogに示す。

schema v3では`reviewStatus`を権利審査の後方互換aliasとして残し、`rightsReviewStatus`、`technicalReviewStatus`、`publicationStatus`を分離する。さらに各候補へ`intendedUses`を必須化し、`georeferenced-overlay`（現代地図へ測地同期）と`reference-panel`（測地同期しない閲覧）を固定順で列挙する。両用途なら両方を列挙し、`both`のような別値は使わない。v2入力は明示的な移行関数で既存候補をoverlay専用としてv3へ正規化する。既存候補を自動的にreference-panel対応へはしない。

同じ題名でも所蔵館、資料コード、版、スキャン、画像SHA、歪み、基準点、位置合わせ、タイルmanifestは共有しない。`titleFamilyId`は同系統を検索するためだけに使い、画像同一性の根拠にしない。

### 同一資料内の画像単位

1つの帖・冊子・公式資料ページに複数画像がある場合、`exactItemUrl`だけでは個別図を識別できない。その場合は任意objectの`imageUnit`（安定slugの`id`、公式資料内の`ordinal`、公式に確認できる`labelJa`）で画像単位を明示する。共有判定にはraw文字列ではなく、hostnameの大小文字、default HTTPS port、query順を正規化したcanonical URL keyを使う。同じcanonical keyを共有する候補では全件に`imageUnit`と同一の`titleFamilyId`を要求し、provider、holding institution、series、publication year、historical periodも一致させる。source image-unit keyは`canonical exactItemUrl + "#" + imageUnit.id`、単一画像資料は`canonical exactItemUrl + "#whole-item"`とする。台帳内のURL文字列自体は書き換えない。

`exactItemUrl`にはfragment、認証情報、前後空白、制御文字を許可しない。query parameterを人工的に追加して別資料扱いにすることも認めない。特にTOKYOアーカイブの`archive.library.metro.tokyo.lg.jp/da/detail`は、公式資料識別子である空でない`tilcod`をちょうど1件だけ許可し、ほかのquery keyや重複を拒否する。同一公式資料内の別図はURL変更の代替として`imageUnit`で区別する。

`imageUnit`は既存の単一画像候補には不要な後方互換フィールドであり、既存recordやv1/v2移行を無効にしないためschemaVersionは3のまま維持する。第1図和田倉御門と第2図馬場先御門は[同じ東京都立図書館公式資料ページ](https://archive.library.metro.tokyo.lg.jp/da/detail?tilcod=0000000002-00006960)に収録される別candidate・別画像単位である。両方ともreference-panel専用で、`georeferencingAllowed`と`tilingAllowed`は`null`とする。[公式画像利用案内](https://archive.library.metro.tokyo.lg.jp/da/windowRequestImage2)では帰属等は義務ではないお願いとされるが、本プロジェクトでは資料名・東京都立中央図書館所蔵・部分／加工を必ず表示する。

馬場先御門の現代位置調査では、[千代田区文化財サイト](https://www.edo-chiyoda.jp/knainobunkazai/bunkazaisign_hyochu_setsumeiban/1/5/53.html)が「皇居外苑1先、馬場先門交差点から皇居外苑方面の歩道植栽内」を案内し、[千代田区観光協会](https://visit-chiyoda.tokyo/app/spot/detail/237)が馬場先門橋を皇居外苑1に置き、石垣の一部が残ると説明している。ただしcandidate段階ではtrigger polygon、確定座標、測地範囲を登録しない。画像取得、asset、display、runtime registry、public画像も未登録である。

## 商用利用ゲート

このサイトは広告表示・寄付募集の可能性がある一般公開ブログである。NC、商用可否不明、再配布・加工・切り抜き条件不明、画像単位の条件なし、ログイン・申請・paywallが必要な画像をapprovedにしない。

権利permissionとtechnical suitabilityは別に審査する。全approved候補には商用・再配布・改変・crop許可、highの権利適合性、公開取得経路、ログイン・paywall不要を求める。`georeferenced-overlay`を含む場合だけ、さらに`georeferencingAllowed`と`tilingAllowed`をtrueで必須にする。`reference-panel`専用では両値をtrue/false/nullのいずれでも許可し、権利approved条件には使わない。用途追加は資料ごとの権利・技術監査を経て行う。

## 本番昇格

権利approved候補から最大3シートを初回技術検査対象にする。本番HistoricalRasterPackへ昇格するには、さらに原本SHA、地図本体の画像単位、十分に分散した基準点、独立誤差評価、bounds、lossless tile、容量、control points、georeference metadata、tile manifest、DATA_SOURCESの具体的なapproved source、attributionを揃える。

どれかが不足すれば候補台帳には残すが、runtime registry、地域パック、`public/`、Pagesへ入れない。権利が明確でも、位置誤差を0mや推測値として扱わない。

## 複数シート

複数候補は1シートずつ選択する。全シートを同時合成せず、自動fitBoundsもしない。現在表示範囲と交差しない場合は文字で案内し、「この古地図の対象範囲を表示」を利用者が押した場合だけ移動する。シートごとのpriorityは初期選択候補を決めるための固定順であり、継ぎ目を透明合成で隠すために使わない。

## 現在の公開状態

2026-07-18の技術検査では、CC BY 4.0の台東区版「御大名小路辰之口辺図」1件だけをGit除外の`data-raw/`へ取得した。公式根拠でtransform 8点と独立validation 4点を確定できなかったため、rights `approved`、technical `rejected`、publication `shortlisted`とした。本番ラスタは0件、公開画像・タイル・静的説明ページは0件である。地図版は外部アーカイブへ画像通信せず、CSP、Cookieなし、storageなしを維持する。
