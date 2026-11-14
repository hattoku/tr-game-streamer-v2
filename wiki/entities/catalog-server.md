---
title: lib/catalog-server.ts（一覧のサーバー側検索）
type: entity
date: 2026-11-14
updated: 2026-11-14
---

# lib/catalog-server.ts（一覧のサーバー側検索）

段階7（[[2026-11-08-rebranding-stage7-server-search]]）で追加。仕様は `document/specification/common/共通 一覧のサーバー側検索 仕様書.md`。**API Route からだけ import する**（サーバー専用）。

## 何をしているか

- Firestore に部分一致や「タグを全部含む」が無いため、検索面に出す再生リスト（公開かつ掲載中）と channels・games・tags を Cloud Run インスタンスのメモリに索引として持つ
- Admin SDK の `onSnapshot` で最新に保つ。最初の1回だけ全件を読み、その後は変わった文書の分だけ読む
- 30分（`IDLE_RESYNC_MS`）以上使われなかったインスタンスは、次に使うときに購読を張り直す（CPU が止まっている間に購読が遅れている可能性があるため。30分以上切れた購読の再開は Firestore も全件読みとして課金するので、読み取りは増えない）
- 最初の全件読み込みを25秒（`READY_TIMEOUT_MS`）待っても終わらなければ 503（`CatalogUnavailableError`）
- 公開関数: `searchPlaylists`・`searchChannels`・`searchGames`・`topCatalog`、レスポンスは `catalogResponse`（回数制限 `lib/rate-limit.ts` を通す）
- 型と正規化（`normalizeForSearch`）、ページング（`paginate`）、件数の定数は `lib/catalog-shared.ts`
- チャンネルの並びは、ピン留め（`featuredOrder`）→ 人気の点数（`lib/popularity-shared.ts`）→ 再生リスト数 → 名前（[[2026-11-08-rebranding-stage5-popular-channels]]）

## 触るときの注意

- 新しい一覧を足すときは、ここに索引と検索関数を足す。画面から Firestore を直接全件読まない（[[掲載状態と検索面]]）
- 索引に入れるフィールドを増やしたら、変更の購読で更新されるかを確かめる
