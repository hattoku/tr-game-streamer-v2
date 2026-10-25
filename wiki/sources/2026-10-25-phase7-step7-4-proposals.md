---
title: フェーズ7 ステップ7-4 — 一般ユーザーの再生リスト提案フローと提案の審査
type: source
date: 2026-10-25
updated: 2026-10-25
---

# フェーズ7 ステップ7-4 — 一般ユーザーの再生リスト提案フローと提案の審査

フェーズ7（友人デモ前の最低ライン）の最後の機能ステップ。`/playlists/new` が管理者専用で、友人が再生リストを追加できなかったのを解消する。
根拠仕様書は「ページ 再生リストを追加する 仕様書」（§4.2.2・§5.4・§6.2・§7.2）、「管理 審査ワークフロー仕様書」（§3・§7〜§10・§14.3）、
Firestore データモデル設計書 §3.15。計画書は `/mnt/project-files/plans/7-4-再生リスト提案フロー-実装計画.md`。

## ユーザー決定事項（着手時）

- **提案＋単一ステップ審査**: 一般ユーザーは「提案する」、管理画面で通報と同じ単一ステップで承認/却下し、承認時に本登録する
  （「友人の間は直接登録可」案は仕様から外れ公開前に作り直しになるため不採用）
- **承認前にゲームタイトルを直せる**: 提案者の選び間違いを、却下→再登録の二度手間なしに直す（§10.1 の最小版）

## 実装内容

- `lib/playlist-registration.ts`: 管理者の登録処理を切り出し（`fetchValidPlaylist`・`registerPlaylist`・`hasPendingPlaylistProposal`・`newWorkflowRecord`）。
  `/api/playlists/register`・`/api/playlists/propose`・承認 API で共用。承認で登録した再生リストには `playlists.proposedBy` を残す
- `lib/proposal-shared.ts`: 種別定数・ラベル・文字数上限（クライアントと共有、firebase-admin を import しない）
- `POST /api/playlists/propose`（`requireUser`）: 制約チェックを登録と同じ順序で行い、登録済み・審査中の提案ありは `already_proposed`（§7.2 の同一文言）。
  却下済みの提案は数えない（再提案可）
- ~~`POST /api/games/propose`~~（同日廃止、下記「導線の見直し」）
- `POST /api/playlists/preview` をログインユーザー全員に開放し、`pendingProposal` を追加（一般ユーザーは送信不可、管理者は案内のみ）
- `PATCH /api/admin/workflows/[id]`: 提案2種別に対応。再生リストは承認時に本登録（失敗時は審査中のまま）、差し替えた `gameId` は `editHistory` と
  `proposalData.approvedGameId/Name` に記録。ゲームタイトルは先に `GameCreateModal` で登録し `createdGameId` を渡して承認
- `firestore.rules`: `workflows` のクライアント create を `type == 'review_report'`（通報）に限定。提案は API 経由のみ
- 画面: `/playlists/new` を一般ユーザーに開放（「提案する」・§6.2 完了画面・説明文欄は管理者のみ・`?url=` で自動プレビュー）、
  ~~`GameProposalModal`~~（同日廃止）、`GameCreateModal` に `defaultTitle`。
  管理画面は一覧を「通報」「提案」の2セクション（`WorkflowSection`）に、詳細は `components/admin/workflows/` に種別ごとに分けた
  （通報詳細は既存コードを `ReportWorkflowDetail` に移し、運営メモ・確認ダイアログを `shared.tsx` に共通化）。ダッシュボードに未処理の提案件数
- 導線: 再生リストを探すの見出し右に「再生リストを追加する」、フッターの同リンクをログインユーザー全員に

## 積み残し

- ゲームタイトル**編集**提案（入口のゲームタイトル詳細「情報を編集」が未実装）
- 提案者向けの「提案履歴」画面（作るなら運営メモを渡さないよう API 経由に）。`workflows` は rules 上本人が直接読めるため、一般公開前の rules 見直し（未解決事項16）と合わせて扱う
- 提案数の制限（1日何件まで等）は友人規模では不要として付けていない

## レビュー（spec・design、dev-orchestrator の手順で2本並列）

dev-orchestrator がこの環境のエージェント一覧に無かったため、spec-conformance-reviewer・design-consistency-reviewer の定義を読ませた汎用エージェントで実施。対応したもの:
- 承認の同時実行・部分失敗: `workflows.approvingAt` をトランザクションで取ってから登録（2分で失効）。登録済み＋`proposedBy` が提出者と一致なら承認済みにする
- ゲームタイトル提案の重複: 同じタイトルの審査中提案があれば `already_proposed`
- 完了表示の絵文字（📨）を管理者側と同じ `CheckIcon` に、提案モーダルの完了時は `Modal` の title を切り替え、「戻る」でゲームタイトル選択モーダルへ戻る
- 仕様書: `?url=` 流入、§14.1 表の表記、共通 機能別権限表 v1.3 の注記、データモデルに `approvingAt`
見送り: スマホのハンバーガーメニューへの「再生リストを追加する」（メニューはサポート・法的リンク専用の方針。探すページの見出しボタンで代替）、
管理一覧の取得失敗表示（旧実装からの挙動）、プレビュー API のレート制限（友人規模では不要）

## 導線の見直し（同日、ユーザーの stg テストから）

stg で一般ユーザーとして試したユーザーから「ゲームタイトルも再生リストも新規、が一番多いのに、ゲームが無いと再生リストを送れず導線が分からない」と指摘。
別ウィンドウのゲームタイトル提案（`GameProposalModal`・`/api/games/propose`）は、裏で再生リストURLも送っていたが画面からは伝わらず、元の「提案する」は押せないままだった。
ユーザー決定で **1つのフォームで同時に送る** 形に作り直した（仕様書 v3.15 §4.2.2・審査ワークフロー v10.1 §14.3）。
- `GameSelectModal` のフッター「新しいゲームタイトルとして入力する」（`onEnterNew`、検索欄の文字を渡す）→ フォームのゲーム欄がタイトル名・備考の入力に切り替わる
- `/api/playlists/propose` が `gameId` か `newGameTitle`（＋`newGameNote`）のどちらかを受ける。同名のゲームがあれば `game_exists`
- 管理画面は1件の提案として表示し、「ゲームタイトルを登録して承認」で `GameCreateModal`（タイトル入り）→登録後そのまま再生リストも登録して承認。承認 API は `gameId` 必須（無ければ `game_required`）
- 旧形式の `game_title_register` は新規作成しないが、作成済みの記録は引き続き表示・審査できる
- 併せて、スマホの「さがす」4ページに「＋」浮きボタン（`AddPlaylistFab`）を追加（ユーザー決定）
- レビュー対応: 「一覧から選び直す」はモーダルを閉じただけなら入力を残す。管理画面は承認処理中のボタンを無効にし、
  提案された名前のゲームタイトルが登録済みなら自動で選ぶ（登録後に再生リストだけ失敗して開き直した場合・同名の提案が複数ある場合の二重登録防止）
