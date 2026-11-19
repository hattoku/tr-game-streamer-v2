---
title: 提案・審査フローと仕様書を整理する（審査 API の種別ごとの分割・管理画面の読み込み・仕様書の構想/取り下げ分け）
type: source
date: 2026-11-17
updated: 2026-11-17
---

# 提案・審査フローと仕様書を整理する

PR #62（2026-11-17）。Notion チケット「リファクタリング③：提案・審査フローと仕様書を整理する」。
進め方は /mnt/project-files/plans/リファクタリング/リファクタリングの進め方-検討.md（§5・§6 の項目5〜7）。
[[2026-11-17-collection-flow-refactoring]]（PR #61、リファクタリング②）の上に積んで作り、#61 のマージ後に base を main に変えて入れた。

## 決まっていること（ユーザー決定 2026-11-17）

- 仕様書の整理は2つのフロー（収集・提案）の分だけ。他の仕様書は触らない
- 整理が終わるまで、提案フローの新しい機能追加は止める
- 一般ユーザー側の画面は整理しない

## 1. 審査 API を種別ごとに分けた

- `PATCH /api/admin/workflows/[workflowId]` は「管理者か・記録があるか・運営メモ・審査中か」だけを見て、承認・却下は `lib/workflow-decisions.ts` から種別ごとのファイルへ振り分ける
  - `lib/review-report-server.ts`（レビューコメント通報）、`lib/playlist-proposal-server.ts`（再生リスト登録提案）、`lib/game-proposal-server.ts`（ゲームタイトル登録提案）、
    `lib/channel-application-server.ts`（チャンネル申請）、`lib/change-proposal-server.ts`（変更の提案、[[2026-11-17-detail-page-change-proposals]]）
- 共通: `lib/workflow-shared.ts`（状態・承認処理中の印・運営メモ・履歴・通知・未処理件数。DB を使わない。単体テスト `tests/unit/workflow.test.ts`）、
  `lib/workflow-server.ts`（印の取得と外し、状態の確定＋通知のトランザクション）
- 旧形式のゲームタイトル提案（`playlistUrl` 付き）の分岐は残した（Claude の判断。本番の残り件数を見られないため）。仕様書 §4.3 に「本番に審査中の旧形式が無いと確かめたら外してよい」と記載

## 2. 管理画面の読み込みを揃えた

- `Authorization: Bearer` 付きの fetch を `lib/admin-api.ts`（`adminFetch`・`callAdminApi`・`requestAdminApi`・`postAdminApi`）の1か所に
- 管理画面（`app/admin/**`・`components/admin/**`）は Firestore を直接読まず、`lib/workflow-admin.ts`・`admin-reads.ts`・`admin-dashboard.ts`・`inquiry-admin.ts`・`collection-admin.ts` を通す。
  **`eslint.config.mjs` で直接の import を禁止**
- 一般ユーザー側の Bearer 付き fetch（21ファイル）は対象外

## 3. 仕様書の整理

- `管理 審査ワークフロー仕様書` を v14.0（今の実装だけ）に書き直し: §1 概要／§2 権限／§3 状態と共通の操作／§4 種別ごと／§5 画面／§6 実装の構成／§7 作っていないもの。旧版の節との対応は冒頭
- 新フォルダ `document/specification/構想/`（未実装: 二段階審査とAI運営者、Ai運営者 審査機能、新作タイトル検知・ゲーム起点の補助収集・品質スクリーニング）と
  `document/specification/取り下げ/`（まとめ機能、収集候補による収集）
- 収集の2本（v4.8・v3.7）と提案系4本に「読み方」の表。移した節は見出しとスタブだけ残し、節番号は変えていない
- 新規 `document/specification/収集・提案・審査フロー 全体像.md`
- コード・E2E・仕様書の旧番号参照（§14・§15・§16・§3.1 など）を付け替え。`.agent/rules/development_flow.md` と spec-conformance-reviewer に `構想/`・`取り下げ/` の扱いを追加

## 挙動が変わるところ（意図したもの）

1. ダッシュボードの「通報」件数に、詳細ページからの変更の提案（対象ごとに1件）を含める（一覧の行数・ナビのバッジと同じ数え方）
2. レビューコメント通報の承認・却下で状態をトランザクションで確定。同時に2回押すと2回目は 409 `already_processed`
3. 変更の提案の詳細で、掲載状態が未設定の再生リストを「掲載中」と表示

## 後で直したいこと

- `lib/playlist-title-rules.ts` の `EXCLUDE_WORDS`・`findExcludeWord`・`MIN_VIDEO_COUNT` は未使用

## 確認

- `tsc`・`lint`・`vitest`（129件）成功、spec-conformance-reviewer の指摘（旧節番号の取りこぼし・エラーコードの書き漏れ）を反映
- 2026-11-17 に #61・#63 と重ねて stg へ出し、E2E（チャンネル申請・変更提案・提案・ゲーム登録・収集画面ほか）235件成功・失敗0
