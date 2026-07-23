# 古地図ラスタ候補ソース

## 候補台帳

江戸古地図候補は`data-curation/historical-raster-candidates.json`で1資料・1画像系列ごとに管理する。2026-07-22時点で16候補・4所蔵機関を登録し、権利面approved 14、pending 1、rejected 1である。用途はoverlay専用15件、reference-panel専用1件である。候補のapprovedは商用利用を含む権利条件の適合を示し、本番公開や位置精度の承認を意味しない。

reference-panel専用の和田倉御門候補は、公式JPEGを監査し、撮影補助物だけを除く保守的cropのPNGをpublished reference assetとして1件公開している。raw / derived画像はGit管理外、public PNGだけを追跡する。candidateの`intendedUses=["reference-panel"]`、測地同期・tile・control pointに使わない制約は維持し、candidate自体のtechnical/publication状態をasset/displayと同一視しない。1717年と江戸後期表示（1849–1862）の年代差、東京都立中央図書館所蔵、部分・加工、パブリックドメイン、公式資料・利用案内URLをpanelと出典dialogに示す。

schema v3では`reviewStatus`を権利審査の後方互換aliasとして残し、`rightsReviewStatus`、`technicalReviewStatus`、`publicationStatus`を分離する。さらに各候補へ`intendedUses`を必須化し、`georeferenced-overlay`（現代地図へ測地同期）と`reference-panel`（測地同期しない閲覧）を固定順で列挙する。両用途なら両方を列挙し、`both`のような別値は使わない。v2入力は明示的な移行関数で既存候補をoverlay専用としてv3へ正規化する。既存候補を自動的にreference-panel対応へはしない。

同じ題名でも所蔵館、資料コード、版、スキャン、画像SHA、歪み、基準点、位置合わせ、タイルmanifestは共有しない。`titleFamilyId`は同系統を検索するためだけに使い、画像同一性の根拠にしない。

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
