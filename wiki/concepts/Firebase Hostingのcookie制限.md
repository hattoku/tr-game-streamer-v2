---
title: Firebase Hostingのcookie制限
type: concept
date: 2026-09-23
updated: 2026-09-23
---

# Firebase Hostingのcookie制限

Firebase Hostingは`**`リライトでCloud Run/Cloud Functionsへリクエストを転送する際、
**`__session`という名前以外のCookieをすべてリクエストから除去する**（Firebase Hosting自体の
既知の仕様・制限。複数の実例報告あり: https://firebase.google.com/docs/hosting/full-config ,
GitHub issue [firebase-tools#9467](https://github.com/firebase/firebase-tools/issues/9467)）。

## 症状

- Cloud Runの直接URL（`https://puremite-<hash>.asia-northeast1.run.app`）では、発行した
  Cookieが正しくサーバーに送り返され認証が通る。
- カスタムドメイン（`puremite.net`、Firebase Hosting経由）では、同じCookieが**サーバーに
  一切届かない**ため、いつまで経っても未認証のまま扱われる。レスポンスヘッダーの`Set-Cookie`
  自体は正常に返っている（ブラウザには保存される）ため、一見発行側の実装は正しく見え、
  原因の切り分けが難しい。
- `Authorization`ヘッダー（Basic認証・Bearerトークン）は制限されず、そのまま転送される。

[[2026-09-23-stg-cookie-gate]]（Basic認証→Cookieゲート移行）実装後、本番デプロイで
「パスワードを入力してもログインが完了せず、スピナーが回り続けたまま進まない」という形で発覚。
`curl`で直接Cloud Run URLと`puremite.net`を比較し、後者だけCookie送信後も`/stg-login`への
リダイレクトが続くことで特定した。

## 対応

自前のCookie名（例: `stg_gate`）ではなく、**`__session`という固定名を使う**（[[stg-gate]]
`lib/stg-gate.ts`の`STG_GATE_COOKIE_NAME`）。他の名前は使えない。

## 関連
- [[stg-gate]]
- [[2026-09-23-stg-cookie-gate]]
- [[ステージング環境運用方針]]（HANDOFF.md 2026-09-19に記録された、Firebase Hosting CDNの
  キャッシュがBasic認証をエッジで素通りさせていた別の既知の落とし穴と合わせて、Firebase Hosting
  経由のアクセス制御には要注意）
