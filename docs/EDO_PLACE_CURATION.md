# 江戸地名キュレーション候補管理

## 目的と境界

CODH『江戸マップ地名データセット』由来の原データを不変に保ちながら、非表示、表記修正、補足追記の候補と人間レビューを1件ずつ監査可能にするprivate catalogです。候補、レビュー、承認、派生表示への適用、公開は別工程です。本基盤には候補がなく、runtime・検索・静的地点ページ・公開GeoJSONへの効果はありません。

catalogは `data-curation/edo-place-curation-candidates.json` に置き、`public`、`dist`、runtime import、静的HTML、URL、外部fetch、ブラウザストレージへ出しません。非表示は原データ削除ではなく、将来の派生表示上の判断です。表記修正でも元資料名を保持し、補足には確認可能な根拠が必要です。

## catalog

トップレベルはexact keysで、`schemaVersion: 1`、dataset ID `codh-edo-maps-places`、source path `public/data/edo-places.geojson`、protected SHA-256 `7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4`、Feature数8788を固定します。候補0件は `empty-foundation`、1件以上は `active` です。

candidateのexact keysは `candidateId`、`sourceDatasetId`、`target`、`proposalType`、`proposal`、`reasonCode`、`reasonJa`、`evidence`、`review` です。`candidateId` と `sourceIndex + proposalType` は一意です。

targetはprotected SHA時点の0始まり `sourceIndex` に加え、`entryId`、名称、分類、切絵図、CODH URL、経緯度のsnapshotを完全一致させます。さらに次の固定順canonical objectを空白なしで `JSON.stringify` し、UTF-8 SHA-256を `sourceFeatureSha256` として照合します。

```text
Feature → Point coordinates [longitude, latitude]
        → properties { id, name, category, sheet, source }
```

元GeoJSONのSHA、Feature数、順序または値が変わった場合は自動追従せず監査を失敗させます。移行時は新しいsource SHAを確認し、全候補のindex、snapshot、fingerprintを人間が再照合します。

## 提案・根拠・レビュー

proposal typeは `hide`、`rename`、`annotation`。reason codeは `duplicate`、`non-place-label`、`low-information`、`transcription-error`、`orthography-normalization`、`ambiguous-label`、`context-needed`、`other` です。制御文字、HTML delimiter、前後空白を拒否します。

evidence basisは `source-record-comparison`、`official-source`、`scholarly-source`、`project-review`。URLは認証情報のないHTTPSに限定し、公式・学術資料であるかはvalidatorで自動判定せず人間が確認します。approvedはURLが最低1件必要です。approved renameは公式または学術資料、approved annotationはproject-review以外の根拠が必要です。

review statusは `proposed`、`in-review`、`approved`、`rejected`、`withdrawn`。reviewerは実名やメールではなく安全な短い識別子を使用します。同一地点のapproved renameとannotationは各最大1件で、approved hideと同時に有効化できません。rejected・withdrawnは競合対象外です。

## 将来の適用設計

将来のapproved applicatorは元GeoJSONを書き換えず、runtime load後に共通の派生地点列を作り、地図、情報カード、検索、分類、静的地点ページ、manifest監査へ同じ結果を供給します。rename表示では「プロジェクト表示名」と「原資料表記」を併記でき、annotationは根拠リンクを伴い、hideのprivate recordとレビュー履歴は保持します。経路別の独自適用は禁止です。本PRではapplicatorを実装しません。

## 更新手順

1 PRを1目的に限定し、protected sourceを再確認します。候補を追加し、根拠URLが何を証明するかを日本語で記録します。別担当を含む人間レビューを経てstatusを更新し、次を実行します。

```bash
npm run audit:edo-place-curation-candidates
npm test -- tests/edo-place-curation-candidates.test.ts
npm run audit:prepublish
```
