---
title: 再生リストに削除済み・非公開の動画が出る不具合
type: source
date: 2026-11-14
updated: 2026-11-14
commit: 4a4e9d2
---

# 再生リストに削除済み・非公開の動画が出る不具合

PR #29（`4a4e9d2`、2026-11-14）。仕様は YouTube定期取得 v1.10 §7.2、コンテンツ収集機能 v4.5 §10.11。

## 何が起きていたか

stg の再生リスト（ダビスタ2）で4番目に「Deleted video」が出て、YouTube（15本）より1本多い16本に見えていた。

- `playlistItems.list` は削除された動画（Deleted video）・非公開の動画（Private video）も項目として返す。YouTube の画面では隠れるので欠番に見えない。取り込みで除外していなかった → [[YouTube Data APIのハマりどころ]]
- 取り直しで「消えた動画のドキュメントは消さない」仕様だったため残り続け、話数（position）が別の動画と重なっていた

## 変更

- `lib/youtube.ts` `fetchPlaylistItems`: `status` も取り、`privacyStatus` が `public`・`unlisted` の動画だけ取り込む。position は残った動画で0から振り直す（話数が飛ばないように）。登録・掲載・取り直しのすべてに効く
- `lib/playlist-videos.ts` `fetchAndStoreAllVideos`: 全件の取り直しで、再生リストから消えた動画のドキュメントを消す。視聴記録は動画 ID で別に持つので残り、視聴履歴では「動画情報が見つかりません」（既存の表示）。30日ルールのためにも必要（[[YouTubeデータの30日ルール]]）
- 非公開の動画が新着通知に入らないことも E2E で確認（`e2e/unavailable-videos.spec.ts`）

## 並行ブランチとの衝突

PR #31（投稿日・NEW）も `fetchPlaylistItems` と `fetchAndStoreAllVideos` を変えていた。#31 が先に入ったので #29 側で
`part: 'snippet,contentDetails,status'`、`StoredVideos` に `newItems` と `removedCount` の両方を持つ形で解消した。

## 後始末

- stg に残っていた Private video は、`playlists.youtubeItemCount` を -1 にして管理画面の「新着動画を再取得」で消した
- 修正前に作られた Private video だけの通知2件は手で削除（取り直しでは消えない）
- 本番の既存の古い動画は、25日ごとの全件の取り直しで消える
