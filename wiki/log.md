# 操作ログ

## [2026-09-09] ingest | フェーズ1計画の妥当性レビューとHANDOFF.md更新
「マスタデータ投入」「認証まわりの実装土台」の進め方をレビュー。マスタデータの実規模は
約170件（ジャンル9・テーマ約50・タグ約109）で懸念より小さいこと、`tags`のID採番が
`TAG-{連番}`独自ルールであること、Admin SDKでの投入が必須なこと、Custom Claims初期付与が
認証実装のスコープに抜けていたことが判明。ステージング/本番の構築タイミングは「設定は
都度同期・データ検証はフェーズ4まで後回し」の方針に整理。`HANDOFF.md`のフェーズ1ロードマップ
を更新（未コミット）。
[[2026-09-09-phase1-plan-review]] / [[マスタデータ投入方針]] / [[ステージング環境運用方針]] を作成。

## [2026-09-09] ingest | Firestoreセキュリティルール本設計・本番デプロイ
`HANDOFF.md`未解決事項#1（ブロッカー）に対応。`firestore.rules`/`firestore.indexes.json`を新規作成し
本番プロジェクトにデプロイ（コミット`4f4be9c`）。
[[2026-09-09-firestore-security-rules]] / [[firestoreセキュリティルール方針]] を作成。

## [2026-09-09] ingest | 技術スタックの最新化とバージョン固定
`HANDOFF.md`未解決事項#2に対応。Next.js 16.3.4/React 19.2.8/TypeScript 7.0.2/firebase 12.18.0へ更新し、
依存バージョンを完全固定。`middleware.ts`→`proxy.ts`移行も実施（コミット`98851e0`/`5561b06`/`488349d`）。
[[2026-09-09-tech-stack-upgrade]] / [[依存バージョン固定方針]] / [[proxy]] を作成。`overview.md`のスタック情報を更新。

## [2026-09-08] create | Wiki骨格を作成
Karpathyの「LLM Wiki」パターン
(https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
に基づき、tr-game-streamer-v2 用のWiki骨格を作成した。

- 3層構造: raw sources = `../document/`（既存の企画書・仕様書・レポート群）、
  wiki = このディレクトリ、schema = [[CLAUDE.md]]
- `sources/` `entities/` `concepts/` `analyses/` は空の状態からスタート。
  今後のセッションで `document/` 配下のドキュメントを段階的にIngestしていく。
- `overview.md` は package.json / document/ のフォルダ構成 / 直近のgitログから
  把握できる範囲の概観として作成（詳細はIngest進行に伴い更新）。
