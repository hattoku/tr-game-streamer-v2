---
title: マイリストと視聴履歴の見出しを切り替えにする
type: source
date: 2026-11-16
updated: 2026-11-16
commit: 613a8f0
---

# マイリストと視聴履歴の見出しを切り替えにする

PR #49（2026-11-16）。Notion チケット「マイリスト画面から視聴履歴への導線追加」。仕様は ページ マイリスト機能仕様書 v1.15 §2.4、ページ 視聴履歴 仕様書 v1.3 §2.4、共通 uiコンポーネント フロント 仕様書 v2.6 §2.7、ページ マイページ 仕様書 v1.2。

## 変更

- `components/mylist/LibrarySwitch.tsx`（新規）: 見出しの位置に「マイリスト　視聴履歴」を `text-heading font-bold` で並べる。開いているページは h1（`aria-current="page"`、`text-text-primary`）、もう片方は `text-text-muted` の Link（ホバーで `text-text-secondary`）。`nav` の aria-label は「マイリストと視聴履歴の切り替え」
- `app/(main)/mylist/page.tsx`: 通常表示・空状態・読み込み失敗の `SectionHeading` を `LibrarySwitch current="mylist"` に置き換え
- `app/(main)/history/page.tsx`: `SectionHeading` を `LibrarySwitch current="history"` に置き換え
- `components/layout/nav.ts`: `BOTTOM_TABS` で `/history` を「マイページ」の prefixes から「マイリスト」へ移した。マイページの項目一覧（[[2026-11-14-mypage-hub]]）の「視聴履歴」と PC ヘッダーの `USER_NAV` は残す
- E2E: `e2e/library-switch.spec.ts`（切り替えの往復、スマホで /mylist・/history のどちらでも「マイリスト」タブがアクティブ）

## ユーザー決定

- チケット本文: マイリストのカードの「最後に再生した動画」は見やすいが、視聴履歴も追いたいことがある。マイリスト画面で視聴履歴に切り替えられてもよい
- 3案（上部に切り替え／見出し横にリンク1つ／マイリスト画面の中に履歴を埋め込む）から「上部に切り替えを置く」を選んだ（2026-11-16）。ページは2つのまま

## Claude が決めた解釈

- 切り替えはタブ列ではなく見出しそのものにした。マイリストには既にステータスのフィルタタブがあり、タブ列を2段にすると紛らわしいため
- スマホのボトムタブは、視聴履歴でも「マイリスト」を光らせる（切り替えの片方なので）。マイページから開いた場合も同じ

## ハマりどころ

- 同じ日の PR #48 も UI仕様書を v2.5 にしていた。#48 を先に入れ、#49 は v2.6 に上げた（[[2026-11-16-user-menu-reorg]]）
