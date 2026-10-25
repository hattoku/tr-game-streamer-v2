// E2Eテストの接続先と認証情報。接続先は stg に限る（本番のデータを書き換えないため）。
// 値は scripts/run-e2e-stg.sh が環境変数で渡す。

/** テストデータの目印。テストで作るお問い合わせ・返信などの本文は必ずこれで始め、後始末の対象を見分ける */
export const E2E_MARK = '[E2E]';

/** 後始末（Admin SDK）の接続先。stg 固定 */
export const STG_PROJECT_ID = 'tr-game-streamer-stg';

/** テスト用会員（app/api/test/sign-in/route.ts と同じ既定値） */
export const TEST_USER_EMAILS = {
  user: 'test-user@puremite.test',
  admin: 'test-admin@puremite.test',
} as const;

// 本番のホスト。ここに一致する接続先では起動しない
const PROD_HOSTS = new Set(['puremite.net', 'www.puremite.net', 'tr-game-streamer.web.app', 'tr-game-streamer.firebaseapp.com']);

export function resolveBaseUrl(): string {
  const raw = process.env.E2E_BASE_URL;
  if (!raw) {
    throw new Error('E2E_BASE_URL が未設定です。scripts/run-e2e-stg.sh から実行してください');
  }
  const url = new URL(raw);
  if (PROD_HOSTS.has(url.hostname)) {
    throw new Error(`E2E_BASE_URL が本番（${url.hostname}）を指しています。E2Eテストは stg にのみ実行できます`);
  }
  return url.origin;
}

/** stg ゲートのパスワード。ゲートを設定していない環境（ローカルの next dev 等）では未設定でよい */
export function gatePassword(): string | undefined {
  return process.env.STAGING_GATE_PASSWORD || undefined;
}

/** テストごとに一意な本文を作る（並列実行・リトライでも他のテストのデータと混ざらないように） */
export function uniqueText(label: string): string {
  return `${E2E_MARK} ${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
