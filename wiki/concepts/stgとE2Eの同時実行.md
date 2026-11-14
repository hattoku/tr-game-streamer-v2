---
title: stgとE2Eの同時実行
type: concept
date: 2026-11-14
updated: 2026-11-14
---

# stgとE2Eの同時実行

stg は1つで、複数のスレッド（クラウドセッション）が同時に作業する。ぶつかると偽の失敗になる。

- **デプロイ**: 別スレッドのデプロイで上書きされると、自分の変更が消えて E2E が壊れる（段階6では `/creators` が 404 になった、[[2026-11-08-rebranding-stage6-applications]]）。
  2026-11-14 から、stg への出し直しはコーディネーターが1本ずつ順番に回す
- **E2E の後始末**: 実行の前後にテスト用会員の `[E2E]` データをすべて消すため、2つ同時に流すと互いのデータを消す
- **再取得を動かす spec**（`refresh-new-videos`・`series-new-notification`・`unavailable-videos`）は stg 全体を書き換えるので、同じ実行の中でも workers 2 で並べると互いを壊す。1ファイルずつ流す（[[2026-11-14-new-video-notification-and-videolist]]）
- 再取得はプロキシ経由だと初回に「upstream request timeout」になることがあり、Playwright の再試行で通る

## 関連

- [[2026-10-25-e2e-foundation]]・[[クラウドからのstgデプロイ]]
