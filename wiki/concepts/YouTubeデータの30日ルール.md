---
title: YouTubeデータの30日ルール
type: concept
date: 2026-11-14
updated: 2026-11-14
---

# YouTubeデータの30日ルール

YouTube API Services Developer Policies III.E.4: **認可なしで取った API データは30日以内に取り直すか消す**。2026-11-01 に確認（[[2026-11-01-rebranding-docs]]）。
III.E.4.b で、登録者数などの統計値も30日を超えて持てない。

## 実装（段階4、[[2026-11-08-rebranding-stage4-sweep]]）

- `lib/data-retention.ts`: `REFETCH_AFTER_DAYS = 25` で取り直し、`RETENTION_DAYS = 30` で削除。毎日の再取得に組み込み
- 基準日時は `metaFetchedAt` / `fullRefetchedAt`（無ければ `lastFetchedAt` → `registeredAt`）
- ユーザーの記録（`mylist`・`reviews`・`watch_history`・`watch_progress`）がある再生リストは消さない（`hasUserRecords`）
- 掲載停止を申し出たチャンネル（`opt_out`）は YouTube 由来の項目を消す
- 全件の取り直しでは、再生リストから消えた動画のドキュメントも消す（[[2026-11-14-unavailable-videos]]）

## 新しく YouTube のデータを保存するとき

保存するフィールドが取り直しの対象になっているかを確かめる。差分取得（[[2026-11-01-new-videos-diff-refresh]]）だけでは古いまま残るものがある。
