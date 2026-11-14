---
title: リブランディング段階4 — 巡回で全件保存し掲載状態を自動判定、30日ルール
type: source
date: 2026-11-08
updated: 2026-11-14
commit: d785912
---

# リブランディング段階4 — 巡回で全件保存し掲載状態を自動判定、30日ルール

PR #23（`d785912`、2026-11-08）。仕様は コンテンツ収集機能 v4.3、YouTube定期取得 v1.9（§8）、収集候補レビューUI v3.3（§8・§9）、データモデル v2.5。

## 変更

- 掲載チャンネルの巡回（`lib/channel-sweep.ts`）で、再生リストを捨てずに全件保存し `listingStatus` を自動判定する
  - 判定（`lib/listing-rules.ts` の `judgeListing`）: 除外語 → `excluded`、非ゲーム語 → `non_game`、動画数が `minVideoCount`（既定10）未満 → `too_short`、
    それ以外はチャンネルの掲載方法が `auto` なら `listed`、`confirm` なら `unconfirmed`。言葉の表は `app_settings/listing_rules` で運営が変えられる
  - 掲載を止めたチャンネルの再生リストは `channel_off`
- チャンネルごとの掲載方法 `publishMode`（`confirm` / `auto`、**既定は confirm**）
- 収集候補の承認画面を「自動掲載の確認」画面に、「掲載チャンネル」画面で掲載方法・表示順・停止・除外
- 30日ルールを毎日の再取得に組み込み（`lib/data-retention.ts`）: 25日で取り直し（`REFETCH_AFTER_DAYS`）、30日で削除（`RETENTION_DAYS`）。
  ユーザーの記録（マイリスト・レビュー・視聴履歴・視聴位置）がある再生リストは消さない。`opt_out` は YouTube 由来の項目を消す → [[YouTubeデータの30日ルール]]
- 毎日の再取得（Cloud Scheduler `refresh-new-videos-daily` 6:00）が巡回も兼ねるため、本番では `--attempt-deadline 300s` に延ばした。週1の探索ジョブ（collection-explore-weekly）は不要になった

## 注意

- stg の初回巡回で、既存の掲載チャンネルの再生リストが大量に `unconfirmed` で入った（本番も同様）
- 巡回が一度走ったあとに段階4より前の版へロールバックすると、確認待ちなどの数千件が旧版の一覧に出る。**戻さない**
- 未対応のレビュー指摘: 巡回が既存ドキュメントの `isPublic` を更新しない、`notFoundPlaylists` の二重計上、判定し直しが直列で大量時に60秒を超えるおそれ、`hasUserRecords` が4コレクションしか見ない
- 操作ログの仕組みは未整備（仕様書に注記）

## 関連

- [[掲載状態と検索面]]・[[2026-11-01-rebranding-stage3-listing-status]]
