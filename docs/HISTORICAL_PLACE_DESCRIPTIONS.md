# 歴史地点説明文モデル

歴史地点の説明文はsource data、source identity relation、rename等のcurationから分離して管理する。現在は非runtime基盤であり、Card、Search、Static、Mapから参照しない。

## Catalog

- `data-curation/historical-description-source-rights.json`: private rights registry。`termsUrl`と補助的な`rightsBasisUrls`、利用条件の確認事実とscopeを保持する。
- `data-curation/historical-place-descriptions.json`: private authoring catalog。verified facts、review note、未承認・却下record、translation review metadataを保持する。
- `scripts/historical-place-description-public-projection.json`: approved recordから決定的に生成する公開可能fieldだけのprojection。runtimeには未接続。

地点は`datasetId`、`sourceIndex`、`entryId`、`sourceFeatureSha256`で固定する。relationや`preferred`から別地点へ継承しない。

## Rights gate

公開projectionに入るのは`approved`だけである。利用条件URL・確認日、commercial use、composition modeに必要なreproduction/modification/summarization、attribution生成、第三者権利処理、claim evidence、人手確認、reviewer/date、source identity/SHAの全条件を満たす必要がある。`unknown`は許可を意味せず必ず拒否する。

`fact-verification`は事実確認、`text-reuse`は文章の再利用権限であり、相互に代用しない。`editorial-summary`はtext reuse sourceのreproduction、modification、summarizationがすべて`allowed`である必要がある。`direct-quote`は明示的なreproduction許可を要求する。

## Public/private boundary

public projectionには承認本文、locale、composition mode、source identity、epistemic label、必要な出典・attributionだけを含める。verified facts、rights判断詳細、review note、AI利用・人手確認metadataは含めない。

## Translation

承認済み日本語本文をcanonical sourceとし、`translationOfContentSha256`で英訳を固定する。日本語本文のSHAが変わった英訳はstaleであり公開しない。runtime翻訳APIは使用しない。
