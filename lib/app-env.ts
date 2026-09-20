// 接続先環境（本番 / ステージング）の判定を一箇所に集約する。
//
// `NEXT_PUBLIC_APP_ENV=prod` と明示したときだけ本番（`tr-game-streamer`）、それ以外はすべて
// ステージング（`tr-game-streamer-stg`）に倒す。以前は「stgと明示しない限り本番」だったため、
// ローカルの `npm run dev` やE2E確認が本番Firestoreに向いてしまい、テストデータの後始末を
// 毎回必要としていた（HANDOFF.md フェーズ1〜4.5の各E2E記録参照）。安全側をデフォルトにする。
//
// 本番向けビルドは deploy.sh / deploy.ps1 → cloudbuild.yaml の `_APP_ENV=prod` で明示される。
// ローカルで本番に接続したい場合は `npm run dev:prod` を使う。
//
// NEXT_PUBLIC_ 変数はビルド時にインライン化されるため、`process.env.NEXT_PUBLIC_APP_ENV` の
// 参照はここに閉じ、他のモジュールは APP_ENV / IS_PROD を import する。
export const APP_ENV: 'prod' | 'stg' = process.env.NEXT_PUBLIC_APP_ENV === 'prod' ? 'prod' : 'stg';
export const IS_PROD = APP_ENV === 'prod';

// テストモードウィジェット・/api/test/sign-in（UI仕様書 §7）の有効化フラグ。
// `NEXT_PUBLIC_TEST_MODE=true` かつ本番以外でのみ有効。本番では変数が渡されていても無視し、
// 使い捨てテスト会員が本番Authに作られることを防ぐ。
export const TEST_MODE_ENABLED = !IS_PROD && process.env.NEXT_PUBLIC_TEST_MODE === 'true';
