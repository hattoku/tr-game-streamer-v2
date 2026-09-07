# 操作ログ

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
