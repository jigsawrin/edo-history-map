# 歴史地点説明文モデル

歴史地点の説明文はsource data、source identity relation、rename等のcurationから分離して管理する。現在は非runtime基盤であり、Card、Search、Static、Mapから参照しない。

## Catalog

- `data-curation/historical-description-source-rights.json`: private rights registry。`termsUrl`と補助的な`rightsBasisUrls`、利用条件の確認事実とscopeを保持する。
- `data-curation/historical-place-descriptions.json`: private authoring catalog。verified facts、review note、未承認・却下record、translation review metadataを保持する。
- `scripts/historical-place-description-public-projection.json`: approved recordから決定的に生成する公開可能fieldだけのprojection。runtimeには未接続。

地点は`datasetId`、`sourceIndex`、`entryId`、`sourceFeatureSha256`で固定する。relationや`preferred`から別地点へ継承しない。

## Rights gate

公開projectionに入るのは`approved`だけである。すべての利用sourceに利用条件URL・確認日、accessibility confirmed、確認済みscopeを要求する。`text-reuse` sourceに限ってcommercial use、composition modeに必要なreproduction/modification/summarization、attribution生成、reuse対象scopeの第三者権利処理を要求する。claim evidence、人手確認、reviewer/date、source identity/SHAも必須である。reuse権限の`unknown`は許可を意味しないが、事実確認にだけ使うsourceへ無関係な文章再利用権限は要求しない。

`fact-verification`は事実確認、`text-reuse`は文章の再利用権限であり、相互に代用しない。fact-verification sourceの文章表現を公開本文へ転載・翻案してはならない。approved `editorial-summary`の各segmentは、`humanVerified: true`かつ最低1件の参照済み`text-reuse` evidenceをpublication basisとして持つ必要がある。説明文内の別segmentにtext-reuse evidenceがあっても代用できない。各publication basis sourceはreproduction、modification、summarizationがすべて`allowed`である必要がある。fact-verification evidenceは同じsegmentへ補助的に併用できる。

schema v1のpublic projectionは`editorial-summary`だけを許可する。`direct-quote`はexact source location、quotation extent、明示的な法的・許諾根拠を保持するquote-specific schemaが未整備のため、rights状態にかかわらず公開を拒否する。

## Public/private boundary

public projectionには承認本文、locale、composition mode、source identity、epistemic label、必要な出典・attributionだけを含める。verified facts、rights判断詳細、review note、AI利用・人手確認metadataは含めない。

## Translation

承認済み日本語本文をcanonical sourceとし、`translationOfContentSha256`で英訳を固定する。日本語本文のSHAが変わった英訳はstaleであり公開しない。runtime翻訳APIは使用しない。
