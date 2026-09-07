---
title: Wiki規約
type: meta
date: 2026-09-08
updated: 2026-09-08
---

# Wiki 規約

## ファイル形式
全ページMarkdown (.md)。先頭にYAML frontmatterを付与する:

```yaml
---
title: ページタイトル
type: source | entity | concept | analysis | meta
date: YYYY-MM-DD          # 作成日
updated: YYYY-MM-DD       # 最終更新日
commit: <hash>                # sourcesページで関連コミットがある場合
---
```

## リンク
- ページ間の相互参照は `[[ページ名（拡張子なし）]]` 形式で記述する
- 存在しないページへのリンクも許容する（将来作成すべきページの目印になる）
- 設計・企画レベルの背景は `c:\development\ai_knowledge\ak_tr_game_streamer_dev`
  （役割分担は [[CLAUDE.md]] 参照）を指す形で言及してよい（このWikiにはコピーしない）

## 命名
- ファイル名はページ内容を表す短い英数字スラッグ (kebab-case) を基本とするが、
  日本語の固有名詞（例: Firestoreセキュリティルール）はそのまま日本語ファイル名でもよい
- `sources/` のファイル名は日付+トピックのスラッグ（例: `2026-09-08-firestore-rules.md`）

## log.md のフォーマット
`## [YYYY-MM-DD] <operation> | <detail>` の1行ヘッダに続けて、
必要なら数行の補足を書く。`operation` は `ingest` / `query` / `lint` / `create` のいずれか。
