---
title: リブランディング段階2 — まとめ機能を画面から取り下げる
type: source
date: 2026-11-01
updated: 2026-11-14
commit: 8c7d96d
---

# リブランディング段階2 — まとめ機能を画面から取り下げる

PR #17（`8c7d96d`、2026-11-01）。仕様は まとめ機能仕様書 v2.0〜v2.1。

## 変更

- `lib/feature-flags.ts` の `COLLECTIONS_ENABLED = false` で、TOP「新着のまとめ」、再生リスト詳細の「この再生リストを含むまとめ」「まとめに追加する」、マイリストカードの「まとめに追加」、プロフィールのまとめ、ナビ・さがすタブ（3タブ等分）・フッター・ユーザーメニューから外した
- **データとコードは消さない**。`true` に戻せば復活する
- `/collections*` は `proxy.ts` で HTTP 404 の 404 ページに書き換える。`app/api/collections*` は読み書きせず 404
- E2E: `e2e/collections-withdrawn.spec.ts`。`smoke.spec.ts` からまとめのページを外した

## ハマりどころ

- page/layout の `notFound()` だけだと、`loading.tsx` のストリーミングで HTTP ステータスが 200 になる。ステータスまで 404 にしたいので [[proxy]] で書き換えた
- E2E で ID トークンを取るページは、API を呼ぶ `/contact/history` を使う（`/mylist` は API を呼ばないので取れない）

## 関連

- まとめ機能の元の実装: [[2026-10-08-phase6-step4-1-collections]]・[[2026-10-12-phase6-step4-2-collections-discovery]]・[[2026-10-12-phase6-step4-3-collections-save]]
