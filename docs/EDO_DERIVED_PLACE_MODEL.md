# 江戸地名 共通派生地点モデル（non-runtime foundation）

## 目的と境界

この基盤は、8,788件のsource record、CODH由来の825 source identity groups、プロジェクト独自のmanual curationを破壊的に統合せず、将来の地図・検索・情報カード・静的ページが同じ解釈結果を利用するための設計・型・検証・監査を定義する。

今回はruntimeへ接続しない。`src/`からのimport、browser fetch、`public/`・`dist/`へのcatalog出力、marker・検索・カード・静的ページの変更は行わない。全surfaceの`applicability`は`false`であり、監査がこれを固定する。

## 三層の分離

1. source recordは`public/data/edo-places.geojson`の8,788 Featureである。source ID、source index、Feature SHA-256、原資料表記、category、sheet、座標、CODH URLを保持する。
2. source identity relationは`data-curation/edo-place-source-identity-relations.json`の825 groups / 1,693 membersである。これは出典に記録された関係であり、表示上の同一地点、代表名、削除を意味しない。
3. manual curationは`data-curation/edo-place-curation-candidates.json`のhide / rename / annotationとreviewである。source identityとは別schema・別判断のまま維持する。

read-only adapterは上記3ファイルを読み、それぞれ既存validatorで完全検証してから純粋関数`deriveEdoPlaces`へ渡す。外部通信や入力ファイルの書換えは行わない。

## schemaVersion 1

型はderived/source/group ID、member、表示代表、表示名と根拠、元表記、category/sheet差、位置と確度、curation decision、evidence、license/attribution、4 surfaceの適用可否、review state、reverse mappingを明示する。exact-key validatorは未知key・欠落keyを拒否し、全source recordが重複なくexactly onceでreverse mappingされることを検証する。

## 現在の決定規則

現在のdeterministic projectionは「source record 1件につきderived place 1件」であり、8,788件を生成する。825 identity groupsはevidenceとrelation IDとして参照するだけでmemberを統合しない。したがってCODHの`preferred`を正解表記・表示代表・削除指定として扱わない。

名称差205 groups、category差12 groups、same-sheet 2 groupsは自動確定しない。自己参照2件は既存relation catalogどおり通常group外に保つ。`12-182` 妙典寺と`24-133` 妙伝寺を独自group化しない。

curation catalogが`empty-foundation` / 0 candidatesでも同じ8,788件とcanonical SHAを生成できる。複数memberのderived placeを導入するには、別の明示的な人間review済みgrouping decisionとschema migrationが必要である。

## deterministic auditとsnapshot

`npm run audit:edo-derived-place-model`は3入力をread-onlyで検証し、full outputをmemory内だけで構築する。`audit/edo-derived-place-model.snapshot.json`は件数、reverse mapping coverage、runtime適用0件、canonical JSON SHA-256だけを固定し、full derived catalogをcommitまたは公開しない。

snapshot更新は入力SHA・既存catalog検証・差分理由・人間reviewを伴う単独PRで行う。件数またはSHAだけを手修正してvalidatorを通してはならない。

## migration方針

schemaは暗黙に拡張しない。変更時は旧validatorを残したうえで、新schemaVersion、純粋なv1→v2 migration、canonical snapshot、positive/negative/互換testを同一PRに追加する。runtime consumerを追加するPRは本foundationのmigrationとは分離し、map/search/card/static-pageの同一結果とattribution表示を個別に承認・検証する。

## 法的境界と出典保持

source recordとidentity relationはROIS-DS CODH「江戸マップ地名データセット」（doi:10.20676/00000445、CC BY 4.0）に由来する。派生表示でrenameやannotationを採用しても、元資料表記、全member、source URL、Feature SHA、attributionを失わない。manual curationはプロジェクト判断としてevidenceとreviewを別に保持し、CODHの判断と誤認させない。
