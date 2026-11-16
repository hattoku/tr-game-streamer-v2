---
title: ユーザーが自分のアイコンを設定できるようにする
type: source
date: 2026-11-17
updated: 2026-11-17
---

# ユーザーが自分のアイコンを設定できるようにする

PR #54（2026-11-17 マージ）。Notion チケット「ユーザー自身のアイコンを設定できるようにする」。仕様は ページ 設定 プロフィール仕様書 v1.11（§4.2・§9.2〜9.5。PR #53 が先に v1.10 を使ったため繰り下げ）。

## 変更

- `components/profile/ProfileHeader.tsx`: プロフィール編集フォームに「アイコン」欄。「画像を選ぶ／画像を変更」「画像を外す」。選ぶとその場で 72px のプレビュー（`URL.createObjectURL`、差し替え・閉じるときに解放）。「保存する」でアイコン → 表示名・自己紹介の順に保存し、アイコンで失敗したら残りも保存しない
- `app/api/users/[userId]/avatar/route.ts`: `PUT`（multipart の `image`、Content-Length 必須）と `DELETE`。本人のみ、BAN済みは404。`users.profileImageUrl` をトランザクションで差し替えてから前の画像を消す（1人1枚）
- `app/api/users/[userId]/avatar/[fileName]/route.ts`: 配信。ログイン不要。そのユーザーの現在のアイコンで BAN されていないときだけ返す（差し替え前の URL は404）
- `lib/profile-image-server.ts`: 先頭バイトで PNG・JPEG・WebP を判定 → sharp で向き反映・中央で正方形に切り抜き・256×256 WebP（メタデータは残らない）。保存先は Cloud Storage `avatars/{uid}/{20文字}.webp`
- `lib/profile-image-shared.ts`: 形式・5MB・エラー文言・URL の形をクライアントと API で共有
- `lib/profile-server.ts`: reviews・collections の非正規化コピー（`userDisplayName`・`userProfileImageUrl`）を揃える処理を表示名の PATCH と共通化
- `components/layout/UserDropdown.tsx` の `UserAvatar`: 未設定・読み込み失敗時は頭文字ではなく人物シルエット。画像は `/api/users/` で始まる URL だけ表示する。ヘッダー・マイページは `AuthContext` の `profileImageUrl`（users の onSnapshot）を使う
- `firestore.rules`: `users.profileImageUrl` を本人の update・create から外し、API だけが書くようにした
- `firebase.json`: `/api/users/*/avatar/*` だけ `Cache-Control: private, max-age=604800`（ファイル名が保存ごとに変わるので端末にキャッシュさせる。CDN には置かない）
- 仕様書: プロフィール v1.11、Firestore データモデル v2.10、技術スタック v2.19（§2.12）、デザイントークン v2.14（§14）、uiコンポーネント v2.7、マイページ v1.3、トレーサビリティ v1.20、レビュー投稿機能（投稿者サムネイル）
- E2E: `e2e/profile-avatar.spec.ts`（書き換えるテストは desktop のみ）

## ユーザー決定

- アイコンはユーザーにファイルをアップロードさせる。未設定は無難な名無しの人物シルエット。サイズ・形式は一般的なものに留める（チケットの要望）

## 実装メモ（Claude の判断）

- 形式はお問い合わせの添付画像と同じ PNG・JPEG・WebP・5MB にそろえた（旧仕様の GIF は外した）。切り抜き画面は作らず中央で自動切り抜き
- シルエットはヘッダーを含む全ユーザーアイコンに適用した（頭文字表示をやめた）
- 配信は Storage の公開 URL ではなく API 経由にした。storage.rules の全拒否を保ち、BAN・差し替え時に配信を止められるようにするため
- アップロードの回数制限は入れていない（前の画像を消すので Storage は1人1枚にとどまる）
- 退会時に `avatars/{uid}/` を消すことをデータモデル §7.1 に書いた（退会機能はまだ無い）
- stg の E2E で、保存トーストの確認が読み上げ用の aria-live 領域にも当たって strict mode 違反になった。`getByText(...).first()` で直した（トーストは「成功: …」が1つの要素）
