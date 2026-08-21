# Description Priority Foundation

Description Priorityは、江戸地名8,788 source recordのうち、人間が次に説明文調査または構造化調査を検討するrecordを選ぶためのprivate workflow triageである。scoreとtierは史実、同一性、rename、rights、承認、公開可否を判定しない。

## Boundary

- private catalog: `data-curation/description-priority-candidates.json`
- generator/validator/audit: `scripts/description-priority/`
- `src/`、`public/`、`dist/`、Search、Card、Map、static pagesから参照しない
- 外部通信、web調査、AIによる歴史的重要度判断、auto-approve、auto-publishを行わない
- source identityは`datasetId + sourceIndex + entryId + sourceFeatureSha256`のexact matchとする
- same name、same coordinates、relation group、`preferred`、aggregateからdescriptionや歴史的意味を継承しない

## Score v1

Scoreは候補整理の説明可能な機械的順序だけを作る。各加点・減点はcandidateの`contributions`へ保存し、`score`はその整数和とする。

| signal | points | workflow meaning |
|---|---:|---|
| base | +10 | 全source recordの共通開始値 |
| category | 名所 +30、寺社 +25、施設/海川池 +20、地名/商店 +15、町村字 +10、屋敷地/その他 +5 | v1 reviewで短い説明候補と構造化候補を混ぜるための明示的な作業配分。歴史的重要度ではない |
| noMultiMemberSourceRelation | +10 | relation catalogに複数memberのsource relationが記録されていない。歴史的entity identityや単一性は意味しない |
| relationPreferred | +5 | 複数member groupの調査起点候補。`preferred`を歴史的正しさや表示代表とは扱わない |
| relationSupporting | -20 | 複数member groupのsupporting record候補 |
| mapAggregate | -10 | exact name/category/coordinates aggregateのmemberで、個別説明前に重複確認が必要 |
| supplemental | -20 | exact supplemental name `（辻番）`、`（木戸）`、`（坂道）` |
| alreadyCurated | -10 | 既存approved display curationがあり、fresh workではない |
| alreadyDescribed | -100 | approved/public description済み。v1候補出力から除外 |

Tierは、supporting/supplemental/aggregate/already-describedならD、それ以外はscore 45以上=A、35以上=B、それ未満=Cとする。A/B/C/Dは調査workflow候補であり、品質・正しさ・権利・承認・公開statusではない。

## Deterministic diversity selection

v1 artifactは72件で、source category 9種から各8件を選ぶ。カテゴリ内はscore降順、同点は`sourceIndex`昇順で固定する。経度・緯度を0.01度セルへ機械的に区切り、まず未使用セルから1件ずつ選び、8件に満たない場合だけ既使用セルから補充する。

この仕組みは地理的重要度を表さない。東京の密集地域や大きなcategoryが最初の人間review sampleを独占することを避けるための再現可能なsampling ruleである。カテゴリ別8件も歴史的価値の比率ではなく、初回review用の意図的な均等配分である。

## Decision gate

最初の72件を人間が評価するまでweights、tier、候補件数をpublicationやruntimeへ接続しない。次フェーズでは、false positive、category配分、地理セル、manual reviewed importance signalの要否を別判断する。Historical Entity / Relation schemaはこの基盤に含めない。
