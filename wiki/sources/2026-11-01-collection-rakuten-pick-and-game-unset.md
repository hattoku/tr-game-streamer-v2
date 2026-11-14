---
title: コンテンツ収集 — 承認が止まる不具合、楽天の商品の事前選択、ゲーム未設定の登録（段階A・B）
type: source
date: 2026-11-01
updated: 2026-11-14
commit: 53a6b1e
---

# コンテンツ収集 — 承認が止まる不具合、楽天の商品の事前選択、ゲーム未設定の登録（段階A・B）

PR #14（`53a6b1e`、2026-11-01 main へ）。stg で試運転しながら 2026-10-29〜31 に積んだ変更をまとめて入れた。
仕様は 収集候補レビューUI v2.2〜v3.1、コンテンツ収集 v4.1、再生リストを探す v2.1、データモデル v1.26〜v2.1。計画は `/mnt/project-files/plans/ゲーム未設定-実装計画.md`。

## 1. 承認が「登録中… 0 / 1件」から進まない（`5471ee2`）

YouTube の `playlistItems` が一部の再生リスト（例: 鬼武者 `PLSdDVLmrOTB0`）で、全件を返したあとも0件のページと同じ `nextPageToken` を返し続ける。
ページ送りが終わらず、クォータも使い続けていた。`lib/youtube.ts` の `fetchPlaylistItems`・`fetchChannelPlaylists` を、空ページ・同じトークン・100ページで打ち切るようにした。→ [[YouTube Data APIのハマりどころ]]

## 2. 新規ゲームの楽天ブックスの商品を承認前に選ぶ（§3.7）

- 探索の後にサーバーで楽天を先に検索し、結果を `collection_candidates.rakutenSearch` に保存（cron 240秒・ボタン45秒まで）。0件なら末尾の略称・区切りの後ろを外して探し直す。シリーズ番号の数字は外さない、末尾の長音を落とさない
- 名前が一致する商品は選んだ状態で出し、`RakutenPickModal` で選び直し・検索語の変更・楽天なしを選べる
- 承認 API の `rakutenJan`（JAN / null=楽天なし / 省略=従来の完全一致）。選んだ商品は JAN で取り直して画像・URL・機種・ジャンルを入れる
- 楽天の候補から「おもちゃ」(006510)・「その他」(006505) のジャンルを除く（ジャンルが複数ある商品にも効かせる）
- 英語名で見つからないときは「カタカナで探し直して」と案内。英語名→カタカナの自動変換は AI（費用）・Google（規約）・Wikidata（低ヒット）とも見送り

## 3. ゲーム未設定の再生リスト（段階A・B）

背景: 英語名など楽天に無いゲームの再生リストが候補に溜まる（stg で97件）。ユーザー決定は「**紐づけだけ審査なし**、再生リスト提案と新規ゲームタイトルは今どおり審査」。

- 段階A: 収集画面から「ゲーム未設定で登録」。`playlists.gameId` は null 可。検索の `gameHint`
- 段階B: `lib/playlist-game-linking.ts` の自動紐づけ、管理「ゲーム未設定」タブ（`/admin/collection/unset`）、`POST /api/admin/playlist-game`（link / unlink / relink）、履歴 `playlist_game_changes`
- 自動照合の誤爆対策: ヒントなしの照合では別名を使わない、続編には付けない

## 4. 収集画面の見直し

色分け・チャンネル枠・2画面を大きなタブで切り替え・カード2列・状況と探索のカード分離・絞り込みの件数と楽天の状態。
動画一覧は YouTube の再生リストのページを別タブで開く形（API を使う自前一覧・埋め込みはユーザー判断で不採用）。除外語に当たった再生リストは「却下済み（自動）」の候補として残す。

## メモ

- このクラウド環境では `dev-orchestrator` を呼べなかったため、`.claude/agents/` の spec-conformance-reviewer・design-consistency-reviewer の指示を general-purpose エージェントに読ませて代用した
- 楽天市場 API（IchibaItem/Search）は 2026-10-31 時点で「API Configuration not found」のまま使えない

## 関連

- 続き（段階C・提案）: [[2026-11-04-game-unset-user-link-and-proposal]]
- [[楽天画像URLのサイズ指定]]
