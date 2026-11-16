---
title: 提案ページの統合（再生リスト／チャンネル）
type: source
date: 2026-11-16
updated: 2026-11-17
commit: ccc31b6
---

# 提案ページの統合（再生リスト／チャンネル）

PR #55（2026-11-16 作成、2026-11-17 マージ）。Notion チケット「再生リストの提案とチャンネル提案のページ統合」「チャンネルを申請する区分の選択の妥当性について」。仕様は ページ 提案する 仕様書 v1.0（新規）。関連: 再生リストを追加する v6.0、チャンネルを申請する v1.3、審査ワークフロー §15.3、データモデル（playlist_register・channel_application）。

## 変更

- `app/(main)/propose/page.tsx`（新規）: 「再生リスト｜チャンネル」のタブ（Radix Tabs）で切り替える1ページ。見出しは一般「提案する」／管理者「追加する」
  - 流入元のクエリ: `channelId`（チャンネル固定・タブなし）、`type=channel`、`gameId`、`channel`、`as=creator`、`url`
  - 両方のフォームを mount したまま `hidden` で隠すので、タブで切り替えても入力は残る。§7 のボタン（「このチャンネルを推薦する」「このチャンネルの再生リストを提案する」）で移るときだけ、移った先の `key` を変えて引き継いだ値で作り直す
- 旧URL `/playlists/new`・`/channels/apply` は `next.config.js` の `redirects()`（temporary）で `/propose`・`/propose?type=channel` へ。クエリは Next が引き継ぐが、**並び順は保たれない**（`?type=channel&channel=…` が `?channel=…&type=channel` になる）。E2E はパスとクエリを分けて確かめる
- `components/propose/`（新規）
  - `PlaylistProposePanel.tsx`: 掲載中のチャンネルを名前で探す → そのチャンネルの再生リスト一覧から選ぶ（URL 入力は一覧に無いときだけ）。自動判定で対象外のもの（`listingSetBy: auto` の non_game・too_short・excluded）は折りたたみに出し、選ぶと「公開してほしい理由」欄。運営が手で外したもの（`listingSetBy: admin` で listed 以外）と `channel_off` は一般ユーザーには出さない
  - `ChannelApplyPanel.tsx`: 旧 `/channels/apply` のフォームを移した。動画URL（watch・youtu.be・shorts・live）も受け付ける。掲載中なら「このチャンネルの再生リストを提案する」
  - `GameTitlePicker.tsx`: 旧ページから切り出し。ゲームは任意、巡回で推定した `playlists.gameId` を初期値に
  - `UrlCopyGuide.tsx`: 「URLのコピーのしかた」（スマホ／パソコン切り替え、折りたたみ）
- `lib/propose-server.ts`・`lib/propose-shared.ts`（新規）、API `GET /api/propose/channels`・`GET /api/propose/channels/[channelId]/playlists`（全件を返し、画面で30件ずつ）
- `POST /api/playlists/propose`: `playlistId`（既存の再生リスト）を受け付け、`noGame`・`existingListingStatus`・`existingListingReason`・`proposeReason` を保存
- `POST /api/playlists/register`（管理者）: `playlistId` でその場で公開（`publishExistingPlaylist`、運営が外したものも可）。未掲載チャンネルは `addChannel: true` で `activateListingChannel` → `restoreChannelPlaylists`（channel_off を戻す）→ 応答後に取り込み
- 審査（`app/api/admin/workflows/[workflowId]`）: 既存の掲載していない再生リストの提案は承認で掲載にする。`game_required` は新しいゲームタイトル付きのときだけ。承認に失敗したら先に書いた `proposedBy` を元に戻す
- `lib/youtube.ts`: `extractVideoId`・`fetchVideoChannelId`（videos.list 1ユニット）
- `lib/api-auth.ts`: `requireUserWithRole`
- E2E: `e2e/propose.spec.ts`（新規）、`channel-application.spec.ts`・`smoke.spec.ts` を /propose に合わせて更新

## ユーザー決定（スレッド・Notion、2026-11-16）

- 上部で「再生リスト｜チャンネル」を選ぶ1ページ。流入元で分かることは先に判定して迷わせない（チャンネル詳細からはタブなしで一覧から）
- ユーザーにとって分かりにくいのは「YouTube のどの画面の URL をコピーするか」。掲載中のチャンネルの再生リストは URL 不要で一覧から選ぶ。推薦だけ URL（動画 URL も可、コピーのしかたの案内）
- ゲームタイトルは推定を初期値にして任意
- 提案できるのは運営が手で外したもの以外
- 管理者は同じ画面でその場で公開・登録
- 申請の区分（本人・事務所／推薦）は**設問も記録もなくす**（B案）。承認時の `authorizedVia` は `channel_application`。以前の `creator_application`／`viewer_recommendation` は掲載チャンネル一覧で今までの名前のまま表示

## Claude が決めた解釈

- URL は `/propose` を新設（旧2つは転送）
- `as=creator` はボタンの文言を「申請する」にするだけ（区分は記録しない）
- 掲載中チャンネルの名前検索は一覧を1分キャッシュ。1件引く・提案や承認の確認では毎回取り直す（掲載を止めた直後に通さないため）。同じチャンネルに opted_out の記録があれば検索にも出さない。ハンドルは持っていないので名前だけ
- 審査中の自分の提案は「あなたが提案済み（確認待ち）」の文言だけ（行全体がボタンのためリンクは置かない）
- 「実況者・事務所の方へ」の案内カード（再生リストを追加する §10.6）は廃止

## ハマりどころ

- `react-hooks/set-state-in-effect`: 完了画面への切り替えは effect で親へ伝えず、`setDone`／`setCompletion` を呼ぶ所で `onDoneChange` も呼ぶ
- 管理者の URL 入力で、巡回で取り込み済み・チャンネル未掲載（channel_off）の再生リストは、既存扱いで先に公開処理へ進むと `addChannel` を見ずに失敗していた。チャンネルの確認を先に行うよう並べ替えた
- stg で E2E（変更箇所＋抜き打ち）。#52〜#55 をまとめて出し、失敗は0件（最初の5件はどれもテストの書き方。#55 は転送先クエリの並び順）

関連: [[2026-11-08-rebranding-stage6-applications]]
