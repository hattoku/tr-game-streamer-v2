---
title: 詳細ページからの「情報の更新を提案する」
type: source
date: 2026-11-17
updated: 2026-11-17
---

# 詳細ページからの「情報の更新を提案する」

PR #56（2026-11-17）。Notion チケット「ゲーム/チャンネル/再生リストの各詳細ページに対し変更提案できるようにする」。仕様は ページ 詳細ページからの変更提案 仕様書 v1.1、管理 審査ワークフロー仕様書 v13.0 §16。

## 変更

- 入口: ゲーム・チャンネル・再生リストの各詳細ページで、基本情報カードの右上に文字のない「⋯」（読み上げ名「その他のメニュー」）。メニューの「情報の更新を提案する」でその場のモーダルが開く（`components/change-proposals/ChangeProposalButton.tsx`）。管理者と認証の読み込み中は出さない。未ログインならログイン案内（チャンネルは本人・事務所向けの「掲載についてお問い合わせ」も出す）
- 種別: ゲーム `game_title_edit`（違う項目＋補足必須）、チャンネル `channel_report`（もう実況していない／本人・公式でない／その他）、再生リスト `playlist_report`（ゲーム実況ではない／複数ゲーム混在／ゲームが違う＝正しいゲームを選ぶ／その他）。選択肢と承認時の処理は `lib/change-proposal-shared.ts`
- 送信: `POST /api/change-proposals`（ログイン必須、1日5件、同じ人の同じ対象への重複不可）。重複判定・上限・書き込みは1つのトランザクション（`lib/change-proposal-server.ts` の `submitChangeProposal`）。自分の確認待ちは `GET /api/change-proposals/mine?targetKey=`
- 審査: 管理の審査ワークフローの「通報」に、同じ対象（`targetKey` = `種別:ID`）への報告を1行にまとめて人数を出す。承認は理由ごとの処理（`non_game`・`excluded` は `unlistPlaylist`、`relink` は新しい `changePlaylistGame`、`channel_excluded` は `turnChannelOff`＋探索チャンネルを excluded）を運営が選び直せる。却下は定型の見送り理由。まとめた全員の workflow を同じ結果にし、全員に `review_result` 通知
- 提案履歴: `/playlists/proposals` に「変更の提案」カード（確認待ち／反映済み／見送り）
- `lib/playlist-game-linking.ts` に `changePlaylistGame`（件数の付け替え、元のゲームを `rejectedGameIds` へ、履歴を残す）

## ユーザー決定

- 運営が確認してから反映。入口は詳細ページのその場のモーダル
- ゲームは違う項目を選んでひと言。チャンネルは視聴者の報告だけで、本人・事務所はお問い合わせへ
- 再生リストの「ゲームが違う」は報告者に正しいゲームを選んでもらい、承認で付け替え
- ログイン必須・1日5件・同じ人の重複不可、ほかの人の分は受け付けて数える
- 承認は理由ごとに自動で処理し、運営が選び直せる。提案履歴＋報告した全員に結果のお知らせ
- stg で見たあと（2026-11-17）: 本当に間違いがあったときの逃げ道なので目立たせない → 文字のない「⋯」だけにし、タグの操作と取り違えないようカードの右上へ。文言は間違いがある前提に聞こえない「情報の更新を提案する」

## 実装メモ（Claude の判断）

- まとめて承認・却下する範囲は「押した時点までに届いた提案」（`submittedAt <= now`）。押した後に届いた報告は次の判断に回す
- 処理の二重実行を防ぐため、代表の workflow に `approvingAt` を先に立ててから処理する。チャンネルがすでに excluded・opted_out なら処理は成功扱い
- 管理画面の未処理件数（`usePendingWorkflowCount`）も `targetKey` ごとに1件と数える
- 再生リスト詳細の基本情報カードは PC 用とモバイル用に2つ描かれるので、E2E は `filter({ visible: true })` で見えている方の「⋯」を押す
- `exploration_channels` はクライアントから読めないので、チャンネルの「⋯」は常に出し、掲載中かどうかは送信時にサーバーで確かめる
- 「⋯」メニューは `DropdownMenu modal={false}`（メニューを閉じてすぐモーダルを開くため）
- E2E: `e2e/change-proposals.spec.ts`（8件。送信を伴うものは desktop だけ）。後始末は `e2e/support/cleanup.ts` で対象名が `[E2E]` で始まる提案と通知を消す
- PR #52〜#55 と並行したため、仕様書の版番号は main に合わせた（データモデル v3.0、再生リストを追加する v6.1、トレーサビリティ v1.21）
