# 江戸地名 source identity relation 監査

## 採否

CODH元CSVの公式 `preferred_id` / `preferred_entry_id` を、公開GeoJSONとmanual curationから
分離したnon-runtime catalogとして採用する。元CSV、公開GeoJSON、個別レコードは変更しない。
preferredを表示上の正解、削除、非表示、表記訂正とは解釈しない。

## 固定入力

- owariya.csv（2025年7月23日版）
- SHA-256: `b83960ac1e4f1061c84a23580ed41282be230ff2f3f4f0335308434ac6620161`
- bytes: 1,554,363
- CSV行・一意ID: 8,788
- 公開GeoJSON SHA-256:
  `7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4`
- relation catalog bytes: 1,239,092
- relation catalog SHA-256:
  `dcbf603181e36325139b3f951f436c16ec6a4747ae2b9c4742841dba4ab38558`

## 監査結果

- 有効preferred group: 825
- member: 1,693（preferred 825、nonpreferred 868）
- size 2: 784 group
- size 3: 39 group
- size 4: 2 group
- 名称差: 205 group
- category差: 12 group
- 同一sheetに複数member: 2 group
- dangling、2要素以上のcycle、preferred chain: 0
- 公式groupと公開GeoJSON同一座標groupの完全一致: 825

自己参照は通常groupへ水増しせず、source anomalyとして保存する。

| entry ID | name | preferred_id | preferred_entry_id | disposition |
|---|---|---|---|---|
| 20-358 | 多宝院 | hqugGh | 20-358 | preserved-not-grouped |
| 20-369 | 水久寺 | ONCq65 | 20-369 | preserved-not-grouped |

公式関係外の同一座標group `12-182`（妙典寺）/ `24-133`（妙伝寺）は、関係列が空欄のため
catalogへ収録しない。名称やcategoryの差を誤記と推測せず、元snapshotを保持する。summary件数だけでは
source relation全体の完全性を証明できないため、committed catalog bytesのSHA-256とbyte lengthも
固定して監査する。

## 公開境界

catalogはGitHubリポジトリには収録するが、Web公開物、runtime import、URL state、browser
storageへ含めない。外部CSVをCIで取得せず、committed catalogをprotected GeoJSONに照合する。
将来のruntime適用は別PRとする。
