// 単体テスト（Vitest）の設定。実行: npm test
// 対象は DB（Firestore）・外部 API を使わない処理だけ（2026-11-17 決定。DB を含む確認は stg の E2E に任せる）。
// テストは tests/unit/ に置く。E2E（Playwright、e2e/）とは別。
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // tsconfig.json の paths（`@/*` → リポジトリ直下）と同じ
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
