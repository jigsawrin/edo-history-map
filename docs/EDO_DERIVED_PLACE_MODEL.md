# 江戸地名 共通派生地点モデルとSearch consumer pilot

## 目的と境界

この基盤は、8,788件のsource record、CODH由来の825 source identity groups、プロジェクト独自のmanual curationを破壊的に統合せず、地図・検索・情報カード・静的ページが段階的に同じ解釈結果を利用するための設計・型・検証・監査を定義する。

完全なDerived Place Model自体は引き続きnon-runtimeである。`scripts/edo-derived-place-model.mjs`のruntime import、full derived catalogの`public/`・`dist/`出力、private curation catalogやidentity・evidence・reviewer情報のruntime/public配信を禁止し、既存の漏洩監査が拒否する。

Search/list、Static builder、Map、Cardを段階的なpilot consumerとして導入している。runtimeは完全モデルを読み込まず、Searchは`src/place-search/edo-search-projection.json`、Mapは`src/edo-map-projection.json`、Cardは`src/edo-card-projection.json`という監査済み最小projectionだけをstatic importする。Static builderはnon-runtime / non-deployedの`scripts/edo-static-place-projection.json`だけをbuild時に適用する。Map markerとCard入力はraw source objectを保持する。

## 三層の分離

1. source recordは`public/data/edo-places.geojson`の8,788 Featureである。source ID、source index、Feature SHA-256、原資料表記、category、sheet、座標、CODH URLを保持する。
2. source identity relationは`data-curation/edo-place-source-identity-relations.json`の825 groups / 1,693 membersである。これは出典に記録された関係であり、表示上の同一地点、代表名、削除を意味しない。
3. manual curationは`data-curation/edo-place-curation-candidates.json`のhide / rename / annotationとreviewである。source identityとは別schema・別判断のまま維持する。

read-only adapterは上記3ファイルを読み、それぞれ既存validatorで完全検証してから純粋関数`deriveEdoPlaces`へ渡す。外部通信や入力ファイルの書換えは行わない。

## schemaVersion 1

型はderived/source/group ID、member、表示代表、表示名と根拠、元表記、category/sheet差、位置と確度、curation decision、evidence、license/attribution、4 surfaceの適用可否、review state、reverse mappingを明示する。exact-key validatorは未知key・欠落keyを拒否し、全source recordが重複なくexactly onceでreverse mappingされることを検証する。

validatorはsource GeoJSON、source identity catalog、manual curation catalogをauthoritative inputとして必須で受け取る。既存の両catalog validatorを先に実行し、同じ入力から純粋関数で再導出した期待placeと、ID、配列順、表示、位置、判断、evidence、rights、review、applicabilityを含む全fieldが一致する場合だけ受理する。実在する別group IDやcandidate IDへ差し替えただけでも受理しない。

## 現在の決定規則

現在のdeterministic projectionは「source record 1件につきderived place 1件」であり、8,788件を生成する。825 identity groupsはevidenceとrelation IDとして参照するだけでmemberを統合しない。したがってCODHの`preferred`を正解表記・表示代表・削除指定として扱わない。

名称差205 groups、category差12 groups、same-sheet 2 groupsは自動確定しない。自己参照2件は既存relation catalogどおり通常group外に保つ。`12-182` 妙典寺と`24-133` 妙伝寺を独自group化しない。

curation catalogが`empty-foundation` / 0 candidatesでも同じ8,788件とcanonical SHAを生成できる。複数memberのderived placeを導入するには、別の明示的な人間review済みgrouping decisionとschema migrationが必要である。

Search applicabilityは、source 1件からderived 1件を生成し、reverse mappingがそのsourceへ正しく1件存在し、approved hideではなく、`needs-human-review`でもなく、display name basisが`source-record`または`approved-rename`である場合だけ`true`にする。identity relationを理由に複数sourceをmergeしない。

現在のbaselineは次のとおりである。

| 項目 | 件数 |
| --- | ---: |
| source records | 8,788 |
| derived places | 8,788 |
| reverse mappings | 8,788 |
| multi-member derived places | 0 |
| search applicable | 8,788 |
| map applicable | 8,788 |
| card applicable | 8,788 |
| static-page applicable | 8,788 |
| runtime applicable（いずれかのsurface） | 8,788 |

Derived canonical SHA-256は`514085bdab22f2a09363f256de4626d7c1124a85d051df64575ef2857e69d160`、source GeoJSON SHA-256は`7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4`である。

## Search runtime projection

`src/place-search/edo-search-projection.json`はsourceとの差分だけをruntimeへ渡す。schemaは`schemaVersion`、`sourceDataSha256`、`sourceFeatureCount`、`eligibleSourceCount`、`overrides`から成る。overrideは承認済み判断をsource record ID、source index、Feature SHA-256へ結び付け、必要なdisplay nameとhide stateだけを保持する。

現在はcuration 0件のため`overrides`も0件である。将来、approved renameまたはapproved hideが発生した場合だけ、完全モデルから決定的に生成・検証されたoverrideを追加する。unknown field、重複target、順序違反、source SHA/count/index/ID/Feature SHA不一致、未承認rename/hide、search applicabilityとの不一致を監査で拒否する。

projection適用後もraw source record、CODH source URL、source object identity、category、sheet、座標を保持し、source record自体を書き換えない。legacy search keyも維持するため、map→search同期と既存の検索順・query・paginationを変更しない。

## Static builder projection

`scripts/edo-static-place-projection.json`はStatic専用のnon-runtime / non-deployed projectionである。schemaは`schemaVersion`、`sourceDataSha256`、`sourceFeatureCount`、`eligibleSourceCount`、`legacyLayoutSha256`、`overrides`から成り、現在のoverridesは0件である。完全Derived catalog、identity group、evidence、reviewer、private curation情報は含めない。

Static applicabilityは、1 sourceから1 derived、正しい1件のreverse mapping、source ID/index/Feature SHA一致、非multi-member、非`needs-human-review`、`source-record`または`approved-rename`の表示名、承認済みのrename/hide、source rightsとtraceabilityを満たす場合にtrueとなる。approved hideもStaticではrecord削除ではなくgeneric tombstoneを安全に適用するためtrueである。

Static layoutはprojection適用前にsource由来legacy key、anchor、source name sort、page番号、page slotを確定する。`legacyLayoutSha256`は8,788件の`sourceIndex`、legacy key、anchor、page number、page slotをcanonical JSON化したSHA-256であり、現在値は`ba33be9595dfaa34a4494c45839c8ee1acbdaeac348645872bf58b6f013c6360`である。renameは記事の表示名だけへ適用し、範囲索引やSEO/layout metadataはsource baselineを維持する。hideは同じpage/slot/anchorに一般化したtombstoneを残し、元名称、分類、切絵図、個別CODH URL、hide理由、candidate/reviewer/evidenceを公開しない。

## Map runtime projection

`src/edo-map-projection.json`はMap専用のdelta-only projectionである。schema/source SHA/source count、map applicable count、visible marker countと、approved hideに必要なsource record ID/index/Feature SHAだけを保持する。現在は8,788件がmap applicable、visible markerも8,788件、overridesは0件である。approved renameはprojectionへ渡さず、tooltip/title等も追加しない。approved hideだけをmarker生成前に除外する。

Mapは8,788件のview modelを生成せず、raw `PlaceFeature[]`をsourceIndex side lookupへ通す。marker callbackも同じraw object referenceを返すため、Search同期とsource-backed Cardのidentityを維持する。完全Derived catalog、identity group、evidence、reviewer、private curationはbundleへ含めない。

## Card runtime projection

`src/edo-card-projection.json`はCard専用のdelta-only projectionである。schema/source SHA/source count、Card applicable count、renderable countと、approved rename/hideに必要なsource record ID/index/Feature SHA、display name、hide stateだけを保持する。現在は8,788件がCard applicableかつrenderableで、overridesは0件である。

Card applicabilityはStatic/Mapと同じく、1 sourceから1 derived、正しいreverse mappingとsource binding、非multi-member、非`needs-human-review`、承認済みrename/hide、source rightsとtraceabilityを満たす場合にtrueとなる。approved hideも、Card consumerがfail-closedで安全に適用できるためtrueである。

runtimeはoverridesだけから`sourceRecordId` keyed lookupを1回作り、raw `PlaceFeature.entryId`でO(1)解決する。全8,788件のview model化、source clone、browser SHA計算、追加fetchは行わない。rename時はDerived display nameを見出しに使い、raw source nameを「原資料表記」と明示する。category、sheet、CODH URL、attribution、CC BY 4.0はsource-backedのまま維持する。hide時はCard内容やfocusable elementを描画せず、後続のMap→Search同期も行わない。

## deterministic auditとsnapshot

`npm run audit:edo-derived-place-model`は3入力をread-onlyで検証し、full outputをmemory内だけで構築する。型付きの`EDO_DERIVED_PLACE_SNAPSHOT`定数は件数、reverse mapping coverage、surface別applicability、runtime適用8,788件、canonical JSON SHA-256を固定し、full derived catalogをcommitまたは公開しない。定数は既存の追跡禁止`audit/*`へ出力せずvalidatorと同じnon-runtime moduleに置く。

同じauditがchecked-in Search projectionを完全モデルから再生成した期待値と比較し、source GeoJSONへのbindingとSearch applicabilityの一致を検証する。runtimeへ渡るのはprojectionだけであり、完全モデル、private catalog、identity group、evidence、reviewer情報は含めない。

漏洩監査は`public/`と`dist/`の派生モデルらしいpathをsizeに関係なく拒否し、JSON・JavaScript・HTML等のtext fileをsize上限なしで検査する。`src/`ではTypeScript/JavaScript/JSON系を検査し、module名だけでなく`deriveEdoPlaces`参照も拒否する。通常画像や無関係なbinaryはUTF-8 textとして読み込まない。

snapshot更新は入力SHA・既存catalog検証・差分理由・人間reviewを伴う単独PRで行う。件数またはSHAだけを手修正してvalidatorを通してはならない。

## migration方針

schemaは暗黙に拡張しない。変更時は旧validatorを残したうえで、新schemaVersion、純粋なv1→v2 migration、canonical snapshot、positive/negative/互換testを同一PRに追加する。

Search/list、Static builder、Map、Cardを個別のpilot consumerとして導入した。selection identityはraw source object参照のまま維持し、stable-ID方式への置換は行っていない。今後のconsumerやselection方式の変更はそれぞれ別PR、別監査、明示承認を必要とする。relation groupの自動merge、CODH `preferred`の表示代表化、manual curation candidateの自動承認は禁止を維持する。

## 法的境界と出典保持

source recordとidentity relationはROIS-DS CODH「江戸マップ地名データセット」（doi:10.20676/00000445、CC BY 4.0）に由来する。派生表示でrenameやannotationを採用しても、元資料表記、全member、source URL、Feature SHA、attributionを失わない。manual curationはプロジェクト判断としてevidenceとreviewを別に保持し、CODHの判断と誤認させない。
