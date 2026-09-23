---
title: HTTP Basic認証→Cookieベースの共有パスワードゲートへ移行
type: source
date: 2026-09-23
updated: 2026-09-23
---

# HTTP Basic認証→Cookieベースの共有パスワードゲートへ移行

## 背景

友人にテストを依頼するにあたり、既存の[[proxy]]によるBasic認証が「毎日再入力を求められる」
体感の障壁になっているとの指摘。Basic認証はブラウザプロセス単位でしか認証情報を保持しないため、
ブラウザを閉じたりPCを再起動すると再入力が必要になる。

ユーザーとの確認事項（決定）:
- 適用範囲: 現状どおり全環境（stg限定にしない。検証段階のため本番も含めて維持）
- Cookie有効期限: 30日間
- 認証項目: 共有パスワードのみ（ユーザー名は廃止）

## 実装内容

- [[stg-gate]]（`lib/stg-gate.ts`）を新設。生パスワードをCookieに保持せず、
  `STAGING_GATE_PASSWORD` をHMAC鍵として固定メッセージに署名した値をトークンとして
  発行・照合する方式（Web Crypto API、Edgeランタイム対応）。
- [[proxy]]をBasic認証の`Authorization`ヘッダー検査からCookie検証（`request.cookies.get`）＋
  `NextResponse.redirect('/stg-login?redirect=...')`に置き換え。`config.matcher`に
  `stg-login`を追加してループを回避。
- `app/api/stg-gate/route.ts`（POST）を新設。パスワード照合後、`httpOnly`・
  `secure`（本番のみ）・`sameSite: 'lax'`・`maxAge: 30日`でCookieを設定する
  Route Handler（`app/api/auth/init-user/route.ts`と同パターン）。
- `app/stg-login/page.tsx`を新設。`(auth)`ルートグループ（Firebase認証用）には入れず、
  `components/layout/AuthLayout.tsx`のみを流用して分離。フォームは既存`/login`の
  スタイル規約（`SectionHeading`・`Field`+`PasswordInput`・`role="alert"`エラー表示）を踏襲、
  パスワード1項目のみ。
- ドキュメント更新: `SECRET_MANAGEMENT.md`・`技術スタック仕様書.md` §2.7（v2.10）を
  `STAGING_GATE_PASSWORD`単一変数・Cookieゲート方式に更新。

## 確認

lint/tsc成功。HMACトークン導出ロジックは同一パスワードで決定的、異なるパスワードで異なる値に
なることをNodeスクリプトで確認。`/stg-login`のページレンダリング・`/api/stg-gate`の
未設定時500応答・ゲート未設定時の`/`素通りは、稼働中のdev serverに対するcurlで確認済み。
**フルのCookie発行→リダイレクト→再入力不要のフローは、既存のdev serverが`STAGING_GATE_PASSWORD`
未設定のまま稼働中で二重起動できなかったため、ブラウザでの実機確認は未実施**（次回dev server
再起動時、またはstgデプロイ後に確認が必要）。

## dev-orchestrator経由のレビューでの指摘・対応

spec-conformance-reviewer・design-consistency-reviewerを並列レビューし、以下を対応した。

- **[High] オープンリダイレクト**（`app/stg-login/page.tsx`）: `redirect`クエリを検証せず
  `router.replace()`に渡していたため、`redirect=https://evil.example/...`のようなURLで
  ログイン直後に外部サイトへ誘導できてしまう不具合。サイト内の絶対パス（`/`始まり・`//`始まりでない）
  のみ許可するよう修正。
- **[Medium] 仕様書のセクション番号重複・バージョン表記のずれ**（`技術スタック仕様書.md`）:
  §2.7（ステージング環境の保護）を新設した際、後続の既存セクション（インフラ管理／アクセス解析／
  PWA対応）を繰り下げておらず§2.7が重複していた。§2.8/2.9/2.10に振り直し、ヘッダーの
  バージョン表記もv2.9→v2.10に更新。
- **[Medium] フィールドエラー表示パターンの不一致**（`app/stg-login/page.tsx`）: 「入力してください」
  という入力必須エラーを、既存`/login`の規約では「サーバー/通信起因のエラー」専用のトップ
  `AlertIcon`アラートで表示していた。`Field`の`error` propに渡す形に修正し、フィールド単位の
  エラー（アイコン無し・入力欄直下）とフォーム全体エラー（`AlertIcon`付き）の使い分けを既存
  ページと揃えた。
- **[Low]** `app/api/admin/refresh-new-videos/route.ts`のコメントに残っていた「Basic認証」の
  用語を「Cookieゲート」に更新。`components/layout/AuthLayout.tsx`のdocコメントに`/stg-login`
  からの利用も追記。

確認済みで問題無しと判断された項目: トークン導出ロジックの`proxy.ts`/`route.ts`間の一致、
Cookie属性（httpOnly/secure/sameSite/maxAge）、`config.matcher`の除外設定とリダイレクトループ
の不在、パスワード平文比較（共有パスワードによる低価値ゲートの脅威モデルとして許容）。

`HANDOFF.md`（運用ログ、`document/specification/`外）に残るBasic認証時代のPlaywright確認手順・
curl確認手順は、過去の作業記録として意図的に未修正（他の過去ログ同様、事後の書き換えをしない方針）。

## 本番デプロイ後に発覚・修正した不具合: Firebase Hostingのcookie制限

stg・本番とも実装をデプロイし、Cloud Run側で`STAGING_GATE_PASSWORD`を手動設定した後、本番
(`puremite.net`)でログインしてもスピナーが回り続けたまま進まない不具合が発覚。`curl`で
直接Cloud Run URLと`puremite.net`を比較したところ、直接URLでは発行したCookieが正しく認証に
使われるが、`puremite.net`(Firebase Hosting経由)だけ同じCookieがサーバーに届いていないことが
判明。**Firebase Hostingは`__session`という名前以外のCookieをCloud Runへのリクエストから
すべて除去する**という既知の制限が原因(詳細は[[Firebase Hostingのcookie制限]])。
`lib/stg-gate.ts`のCookie名を`stg_gate`から`__session`に変更して解消。stg・本番とも
再デプロイして動作確認済み。

## デプロイ時の注意（手動作業）

`STAGING_BASIC_AUTH_USER`/`STAGING_BASIC_AUTH_PASSWORD`はCloud Runの環境変数に直接設定されており
（`deploy.sh`/`deploy.ps1`経由ではない）、デプロイ前にCloud Run側で`STAGING_GATE_PASSWORD`を
手動設定し、古い2変数を削除する必要がある。未設定のままデプロイするとゲートが無効化され
サイトが無認証で公開される点に注意（[[ステージング環境運用方針]]参照）。

## 関連
- [[proxy]]
- [[stg-gate]]
