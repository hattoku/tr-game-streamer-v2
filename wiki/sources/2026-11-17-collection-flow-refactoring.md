---
title: 収集フローを整理する（件数の更新を1か所に・巡回の入口と名前を揃える）
type: source
date: 2026-11-17
updated: 2026-11-17
commit: 77cb60e
---

# 収集フローを整理する（件数の更新を1か所に・巡回の入口と名前を揃える）

PR #61（2026-11-17）。Notion チケット「リファクタリング②：収集フローを整理する（件数の更新・入口・名前）」。
進め方は /mnt/project-files/plans/リファクタリング/リファクタリングの進め方-検討.md（§5 の3・4）。
仕様はコンテンツ収集機能仕様書 v4.7、Firestore データモデル設計書 v3.2。前段は [[2026-11-17-unit-tests-and-collections-code-removal]]（リファクタリング①）。

## 決まっていること（ユーザー決定 2026-11-17）

- 整理が終わるまで、収集フローの新しい機能追加は止める（一般ユーザー側の修正は並行してよい）
- コード上の「探索」を「掲載チャンネル」に揃える。DB の名前 `exploration_channels` は変えない（本番の移行が要るため）

## 件数の更新を1か所に

- `lib/listing-counts.ts`（増減の計算、純粋な関数）と `lib/listing-counts-server.ts`（書き込み）を追加
- 次の処理は自前で `increment` を書かず、ここを通す: 登録（`playlist-registration`）、掲載の切り替え（`listing-server` の4関数）、
  ゲームの付け外し・付け替え（`playlist-game-linking`）、タグの付け外し（`/api/tags/attach`・`detach`）、
  ゲームタイトルの登録・編集のジャンル・テーマ件数（`/api/admin/games`）
- 計算は「変わる前に数えていた分を引き、変わった後に数える分を足す」だけ。単体テスト `tests/unit/listing-counts.test.ts`（21件）
- マイリスト数・レビュー数（一般ユーザー側）は対象外

## 巡回の入口と名前

- 入口（毎日の再取得・「巡回を実行」・「このチャンネルだけ巡回」・登録済みにした直後・申請の承認・再生リスト登録でのチャンネル同時掲載）は
  どれも `lib/channel-sweep.ts` の `sweepChannels` → `listAutoPending` を通る
- 改名: `lib/exploration-server.ts`（`exploreChannels`）→ `lib/channel-sweep-run.ts`（`runChannelSweep`・`sweepChannelNow`・`sweepChannelAfterResponse`）、
  API `/api/admin/collection/explore` → `/sweep`、`lib/exploration-rules.ts` → `lib/playlist-title-rules.ts`、管理画面の型 `ExplorationChannel` → `ListingChannel`
- 巡回で `collection_candidates` を読む処理と、使われていない `lib/collection-game.ts` を削除。収集候補の30日の消し込みは残した（本番で残りが無くなれば外せる）
- DB の名前（`exploration_channels`・`explorationChannelId`・ログの `candidatesFound`）はそのまま

## 動作が変わるところ（意図したもの、Claude の判断）

- タグの付け外しで `usagePlaylistCount` が動くのは掲載中の再生リストだけ。以前は、掲載前にタグを付けてから掲載すると二重に数えていた
- 巡回で収集候補の却下（`candidate_rejected`）を引き継がない（掲載チャンネルの候補は段階4以降の毎日の巡回で取り込み済み）
- `listingStatus` の無い移行前ドキュメントも掲載中として数える（移行済みなので実際には現れない）
- 手動の巡回でクォータが尽きたとき、残りのチャンネルも実行ログの errors に `quota_exceeded` として載る

## 確認

- `tsc`・`lint`・`npm test`・`npm run build` 成功、dev-orchestrator のレビューでブロッカー無し
- 2026-11-17 に #62・#63 と重ねて stg へ出し、E2E（提案・申請・変更提案・ゲーム登録・楽天照合・収集画面・新着動画の再取得ほか）235件成功・失敗0
