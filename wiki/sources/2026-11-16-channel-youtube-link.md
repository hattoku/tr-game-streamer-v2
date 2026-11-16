---
title: チャンネル詳細に「YouTubeで見る」ボタン
type: source
date: 2026-11-16
updated: 2026-11-16
---

# チャンネル詳細に「YouTubeで見る」ボタン

PR #51（2026-11-16）。Notion チケット「チャンネル詳細からYouTubeのチャンネル導線追加」。仕様は ページ チャンネル 詳細 仕様書 v1.11 §3.3。

## 変更

- `app/(main)/channels/[channelId]/page.tsx`: チャンネル情報セクションの「再生リストを追加する」の右に「YouTubeで見る」ボタン（secondary・小、左に YouTube ロゴ、右に外部リンクアイコン）。`https://www.youtube.com/channel/{channelId}` を新しいタブで開く（`target="_blank"`・`rel="noopener noreferrer"`）。幅が足りないスマホでは下に折り返す
- ログイン状態・ユーザー種別を問わず常に表示。読み上げ名は「（チャンネル名）のチャンネルをYouTubeで見る（新しいタブで開きます）」
- E2E: `e2e/popular-channels.spec.ts` に「チャンネル詳細 §3.3」を1件（リンク先・新しいタブ・読み上げ名）

## ユーザー決定

- YouTube のチャンネルでプロフィールを確かめたい人のために、チャンネル詳細から YouTube のチャンネルへ行ける導線を足す（チケットの要望）

## 実装メモ（Claude の判断）

- このページの `channelId`（`channels/{id}`）は YouTube のチャンネルIDそのものなので、追加のデータ取得なしでリンクを組み立てる
- 外部リンクは Next の `Link` ではなく `<a>` に `buttonClassName('secondary', 'sm')` を当てた（`LinkButton` は内部遷移用）
- サムネイルやチャンネル名をリンクにする案は取らなかった（仕様でサムネイルのクリック動作は「なし」、押せることが分かりにくいため）
- 仕様書のレイアウト図（罫線の図）は描き直さず、冒頭の注記で「再生リストを追加するの位置にこのボタンも並ぶ」と読み替える形にした
