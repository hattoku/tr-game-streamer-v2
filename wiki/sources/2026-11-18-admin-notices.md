---
title: 運営からのお知らせ（お知らせ管理・TOPのお知らせ欄・重要エリア）
type: source
date: 2026-11-18
updated: 2026-11-18
---

# 運営からのお知らせ（お知らせ管理・TOPのお知らせ欄・重要エリア）

PR #65（2026-11-18 マージ）。Notion チケット「お知らせマスタページとtopの運営からのお知らせ欄の作成」。仕様は 管理 お知らせ管理仕様書 v2.0（ヘッダー下の帯だった v1.4 から作り直し）、ページ top 仕様書 v2.6、ユーザー通知機能仕様書 v1.9、Firestore データモデル設計書 v3.3 ほか。

## 変更

- 管理: `/admin/notices`（一覧・状態タブ・20件ずつ）、`/admin/notices/new`、`/admin/notices/[noticeId]`。編集は `components/admin/notices/NoticeEditor.tsx`、プレビュー（「TOPでの見え方」「メールでの見え方」）は `NoticePreview.tsx`。管理ナビに「お知らせ」
- 入力: タイトル・本文・備考（利用者に見せない）・添付（なし／テキストリンク／画像＋リンク／YouTube）・ベル通知・重要（任意の終わり日時）。入力チェックは `lib/notice-shared.ts` の `validateNoticeInput`（画面とサーバーで共通）
- 状態: 下書き→公開中→非公開→再公開。下書きは書きかけでも保存でき、削除は下書きだけ
- 利用者: TOP の一番上に重要なお知らせ（`ImportantNoticesArea`、× で端末ごとに閉じる＝localStorage）、一番下に最新3件（`NoticesSection`、カタログの取得とは別に出す）。`/notices` 一覧（もっと見る）・`/notices/[noticeId]` 詳細（非公開は「公開を終了しました」）。通知画面に「お知らせ」タブ、フッターに「お知らせ」
- API: 公開 `GET /api/notices`（`?limit&before`）・`/api/notices/important`・`/api/notices/[noticeId]`・画像 `/api/notices/image/[fileName]`。管理 `POST /api/admin/notices`、`PATCH|DELETE /api/admin/notices/[noticeId]`（action save/publish/unpublish）、`POST /api/admin/notices/images`。処理は `lib/notice-server.ts`
- ベル通知: 初めて公開したとき ON なら、その時点の会員（AI 運営者を除く）に1人1件（type `notice`）。1回だけ
- メール: 送信は後日（DNS・Resend の準備後）。文面は `lib/notice-email.ts`（件名「{タイトル} | プレミテ」）でプレビューだけ

## ユーザー決定

- 2段階。メール送信・テスト送信・配信停止・有効会員の定義は DNS の準備後（「DNSの設定は今後の課題にするのでできる範囲で」）
- 公開後も直せて、非公開にも戻せる。ベル通知は1回だけで、直しても再公開しても送り直さない
- 予約公開はなし
- 重要は終わり日時を決められる（過ぎたらふつうのお知らせに戻る。空ならチェックを外すまで）
- TOP のお知らせ欄は一番下（タグピックアップの後）、重要エリアは一番上
- ベル通知は公開した時点の会員だけ
- YouTube はどの動画でもよい（埋め込み）。画像は PNG・JPEG・WebP、5MB、1枚

## 実装メモ（Claude の判断）

- `notices` の Firestore ルールは管理者だけ読める・書けない（備考・作成者を隠すため）。利用者は API 経由で `toPublicNotice` が備考を除く。stg・本番に出すときはルールとインデックス（`status` 昇順＋`publishedAt` 降順）のデプロイが要る（無いと `/api/notices` が 500）
- ベル通知は `bellSentAt` をトランザクションで先に立ててから 450件ずつ書く。通知のIDは `notice_{noticeId}_{uid}` に決め、途中で失敗したら下書きに戻して（`publishedAt`・`bellSentAt` も空）「もう一度公開する」でやり直せるようにした（同じ人に2通届かない）
- 終わり日時を過ぎたお知らせを直せるよう、保存済みの終わり日時から変えていなければ過去でも通す（`validateNoticeInput` の4番目の引数）
- 画像は sharp で幅1200px の WebP にして Storage `notices/{20文字}.webp`。差し替えたら古い画像を消す。下書きのプレビューとメールで使うため、推測できない名前で API から配信する（非公開後も URL を知っていれば見える）
- プレビューはサーバー描画と日付がずれる（ハイドレーションの不一致）ので、ブラウザで描いてから出す（`useSyncExternalStore`）
- 「重要」の色は新しいトークン `color-notice-important`・`-text`・`-bg`・`-border`・`-on`（デザイントークン仕様書 v2.15）
- E2E: `e2e/notices.spec.ts`（8件。書き込みを伴うものは desktop だけ）。トーストの文は読み上げ用の文にも一致するので `getByText(...).first()` にする。後始末は `e2e/support/cleanup.ts` でタイトルが `[E2E]` で始まるお知らせ・そのベル通知・画像を消す
- 単体テスト: `tests/unit/notice-shared.test.ts`・`notice-email.test.ts`
