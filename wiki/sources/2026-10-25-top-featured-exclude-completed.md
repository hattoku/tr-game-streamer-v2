---
title: TOP「注目の再生リスト」から完走済みを除く
type: source
date: 2026-10-25
updated: 2026-11-14
commit: f2ac2c0
---

# TOP「注目の再生リスト」から完走済みを除く

PR #5（`f2ac2c0`、2026-10-25 main へ）。仕様は ページ top 仕様書 v1.11 §6.4。

## 変更

- ログイン中の利用者が視聴ステータス「完走」にした再生リストを注目セクションに出さない。未ログインでは除外しない
- `lib/mylist-entries.ts` に `fetchCompletedPlaylistIds`（`mylist` だけを引く軽い取得。旧値 `reviewing` も完走扱い）
- `components/top/FeaturedSection.tsx` に `excludePlaylistIds`。ジャンルタブは除外後の対象で判定し、選択中のタブが消えたら「総合」に戻す

## 実装の注意

- 完走済みの ID が揃うまで注目セクションはスケルトン表示（完走済みが一瞬出て消えるのを防ぐ）。失敗・15秒タイムアウト時は除外なしで出し、遅れて届いたら反映
- 2026-11-08 のサーバー側検索化（[[2026-11-08-rebranding-stage7-server-search]]）以降は、サーバーが注目を40件返し、画面側で完走済みを除く形になった
