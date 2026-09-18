// SECRET_MANAGEMENT.md の方針: このリポジトリはpublicのため、lib/firebase.tsのFirebase設定とは
// 異なりソースへの直書きは採らない。ローカル開発は `.env.local` の `YOUTUBE_API_KEY=...`、
// Cloud Runデプロイ時は deploy.sh/deploy.ps1 が `.env.local` から読み取り
// `gcloud run deploy --update-env-vars` で注入する。
//
// サーバー専用（NEXT_PUBLIC_プレフィックスを付けない）。ブラウザに露出させず、
// Next.js API Route等のサーバーサイドコードからのみ利用する。
export const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
