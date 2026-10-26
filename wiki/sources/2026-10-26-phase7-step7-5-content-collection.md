---
title: フェーズ7 ステップ7-5 — 有名チャンネル起点の再生リスト自動探索とタグ一覧
type: source
date: 2026-10-26
updated: 2026-10-26
---

# フェーズ7 ステップ7-5 — 有名チャンネル起点の再生リスト自動探索とタグ一覧

友人テスト前に「再生リスト・ゲームタイトルの登録数が足りない」「タグの種類が少ない」というユーザー判断を受けたステップ。
計画は `/mnt/project-files/plans/プレミテ全体計画と残りステップ.md` §7（7-5-1〜7-5-6、決定ログ Q1〜Q9）。
7-4（一般ユーザーの再生リスト提案）とは別で、運営側で数を揃える話だけを扱う。

## ユーザー決定事項

- 自動探索は**最小版**を友人テスト前に作る（Gemini 評価・新作検知は後回し）
- YouTube API のクォータ（1日1万、本番と stg でキー共有）を考え、探索の起点は**有名チャンネル**にする。
  `playlists.list?channelId` は50件で1ユニット、`search.list` は100ユニット
- 初期チャンネルは「ゲーム実況者 @ ウィキ」掲載の80件（ユーザーが貼付。`/mnt/project-files/plans/content-enrichment/探索対象チャンネル-初期一覧.md`）。
  名前検索で候補を出して管理画面で確定する
- 候補は**まとめて承認**。ゲームを推定できないものだけ個別に選ぶ。未登録ゲームは楽天を自動検索して作成モーダルに渡す
- タグはチャンネル単位の設定＋タイトルの語句から自動付与（どちらも運営者タグ・固定タグ）
- 実行は管理画面のボタン＋週1の定期実行（Cloud Scheduler → Cloud Run、`X-Cron-Secret`）
- タグ編集モーダルは入力前から運営者タグをカテゴリ別に並べる。ユーザーの新規タグは作れるが目立たせず、
  探す・TOP では**使用数3以上**のユーザータグだけ出す（タグの種類を無闇に増やさない）

## 仕様書（`7ee1251`）

- 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0: ジャンル起点の検索からチャンネル起点に全面改訂（§3 探索、§3.3 除外語、§3.4 ゲーム推定、§3.5 タイトル由来タグ、§6 クォータ）
- 管理 AI運営者向け収集候補レビューUI仕様書 v2.0: `/admin/collection`・`/admin/collection/channels`、一括承認（1リクエスト50件）
- Firestore データモデル設計書 v1.20: `collection_candidates` を再設計（ドキュメントID＝再生リストID）、`collection_batch_logs`・`collection_quota_logs`、§3.31 `exploration_channels` 新設
- ゲームタイトル詳細 v2.5 §8.5（運営者タグのカテゴリ一覧）、再生リストを探す v1.9・ゲームタイトルを探す v1.4・TOP v1.12（ユーザータグは使用数3以上）

## 実装（`7ae3c3f`・`8da8f02`）

- `lib/exploration-rules.ts`: 判定の純粋関数（動画3本未満・非公開・除外語、NFKC 正規化の最長一致によるゲーム推定、楽天検索語の抽出、タイトル→タグ）
- `lib/youtube.ts`: チャンネルの再生リスト取得・チャンネル詳細・名前検索・URL/ハンドル解析。クォータカウンタは `AsyncLocalStorage` でリクエストごとに分離
- `lib/collection-quota*.ts`: コンテンツ収集分の1日上限 6,000 ユニット（`collection_quota_logs/{JST日付}`）。名前検索は1件約101ユニット
- `lib/playlist-registration.ts`: 再生リスト登録処理を `/api/playlists/register` から切り出して承認APIと共用。動画は400件ずつ分割して書き込む（500書き込み上限対策）
- `lib/exploration-server.ts` / `POST /api/admin/collection/explore`: 探索本体。途中失敗でもクォータとログを記録、枠不足のスキップも `status: 'skipped'` でログに残す
- `POST /api/admin/collection/channels`（add / resolve_names / confirm / set_ref / exclude / restore / set_tags）、`POST /api/admin/collection/candidates`（approve / reject / restore）
- `firestore.rules`: `collection_candidates`・`exploration_channels` は管理者の読み取りのみ、書き込みは API Route だけ
- 画面: `/admin/collection`（チャンネル別グループ、チェックで一括承認、進捗表示）、`/admin/collection/channels`（追加・名前検索・候補から確定・タグ設定）
- タグ: `lib/tag-categories.ts`、`TagEditModal` のカテゴリ別チップ一覧、`isListedTag`（`USER_TAG_MIN_USAGE = 3`）を探す・TOP に適用
- `GameCreateModal` に `initialQuery`（開いたら楽天を自動検索）

## レビュー（dev-orchestrator）

対応したもの: 同時リクエストでクォータ集計が混ざる問題（AsyncLocalStorage 化）、500件超の動画で登録が失敗する問題、
探索の途中失敗でログが残らない問題、枠不足スキップのログ、`?tag=` で一覧外のユーザータグを選んだときに絞り込みチップが出ない問題、
ゲーム未選択時の案内文、タブを素早く切り替えたときの古い結果の上書き、タグ保存失敗時にモーダルが閉じる問題。

## 既知の注意点

- ゲーム推定は最長一致なので、シリーズ名だけを含むタイトルが別作品に当たることがある（承認前に確認する）
- 名前検索は1件約101ユニットのため、80件の特定には2日かかる（1回40件まで）
- 本番の週1定期実行は Cloud Scheduler のジョブ作成が別途必要（ユーザーが PowerShell で作成）
