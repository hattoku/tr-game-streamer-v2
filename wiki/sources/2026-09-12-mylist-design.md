---
title: フェーズ2.5 ステップ5 — マイリストページのデザイン適用
type: source
date: 2026-09-12
updated: 2026-09-12
commit: （未コミット）
---

# フェーズ2.5 ステップ5 — マイリストページのデザイン適用

[[2026-09-11-phase2.5-design-plan]] のステップ4（HANDOFF の番号では5）。フェーズ2でノースタイルだった
`app/(main)/mylist/page.tsx` を、ページ マイリスト機能仕様書 と [[2026-09-12-design-direction-crimson]] で
改訂したトークン仕様書 v2.0 の部品で組み直した。

## 実装

| ファイル | 内容 | 根拠 |
|---|---|---|
| `components/mylist/MylistCard.tsx` | 親エリア（サムネ＋話数・タイトル・配信者・ステータスチップ→変更ドロップダウン・逆順トグル・削除）／子エリア（最後に再生した動画: サムネ＋進捗バー 3px・タイトル・残り時間・「続きから再生」）／子が無く新着があれば「NEW 新着動画があります」行。PC は操作列をタイトル横、モバイルはサムネの下 | マイリスト仕様書 §5、トークン仕様書 §6.1・§6.5・§6.6・§4 |
| `app/(main)/mylist/page.tsx` | 見出し・フィルタタブ（件数ピル、「その他▼」はドロップダウンで一時中断／断念。選択中は「その他: 一時中断」表示）・ソート（`SelectMenu`）・カード一覧・空状態・スケルトン。未ログインは `/login` へ | 同 §2〜§4、§1.2 |
| `components/ui/Tabs.tsx` | モバイルでタブが1文字ずつ折り返す不具合を修正: ラベル `whitespace-nowrap`、`trailing`（ソート）はモバイルではタブ列の下に右寄せ、PC は同じ行 | トークン仕様書 §15.3 |
| `components/ui/ProgressBar.tsx` | `size="md"`（3px）を追加 | トークン仕様書 §6.4 |
| 暫定の追加フォーム | 削除（本来の設置場所＝再生リスト詳細に移設済み） | マイリスト仕様書 §1.3 |

## データの取り方（クライアント SDK、本人のデータのみ）

1. `mylist`・`watch_progress`・`watch_history`・未読 `notifications` を `userId == uid` で並列取得（複合索引不要）。
2. 再生リストごとに `watch_progress` の最新 `updatedAt` を「最後に再生した動画」とし、`videos/{playlistId}_{youtubeVideoId}` で
   タイトル・サムネ・尺を引く。進捗%は `watch_history.progressPercent`（無ければ `lastPlayedSeconds / durationSeconds`）。
3. **最終話視聴済み**（子エリア非表示、§5.4）: 最終話（逆順なら先頭）の `progressPercent >= 95`。最終話は
   `videos` を `playlistId == X && position == videoCount-1` の等価条件で引く。
4. **新着あり**: 未読の `notifications.type == 'series_new_episode'` にその `playlistId` があるか（新着通知バッチが
   `videoCount` 更新と同時に通知を作るため、これを「新着」の定義にした）。
5. ソート「最後に再生した動画（新しい順）」= `watch_progress.updatedAt` 降順、再生履歴が無いものは `mylist.updatedAt` で後ろ。
   フェーズ2の暫定（`mylist.updatedAt` で代替）を解消。

## ハマりどころ

- **`orderBy('position') + limitToLast(1)` は降順の複合索引を要求する**（`playlistId ASC, position DESC`）。
  既存の索引は昇順のみで `The query requires an index` になった。索引追加（本番デプロイ）を避け、
  `position == videoCount-1` の等価条件に変えた（`position` は 0 始まりで `videoCount` と同期）。
- 読み込み失敗を `catch` で握りつぶすと空状態に見えて原因が分からない。`console.error` を残し、撮影スクリプトが
  `PAGE ERROR:` として拾えるようにした。
- 撮影スクリプト `scripts/dev/screenshot.mjs` を手順 JSON（goto / wait / click / eval / shot）対応にし、
  テストモードでログイン→詳細ページで「マイリストに追加」→`/mylist` の一連を自動化して確認した
  （`{"click": "視聴中"}` はカード内のチップが先にマッチするので、タブの操作確認には向かない）。

## 動作確認

- `npx tsc --noEmit` / `npm run build` 成功。
- 実ブラウザ（テスト管理者、1440px / 390px）: タブと件数、ソートのドロップダウン、カード2件（親＋子エリア）、
  空状態、モバイルでの操作列の折り返しを確認。「その他」選択中の表示・削除・逆順トグルはコードのみ（データ都合）。
- テスト管理者のマイリストに ゼルダ（視聴中）・モンハン（見たい）を登録した状態が残っている（テスト用会員なので放置可）。

## 併せて修正: 一般ユーザーで再生リスト詳細が権限エラー

ユーザーの実機確認で、一般ユーザーのテスト用会員で再生リスト詳細を開くと `Missing or insufficient permissions` に
なる不具合が見つかった。原因は詳細ページの `getDoc(mylist/{uid}_{playlistId})`。未登録＝ドキュメントが無いと
ルール `isSelf(resource.data.userId)` が評価できず拒否される（管理者は素通り）。`userId`＋`playlistId` の
等価条件クエリに変更して解消。詳細と原則は [[firestoreセキュリティルール方針]] に追記。

## 据え置き
- 新着通知の ON/OFF トグル（§5.4）: ユーザー設定ページが無い。常に ON。
- TOP ページとの連携（§6）: フェーズ3。

## 関連
- [[2026-09-11-phase2.5-design-plan]]
- [[2026-09-12-design-direction-crimson]]
- [[デザイントークン運用方針]]
