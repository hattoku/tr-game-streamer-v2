---
title: YouTube Data APIのハマりどころ
type: concept
date: 2026-11-14
updated: 2026-11-14
---

# YouTube Data APIのハマりどころ

`lib/youtube.ts` を触るときに知っておくこと。実際に踏んだものだけを書く。

## playlistItems.list

- **ページ送りが終わらないことがある**: 一部の再生リストで、全件を返したあとも0件のページと同じ `nextPageToken` を返し続ける。
  空ページ・同じトークン・100ページで打ち切る（`fetchPlaylistItems`・`fetchChannelPlaylists`）。→ [[2026-11-01-collection-rakuten-pick-and-game-unset]]
- **削除済み・非公開の動画も項目として返る**（タイトル「Deleted video」「Private video」）。YouTube の画面では隠れるので、取り込むと1本多く見える。
  `status` を取り、`privacyStatus` が `public`・`unlisted` だけ取り込み、position を振り直す。→ [[2026-11-14-unavailable-videos]]
- **`snippet.publishedAt` は再生リストに追加された日時**で、動画の投稿日ではない。投稿日は `contentDetails.videoPublishedAt`。
  part を増やしてもユニット数は同じ。今の part は `snippet,contentDetails,status`。→ [[2026-11-14-new-video-notification-and-videolist]]

## クォータ

- 1日1万ユニット、本番と stg でキーを共有している
- `playlists.list` は ID を50件まとめて1ユニット → 動画数の差分確認に使う（[[2026-11-01-new-videos-diff-refresh]]）
- `search.list` は100ユニット。チャンネルの名前検索は1件約101ユニットかかるので、UC ID が分かるなら ID で追加する（1ユニット）
- コンテンツ収集は1日6,000ユニットまで（`collection_quota_logs`）。カウンタは `AsyncLocalStorage` でリクエストごとに分けている（[[2026-10-26-phase7-step7-5-content-collection]]）

## 規約

取得したデータは30日以内に取り直すか消す → [[YouTubeデータの30日ルール]]
