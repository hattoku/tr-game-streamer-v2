// メール内リンクの受け口 /auth/action（ページ ログイン アカウント登録・ログイン仕様書 §9.4、2026-11-17）。
// 有効なコード（oobCode）は Firebase がメールで送るものしか作れない（stg の SA には Auth の管理権限が無い）ため、
// ここでは無効なリンクの画面と、プレミテのレイアウト（ロゴ）で出ることを確かめる。
// 有効なリンクでの完了画面は、実際のメールで手動確認する。
import { expect, test } from './support/fixtures';

const cases = [
  { name: 'mode・コードなし', query: '', button: 'ログインページへ', href: '/login' },
  { name: 'メールアドレス変更の確認（使えないコード）', query: '?mode=verifyAndChangeEmail&oobCode=e2e-invalid&lang=ja', button: '設定ページへ', href: '/settings' },
  { name: 'パスワード再設定（使えないコード）', query: '?mode=resetPassword&oobCode=e2e-invalid&lang=ja', button: 'パスワード再設定メールを送る', href: '/password-reset' },
  { name: '変更の取り消し（使えないコード）', query: '?mode=recoverEmail&oobCode=e2e-invalid&lang=ja', button: 'ログインページへ', href: '/login' },
  { name: '知らない mode', query: '?mode=signIn&oobCode=e2e-invalid', button: 'ログインページへ', href: '/login' },
];

test.describe('リンクが使えないとき（§9.4）', () => {
  for (const c of cases) {
    test(`${c.name}: 「このリンクは使えません」とやり直す場所を出す`, async ({ guestPage }) => {
      await guestPage.goto(`/auth/action${c.query}`);
      const result = guestPage.getByTestId('auth-action-result');
      await expect(result).toBeVisible();
      await expect(result).toHaveAttribute('data-tone', 'error');
      await expect(guestPage.getByRole('heading', { name: 'このリンクは使えません' })).toBeVisible();
      await expect(guestPage.getByRole('link', { name: c.button })).toHaveAttribute('href', c.href);
      // プレミテの認証画面のレイアウト（ロゴのヘッダー）で出す
      await expect(guestPage.locator('header').getByRole('link', { name: 'プレミテ トップページ' })).toBeVisible();
      await expect(guestPage.getByRole('link', { name: 'TOP', exact: true })).toHaveAttribute('href', '/');
    });
  }
});
