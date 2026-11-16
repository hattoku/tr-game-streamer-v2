---
title: サムネイルに重ねる表記を再生時間だけにそろえる
type: source
date: 2026-11-16
updated: 2026-11-16
commit: 76c9c1f
---

# サムネイルに重ねる表記を再生時間だけにそろえる

PR #47（2026-11-16 マージ）。Notion チケット「サムネイル内話数表記の見直し」。仕様は 共通 デザイントークン仕様書 v2.13 §6.5、ページ top 仕様書 v2.5 §5.4、ページ マイリスト機能仕様書 v1.16 §5.2、ページ 視聴履歴 仕様書 v1.4 §4.2、ページ 再生リストを探す 仕様書 v2.3 §3.3、ページ 設定 プロフィール仕様書 v1.9。

## ルール

- サムネイルに重ねる文字は再生時間だけ
- 再生できる動画へ遷移するサムネイル（動画リスト・マイリストの「最後に再生」・視聴履歴）→ 右下に再生時間（`CountLabel`）
- 再生リストの表紙（`/playlists/[id]`）へ遷移するサムネイル → 何も重ねず、話数はカードの文字の並びに置く。下部の暗いグラデーション（`bg-thumb-overlay`）も外した

## 変更

- `components/ui/Badge.tsx`: 話数の文字 `EpisodeCount`（`data-testid="episode-count"`、`current` を渡すと「16 / 93話」）を追加。`CountLabel` は再生時間専用という位置づけに
- `components/playlists/PlaylistGrid.tsx`（`PlaylistCard`）: 話数をスコアの行へ。並びは ★スコア → 話数 → マイリスト数 → レビュー数
- `components/top/TopMylistCard.tsx`: 「話数 / 総話数」をステータスチップの右へ。進捗バーはサムネイル下端に残す
- `components/mylist/MylistCard.tsx`: 親エリアの話数を配信者名の右へ。子エリア（最後に再生）は従来どおり再生時間
- `components/profile/ProfilePlaylistCard.tsx`: `showVideoCount` の話数を meta（ステータス・★）の後ろへ
- `components/history/HistoryCard.tsx`: 再生時間を配信者の下の文字からサムネイル右下の `CountLabel`（`data-testid="history-duration"`）へ
- `app/(main)/collections/[collectionId]/page.tsx`（取り下げ中）: 話数を★の後ろへ
- E2E: `e2e/thumbnail-labels.spec.ts`（マイリスト・TOP・視聴履歴）

## ユーザー決定

- チケット本文: サムネイル内は再生時間のみ。再生可能な動画へ遷移するときは再生時間、再生リストの表紙へ遷移するときはサムネイルの周辺に話数。視聴履歴は時間をサムネイル内に、マイリストにも展開
- レビューで「星評価が先頭で、そのあと話数」（2026-11-15）。最初は話数を行の先頭に置いていた

## Claude が決めた解釈

- TOP のマイリストカードは「続きの話」のサムネイルを出すが、遷移先は再生リストの表紙（自動再生しない）なので「表紙へ遷移」側として扱い、再生時間は重ねない
- マイリストのカードは配信者名の右、TOPのマイリストカードはステータスの右に話数（どちらも行の先頭ではないので、星評価の並びの指摘の対象外）

## ハマりどころ

- 同じ日の PR が同じ仕様書の版を使っていたため、マージのたびに繰り下げた: TOP は #44（v2.3）・#43（v2.4）の後で v2.5、デザイントークンは #50（v2.12）の後で v2.13、マイリスト・視聴履歴は #49（v1.15・v1.3）の後で v1.16・v1.4（[[2026-11-16-mylist-history-switch]] [[2026-11-16-header-logo]]）
- ローカルで画面を見るときは `STAGING_GATE_PASSWORD` を外して `next dev` を起動しないと /stg-login へ飛ばされる
