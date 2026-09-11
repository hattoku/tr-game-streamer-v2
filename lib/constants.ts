// SECRET_MANAGEMENT.md の方針: 開発フェーズは秘密情報をソースに直接記述する運用だが、
// YouTube Data API キーはまだ取得できていないため、いったん環境変数のみで供給する
// （`.env.local` に `YOUTUBE_API_KEY=...` を設定）。取得後はlib/firebase.tsのFirebase設定と
// 同様に、既定値としてここへ直接書き込みSECRET_MANAGEMENT.mdの表を更新すること。
//
// サーバー専用（NEXT_PUBLIC_プレフィックスを付けない）。ブラウザに露出させず、
// Next.js API Route等のサーバーサイドコードからのみ利用する。
export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
