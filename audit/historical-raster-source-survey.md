# 江戸古地図ラスタ候補・公式一次ソース調査

レビュー日: 2026-07-18

対象: `edo` / `edo-late`

結論: **15候補・4所蔵機関を調査。権利面approved 13、pending 1、rejected 1。本番導入0。候補台帳schema v2で権利・技術・公開状態を分離した。**

`reviewStatus`は後方互換のため残し、`rightsReviewStatus`と同値だけを許可する。`technicalReviewStatus`と`publicationStatus`は独立であり、権利approvedを位置精度approvedや公開済みと解釈しない。対象候補はrights `approved`、technical `rejected`、publication `shortlisted`である。

## 判定基準

一般公開ブログで、将来の広告表示・寄付募集を含む利用を想定した。NC、商用可否不明、画像単位の再配布・加工条件不明、ログインまたは申請なしに画像を検査できないものはapprovedにしない。原著作物、所蔵資料、デジタル画像、位置合わせ成果物を別々に扱い、同題・異版・異所蔵を同一画像とみなさない。

approvedは次をすべて満たす候補だけである。

- 個別資料と画像取得経路を公式所蔵機関で確認できる。
- 商用利用、再配布、加工、切り抜き、位置合わせ、タイル化を妨げない条件である。
- ログイン・課金・外部画像ホットリンクを必要としない。
- CC BY 4.0の場合は所蔵館、資料名、ライセンス、加工内容を表示する。
- パブリックドメインの場合も、所蔵館の任意のお願いに従い資料名・所蔵館・部分利用・加工を表示する。

## 機関別の権利根拠

### 東京都立中央図書館

個別資料ページが「画像の使用条件 パブリックドメイン」と明示する資料だけを対象とした。TOKYOアーカイブの「画像の使用について」は、この表示のある画像をオープンデータとして自由に利用でき、利用制限なし、標準画像は無料ダウンロード可とする。資料名・所蔵館・部分利用・加工の表示は義務ではないお願いだが、本プロジェクトでは表示する。高精細画像は申込制のため取得しなかった。

### 台東区立中央図書館

各個別資料ページがCC BY 4.0を画像単位で明示する。CC BY 4.0は商用利用、共有、翻案を認めるため、表示条件を満たせば再配布・切り抜き・位置合わせ・タイル化と矛盾しない。第一候補は公式IIIF v3 manifestと地図本体canvasまで特定した。

### 国立公文書館

簿冊「江戸切絵図」（請求番号177-0646）はメタデータのCC0を確認できる。しかし31鋪の個別画像・ダウンロード・画像単位の条件は確認できない。メタデータCC0を画像へ拡張せずpendingとした。

### 国立国会図書館

書誌ID000007297269は紙資料の正確な書誌だが、ログインなし公開画像と画像単位の条件がない。前回監査どおりrejectedを維持し、他館の同題画像をNDL画像として代用しない。

## 候補一覧

| candidateId | 所蔵機関 | 資料・版 | 権利 | 技術 | status | 主理由 |
|---|---|---|---|---|---|---|
| `tokyo-archive-00042226-daimyo-koji-1863` | 東京都立中央図書館 | 大名小路・文久3年改 | PD/open data | high | approved | 初期表示中心、権利明確 |
| `tokyo-archive-00042700-daimyo-koji-1849` | 東京都立中央図書館 | 大名小路・嘉永2年 | PD/open data | high | approved | 別資料コード・別スキャン |
| `tokyo-archive-00042236-okuruwauchi-1865` | 東京都立中央図書館 | 御曲輪内大名小路・慶応元年 | PD/open data | high | approved | 初期表示中心、鶴亀版 |
| `taito-2017-chi-009-daimyo-koji` | 台東区立中央図書館 | 御大名小路辰之口辺図 | CC BY 4.0 | rejected | approved / shortlisted | 公式IIIF、権利合格・位置精度ゲート不合格 |
| `tokyo-archive-00042235-soto-sakurada-1850` | 東京都立中央図書館 | 外桜田・嘉永3年 | PD/open data | medium | approved | 桜田門・永田町 |
| `tokyo-archive-00042232-soto-sakurada-1864` | 東京都立中央図書館 | 外桜田・元治元年改 | PD/open data | medium | approved | 同題別版 |
| `tokyo-archive-00042220-bancho-1864-a` | 東京都立中央図書館 | 番町・資料コード4300035119 | PD/open data | medium | approved | 西側、広範囲 |
| `tokyo-archive-00042231-bancho-1864-b` | 東京都立中央図書館 | 番町・資料コード4300035226 | PD/open data | medium | approved | 同題別資料 |
| `tokyo-archive-00042227-nagatacho-1759` | 東京都立中央図書館 | 永田町・宝暦9年 | PD/open data | low | approved | 主対象年代より古い |
| `taito-2017-chi-001-ueno-shitaya-sotokanda` | 台東区立中央図書館 | 上野下谷外神田 | CC BY 4.0 | medium | approved | 北東側、方位差あり |
| `taito-2017-chi-002-toto-shitaya` | 台東区立中央図書館 | 東都下谷 | CC BY 4.0 | medium | approved | 同地域別版 |
| `taito-2017-chi-005-asakusa-torigoe` | 台東区立中央図書館 | 浅草鳥越 | CC BY 4.0 | medium | approved | 初期中心から東側 |
| `taito-2017-chi-006-toto-asakusa` | 台東区立中央図書館 | 東都浅草 | CC BY 4.0 | medium | approved | 同地域別版 |
| `naj-177-0646-edo-kiriezu-bundle` | 国立公文書館 | 江戸切絵図31鋪 | メタデータCC0のみ | low | pending | 画像単位なし |
| `ndl-000007297269-daimyo-koji-paper` | 国立国会図書館 | 大名小路・文久2年 | 画像条件なし | low | rejected | 公開画像なし |

正確なURL、取得可否、権利フラグ、範囲、期待技術評価、priorityは`data-curation/historical-raster-candidates.json`を正本とする。

## 初回導入判断

権利・範囲・取得経路から次の最大3件を初回技術評価対象とした。

1. `taito-2017-chi-009-daimyo-koji`
2. `tokyo-archive-00042226-daimyo-koji-1863`
3. `tokyo-archive-00042700-daimyo-koji-1849`

取得したのは1件目の地図本体だけである。東京都立図書館2件は標準画像が取得可能だが、高精細版が申込制で、同じフェーズで3枚を無理に位置合わせする必要はないため未取得とした。台東区版も十分な空間分布を持つ基準点と独立誤差評価を確定できていないので、公開タイル、control points、georeference、runtime source/raster登録を作らなかった。

## 公開・安全確認

- 本番ラスターレジストリ: 0件
- `APPROVED_HISTORICAL_RASTER_SOURCE_IDS`: 0件
- `public/data/historical-rasters/`: なし
- 外部画像originのCSP追加: なし
- 候補画像のPages公開: なし
- 原本・調査画像: Git除外された`data-raw/`だけ
- シームレス結合、画像補完、過剰変形: 未実施

権利approvedは「公開位置精度approved」を意味しない。基準点監査は`taito-daimyo-koji-control-points.md`、技術判定は`taito-daimyo-koji-georeference-review.md`を正本とする。次回も1シートずつ位置精度ゲートを通ったものだけをHistoricalRasterPackへ昇格する。
