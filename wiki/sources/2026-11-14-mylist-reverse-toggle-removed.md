---
title: マイリストのカードから逆順ボタンを外す
type: source
date: 2026-11-14
updated: 2026-11-14
---

# マイリストのカードから逆順ボタンを外す

Notion「ユーザビリティ改善」の子タスク「マイリストの逆順ボタンについて」。仕様は ページ マイリスト機能仕様書 v1.13（§5.2・§5.5）。

## 変更

- `components/mylist/MylistCard.tsx`: 操作列の「逆順で再生／逆順再生中」ボタンと `onReverseToggle` を削除。操作列は「ステータス｜削除」になる
- `app/(main)/mylist/page.tsx`: `handleReverseToggle`（`mylist.isReverseOrder` の書き込みと読み直し）を削除
- 設定値 `mylist.isReverseOrder` と読み出し（`lib/mylist-entries.ts` の「最後に再生した動画」「最終話を視聴済みか」の判定、TOPカードの話数）はそのまま。切り替えは再生リストページの動画リストの「逆順」チェックボックス（`components/playlists/VideoList.tsx`）だけで行う
- 仕様書: マイリスト機能仕様書 v1.13、TOP 仕様書の実装注記を合わせた

## ユーザー決定

- 一覧にあると何の逆順か・いまオンかオフかが分かりにくいので、マイリスト画面には要らない。再生リスト側にあれば十分（Notion のタスク本文）

## メモ

- E2E にこのボタンを触るテストは無かったため、テストの削除はなし
