---
title: チャンネル一覧のピックアップ行にマイリスト数・話数・最新話の日付
type: source
date: 2026-11-15
updated: 2026-11-15
commit: d75f261
---

# チャンネル一覧のピックアップ行にマイリスト数・話数・最新話の日付

PR #46（2026-11-15）。Notion チケット「チャンネル名から探すの一覧のカード見直し」。仕様は ページ チャンネル 探す v2.3 §9.5、共通 一覧のサーバー側検索 v1.3。

## 変更

- `components/channels/ChannelListCard.tsx`: ピックアップ再生リストの各行を2段に。上＝タイトル、下＝★スコア・人アイコン＋マイリスト数（読み上げ「N マイリスト」）・「N話」・「最新話 2026/11/12」。下段は狭い画面で折り返す。サムネイルは 64px（640px 以上は 80px）
- 最新話の日付＝再生リストで一番新しい動画の投稿日（`playlists.latestVideoPublishedAt`）。表示は動画リストと同じ `formatPublishedDate`（常に年つき）。値が無ければ出さない
- `lib/catalog-shared.ts` の `ChannelPickupPlaylist` に `mylistCount`・`videoCount`・`latestVideoPublishedAt`。値は [[catalog-server]] の索引にもともとあるものを返すだけで、YouTube API・Firestore の読み取りは増えない
- 並び（スコア上位3件）は変えていない
- E2E: `e2e/channel-list-pickup.spec.ts`

## stg で見つかった不具合: 最新話の日付が文字列で保存されていた

- stg で「バイオリベレーションズ2」だけ最新話が出なかった（ユーザー指摘）
- 原因: `lib/playlist-registration.ts`（管理者の登録・収集候補の承認・提案の承認）が `latestVideoPublishedAt` を YouTube の ISO 文字列のまま保存していた。索引は Timestamp として読むため null になっていた。動画の取り直し（`lib/new-videos-refresh.ts`）が Date で上書きするので、登録後に動画が増えていない再生リストだけ文字列のまま残る（stg では 2,914 件中1件）
- 直し: 登録は `new Date(...)` で保存。保存済みの文字列も読めるよう `latestVideoMillis`（`lib/catalog-shared.ts`）を足し、索引と `components/playlists/PlaylistGrid.tsx` で使う。データの書き換えはしていない（本番に同じデータがあっても読める）
- 「再生リストを探す」の新着順も同じ値で並べるので、一緒に直った

## 進め方

- 同じカードの行の外側（見出し・「ほかN本 すべて見る」）は並行の PR（仕様書 §9.6）が担当し、範囲を分けた

## メモ

- `PlaylistItemSnippet.publishedAt` は文字列。Firestore に日時として保存するときは必ず Date にする
