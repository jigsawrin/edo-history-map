# 古地図ラスタ候補ソース

## 候補台帳

江戸古地図候補は`data-curation/historical-raster-candidates.json`で1資料・1画像系列ごとに管理する。2026-07-18時点で15候補・4所蔵機関を登録し、権利面approved 13、pending 1、rejected 1である。候補のapprovedは商用利用を含む権利条件の適合を示し、本番公開や位置精度の承認を意味しない。

同じ題名でも所蔵館、資料コード、版、スキャン、画像SHA、歪み、基準点、位置合わせ、タイルmanifestは共有しない。`titleFamilyId`は同系統を検索するためだけに使い、画像同一性の根拠にしない。

## 商用利用ゲート

このサイトは広告表示・寄付募集の可能性がある一般公開ブログである。NC、商用可否不明、再配布・加工・切り抜き条件不明、画像単位の条件なし、ログイン・申請・paywallが必要な画像をapprovedにしない。

候補approvedには`commercialUseCompatible`、`redistributionAllowed`、`modificationAllowed`、`croppingAllowed`、`georeferencingAllowed`、`tilingAllowed`をすべてtrueで記録する。加えて、個別資料URL、画像またはviewer URL、取得経路、帰属条件を必須にする。`npm run audit:historical-raster-candidates`は10候補以上、3機関以上、IDと資料URLの一意性、HTTPS、status列挙、approvedの全権利条件を検証する。

## 本番昇格

権利approved候補から最大3シートを初回技術検査対象にする。本番HistoricalRasterPackへ昇格するには、さらに原本SHA、地図本体の画像単位、十分に分散した基準点、独立誤差評価、bounds、lossless tile、容量、control points、georeference metadata、tile manifest、DATA_SOURCESの具体的なapproved source、attributionを揃える。

どれかが不足すれば候補台帳には残すが、runtime registry、地域パック、`public/`、Pagesへ入れない。権利が明確でも、位置誤差を0mや推測値として扱わない。

## 複数シート

複数候補は1シートずつ選択する。全シートを同時合成せず、自動fitBoundsもしない。現在表示範囲と交差しない場合は文字で案内し、「この古地図の対象範囲を表示」を利用者が押した場合だけ移動する。シートごとのpriorityは初期選択候補を決めるための固定順であり、継ぎ目を透明合成で隠すために使わない。

## 現在の公開状態

2026-07-18の技術検査では、CC BY 4.0の台東区版「御大名小路辰之口辺図」1件だけをGit除外の`data-raw/`へ取得した。位置合わせ基準点と誤差評価を確定できなかったため、本番ラスタは0件、公開画像・タイル・静的説明ページは0件である。地図版は外部アーカイブへ画像通信せず、CSP、Cookieなし、storageなしを維持する。
