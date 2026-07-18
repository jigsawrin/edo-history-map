# 御大名小路辰之口辺図・基準点候補監査

監査日: 2026-07-18
candidateId: `taito-2017-chi-009-daimyo-koji`
結論: **transform 0点、独立validation 0点。必須8+4点を満たさないため本番control points metadataは作成しない。**

## 判定方法

古地図上で名称を読めることだけでは採用しない。公式一次資料による歴史的位置、現存状態、移設・再建の有無と、現代側の精密な座標根拠、canvas 2上の同一点をすべて確定できることを要求した。宮内庁・環境省・文化庁・千代田区の資料は名称・現況・概略位置の確認に有用だが、今回の監査では12点分の精密座標と画像pixelを監査可能な形で確定できなかった。Google Maps、Wikipedia、個人ブログ、観光まとめ、AI推定座標は使っていない。

## 候補一覧

`pixel`と緯度経度の「未確定」は値の欠落を0で代用しないという意味である。候補総数15、hold 10、rejected 5。transform/validationへ昇格した点はない。

| 点ID | role | 古地図上名称 / 現代名称 | feature | pixel | 緯度経度 | 現存・移設 | confidence | 根拠・source | 採否・注意 / validation residual |
|---|---|---|---|---|---|---|---|---|---|
| `cp-candidate-001` | hold | 桜田御門 / 外桜田門 | castle-gate | 未確定 | 未確定 | extant / 修理歴あり、同一点定義未確定 | medium | 環境省 [桜田門](https://www.env.go.jp/garden/kokyogaien/1_intro/his_02.html) | 桝形の現存は確認。画像上の測点（門中心・石垣角等）と公的精密座標を固定できず保留 / 算出不可 |
| `cp-candidate-002` | hold | 大手御門 / 大手門 | castle-gate | 未確定 | 未確定 | 再建を含む / unknown | medium | 宮内庁 [東御苑案内](https://www.kunaicho.go.jp/visit/higashigyoen/index.html) | 現代入口は確認できるが江戸期構造との同一点性が不足 / 算出不可 |
| `cp-candidate-003` | hold | 平川御門 / 平川門 | castle-gate | 未確定 | 未確定 | extant部分あり / unknown | medium | 宮内庁 [開園前の風景](https://www.kunaicho.go.jp/visit/higashigyoen/structures-gardens/gyoen-kaienmae-ph.html) | 高麗門の存在は確認。測点と座標を固定できず保留 / 算出不可 |
| `cp-candidate-004` | hold | 北桔橋御門 / 北桔橋門 | castle-gate | 未確定 | 未確定 | extant部分あり / unknown | medium | 宮内庁 [開園前の風景](https://www.kunaicho.go.jp/visit/higashigyoen/structures-gardens/gyoen-kaienmae-ph.html) | 名称と現況は確認。江戸期対応点と座標が不足 / 算出不可 |
| `cp-candidate-005` | hold | 桔梗御門 / 桔梗門 | castle-gate | 未確定 | 未確定 | extant部分あり / unknown | medium | 宮内庁 [皇居施設案内](https://sankan.kunaicho.go.jp/guide/koukyo.html) | 現代集合門は確認。測点定義が不足 / 算出不可 |
| `cp-candidate-006` | hold | 坂下御門 / 坂下門 | castle-gate | 未確定 | 未確定 | 改変可能性 / unknown | medium | 宮内庁 [皇居区域図](https://www.kunaicho.go.jp/kunaicho/shinsei/pdf/kokyo.pdf) | 配置は確認できるが同一構造・測点の根拠が不足 / 算出不可 |
| `cp-candidate-007` | hold | 田安御門 / 田安門 | castle-gate | 未確定 | 未確定 | extant / 修理歴あり | medium | 文化庁 [国指定文化財等データベース](https://online.bunka.go.jp/db/heritages/detail/193160) | 重要文化財として確認。対象canvas端部での同定と精密座標が未確定 / 算出不可 |
| `cp-candidate-008` | hold | 清水御門 / 清水門 | castle-gate | 未確定 | 未確定 | extant部分あり / 修理歴あり | medium | 文化庁 [国指定文化財等データベース](https://online.bunka.go.jp/db/heritages/detail/193160) | 重要文化財として確認。対象範囲・pixel・座標を固定できず保留 / 算出不可 |
| `cp-candidate-009` | hold | 雉子橋御門 / 雉子橋門跡 | stone-wall | 未確定 | 未確定 | archaeological-remains / not-moved不明 | medium | 千代田区 [史跡指定地の概要](https://www.city.chiyoda.lg.jp/documents/30576/soan-honpen-3-2.pdf) | 現雉子橋の上流約100mという範囲で、単一点座標ではない / 算出不可 |
| `cp-candidate-010` | hold | 一ツ橋御門 / 一ツ橋門跡 | stone-wall | 未確定 | 未確定 | archaeological-remains / not-moved不明 | medium | 千代田区 同上 | 「現一ツ橋あたり」で単一点が確定しない / 算出不可 |
| `cp-candidate-011` | rejected | 神田橋御門 / 神田橋門跡 | stone-wall | 未確定 | 未確定 | archaeological-remains / not-moved不明 | low | 千代田区 同上 | 石材残存の説明はあるが、門の基準点を一点に固定できない / 算出不可 |
| `cp-candidate-012` | rejected | 和田倉御門 / 和田倉門跡 | stone-wall | 未確定 | 未確定 | archaeological-remains / unknown | low | 環境省 [皇居外苑の現況](https://www.env.go.jp/garden/kokyogaien/topics/%E2%97%8F%E8%B3%87%E6%96%991-3_%E7%9A%87%E5%B1%85%E5%A4%96%E8%8B%91%E3%81%AE%E7%8F%BE%E6%B3%81.pdf) | 渡櫓跡石垣は残るが、原位置の測点と改変範囲が不明 / 算出不可 |
| `cp-candidate-013` | rejected | 呉服橋御門 / 呉服橋門跡 | other | 未確定 | 未確定 | officially-located-lost-site / unknown | low | 千代田区 史跡資料 | 現況で認識困難。現代交差点や町名中心を代用しない / 算出不可 |
| `cp-candidate-014` | rejected | 鍛冶橋御門 / 鍛冶橋門跡 | other | 未確定 | 未確定 | officially-located-lost-site / unknown | low | 千代田区 史跡資料 | 標柱等は江戸期門の確定測点ではない / 算出不可 |
| `cp-candidate-015` | rejected | 馬場先御門 / 馬場先門跡 | other | 未確定 | 未確定 | officially-located-lost-site / unknown | low | 千代田区 史跡資料 | 失われた門で同一点を確定できない。道路交差点を代用しない / 算出不可 |

## 分布と独立性

- transform: 0（最低8に不足）
- validation: 0（最低4に不足）
- hold: 10
- rejected: 5
- 左上・右上・左下・右下・中央、x/y各60%以上という分布判定: **未達**
- transformとvalidationの重複: なし（双方0）
- 公的根拠source群: 4機関・5公式ページ群。名称確認には使えたが精密座標根拠としては不足。

再試験には、同じ構造点を示す公的測量成果または発掘・保存整備図の座標、canvas 2上のpixel測点定義、移設・再建履歴の確認を追加し、transformとvalidationを最初から分離する必要がある。
