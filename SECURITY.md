# セキュリティポリシー

## 脆弱性の報告

本プロジェクトの脆弱性を発見した場合は、公開 Issue ではなく、
GitHub の **Private Vulnerability Reporting**(リポジトリの
Security タブ → Report a vulnerability)からご報告ください。

報告の際は、再現手順・影響範囲をご記載ください。
報告に個人情報や実在の位置情報を含めないでください。

## 対象

- 本リポジトリのソースコード・ビルド成果物・GitHub Actions 設定

## 対象外

- 地理院タイル(国土地理院)のサービス自体
- CODH のサービス自体
- GitHub Pages 基盤

これらの脆弱性は各提供元へ報告してください。

## 設計上のセキュリティ対策(概要)

- 静的サイトのみ(サーバー・DB・アカウント・ユーザー入力の保存なし)
- TypeScript strict、`innerHTML`・`eval` 禁止(ESLint で強制)
- データ由来文字列は `textContent` でのみ DOM に挿入
- Content Security Policy(許可外オリジンへの通信を遮断、
  タイル配信元のみ許可)
- GeoJSON のスキーマ・サイズ・件数・座標範囲の検証
- 外部リンクは https + 許可ドメインのみ、`noopener noreferrer` 付与
- URL パラメータは許可リスト方式
- 位置情報は明示操作時のみ・メモリ内のみ
- 依存は最小限、`package-lock.json` 固定、`npm audit` / Dependabot / CodeQL
- 本番ビルドにソースマップを含めない

詳細は docs/THREAT_MODEL.md を参照してください。
