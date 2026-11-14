---
title: リブランディング段階3 — 掲載状態 listingStatus と既存データの移行
type: source
date: 2026-11-01
updated: 2026-11-14
commit: cbe312f
---

# リブランディング段階3 — 掲載状態 listingStatus と既存データの移行

PR #18（`cbe312f`、2026-11-01）。仕様は コンテンツ収集機能 v4.1 §10.9、データモデル v2.1。

## 変更

- `playlists.listingStatus` を実装（`lib/listing.ts`）。管理者の登録・収集候補の承認・提案の承認は `listed`（`source`・`explorationChannelId` も書く）
- **検索面は「公開かつ掲載中」だけ**: 再生リストを探す・TOP・ゲーム詳細・チャンネル詳細の一覧、ゲーム／チャンネル一覧の件数と動画数。等価条件だけなので複合索引は不要
- チャンネルを探すは掲載中の再生リストがあるチャンネルだけ。チャンネル詳細は再生リストがすべて `channel_off` のときだけ 404（確認待ちで掲載中0件なら空状態で開く）
- `games.playlistCount` の増減は掲載中の再生リストのときだけ
- 移行スクリプト `scripts/migrate-listing-status.mjs`（`npm run migrate:listing:stg` / `:prod`）。既定は確認のみ、`--off=<UCチャンネルID,…>` で非表示、`--apply` で反映。冪等。件数（games/channels/tags）を掲載中だけで数え直す

## 本番で守る順番

**移行を適用してからアプリをデプロイする**。逆だと移行前の再生リストが検索面から消える。2026-11-11 の本番デプロイはこの順で行った（[[2026-11-11-production-deploy]]）。→ [[掲載状態と検索面]]

## 既知の抜け

- 移行スクリプトが掲載チャンネルを `channelIconUrl: null` で作っていた。2026-11-12 の PR #28 で巡回時に補うよう直した（[[2026-11-12-collection-review-images-icons]]）
- `registerPlaylist` が `listed` で作ることの E2E は無い（YouTube の実在の再生リストが要る）
