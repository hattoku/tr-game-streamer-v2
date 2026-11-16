---
title: 提案履歴のチャンネル申請に「YouTubeで見る」ボタン
type: source
date: 2026-11-17
updated: 2026-11-17
---

# 提案履歴のチャンネル申請に「YouTubeで見る」ボタン

PR #52（2026-11-17）。Notion チケット「チャンネルの提案履歴の画面でYoutubeで開くリンクを追記する」。仕様は ページ チャンネルを申請する 仕様書 v1.3 §6。

## 変更

- `app/(main)/playlists/proposals/page.tsx`: チャンネル申請のカード（`ChannelApplicationCard`）のアイコン・名前の行の右に「YouTubeで見る」ボタン。`https://www.youtube.com/channel/{youtubeChannelId}` を新しいタブで開く。見た目はチャンネル詳細のボタン（[[2026-11-16-channel-youtube-link]]、PR #51）と同じ（secondary・小、YouTube ロゴ＋外部リンクアイコン）。狭い画面では名前の下に折り返す
- `youtubeChannelId` が空のときはボタンを出さない
- E2E: `e2e/channel-application.spec.ts` の申請の流れで、提案履歴のカードのリンク先・新しいタブ・文言を確認

## ユーザー決定

- 申請した本人が、正しいチャンネルを指定できたか確かめられるようにする（チケットの要望）

## 実装メモ（Claude の判断）

- `GET /api/playlists/proposals` はもともと `youtubeChannelId` を返していたので、サーバー側の変更はなし
- チケットがチャンネル申請についてだったので、再生リスト提案のカードには付けていない
- 提案ページの統合（別スレッド）でこのページの上部のボタンが変わる予定だが、今回の変更はカードの中だけ
