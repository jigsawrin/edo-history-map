# 江戸地名 source identity relation

## 目的と境界

`data-curation/edo-place-source-identity-relations.json` は、CODH『江戸マップ地名データセット』の
`owariya.csv` に記録された `preferred_id` / `preferred_entry_id` 関係を保存する、
non-runtime catalogです。プロジェクト独自のmanual curation候補とは別物であり、
`data-curation/edo-place-curation-candidates.json` のhide・rename・annotation判断にはなりません。

825 groupは削除候補ではありません。preferredは「唯一正しい表記」や、nonpreferredを削除・
非表示にしてよいことを意味しません。nonpreferredも個別の切絵図、名称、分類、出典URLを持つ
元レコードとして、公開GeoJSONの8,788 Featureに残します。group内にある205件の名称差、
12件のcategory差、2件の同一sheet member関係もそのまま保持します。

## 既知のsource anomaly

元CSVの自己参照 `20-358`（多宝院）と `20-369`（水久寺）は推測で修正せず、
`self-preference` / `preserved-not-grouped` として保存します。同一座標だが公式関係列が
空欄の `12-182`（妙典寺）と `24-133`（妙伝寺）は公式groupへ追加しません。

catalogはWeb runtime、地図、検索、情報カード、静的地点一覧へ接続しておらず、`public`や
`dist`にも含めません。将来の表示・検索・静的一覧への適用は、意味とUIを別PRで設計します。

## 取得、生成、監査

元CSVはCODH公式URLから利用者が明示的に取得します。スクリプト、CI、Web runtimeはnetwork
fetchを行いません。

- 公式URL: <https://codh.rois.ac.jp/edo-maps/dataset/owariya.csv>
- SHA-256: `b83960ac1e4f1061c84a23580ed41282be230ff2f3f4f0335308434ac6620161`
- bytes: `1554363`

生成済みcatalog自体もfile-level integrityで固定します。

- catalog bytes: `1239092`
- catalog SHA-256: `dcbf603181e36325139b3f951f436c16ec6a4747ae2b9c4742841dba4ab38558`

生成前にSHA、bytes、12列header、8,788 IDと公開GeoJSONの全snapshotを検査します。

```powershell
npm run data:build:edo-place-source-identity-relations -- C:\path\to\owariya.csv
npm run audit:edo-place-source-identity-relations
```

CIでは元CSVを取得せず、committed catalogとprotected GeoJSONだけを監査します。外部配布物の
可用性や内容変化にCIを依存させず、入力由来は固定SHAで再現します。CIはcatalogのbytes/SHAと
protected GeoJSON上のtarget snapshotの両方を検査します。catalog更新時は公式CSVの再取得、
入力SHA確認、決定的再生成、catalog SHA/bytes更新、人間レビューが必要です。summary件数だけでは
公式関係全体の完全性を証明できないため、file-level integrityを使用します。

## 出典とライセンス

関係情報はROIS-DS人文学オープンデータ共同利用センター（CODH）作成の
『江戸マップ地名データセット』（doi:10.20676/00000445）から抽出しています。
ライセンスはCC BY 4.0です。個別レコードを統合・削除せず、関係列を別catalogへ写像した
加工内容を明示します。

## schema migration

`schemaVersion: 1` はexact-key validatorで固定します。将来の変更は既存JSONを黙って
再解釈せず、schemaVersion更新、移行手順、決定的再生成、監査・互換性テストを同じPRで
追加します。source identityとmanual curationのschemaは統合しません。
