// 設定ページのメールアドレス変更（ページ 設定 仕様書 §4.3、2026-11-17）。
// - 表示（全文表示・「変更する」）とモーダルの入力チェックは、保存済みのテスト用会員（userPage）で確かめる
// - パスワードを使う確認（現在のパスワード違い・使用中のアドレス・送信成功）は、テスト用会員のパスワードを
//   変えると他のテストのログイン状態が切れるため、その場で作る使い捨てアカウントで行い、最後に消す
//   （Firebase Auth の REST API。stg の公開 API キーは lib/firebase.ts と同じ）
// 送信成功でも、メール内のリンクを開くまでアドレスは変わらない（verifyBeforeUpdateEmail）。
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { TEST_USER_EMAILS } from './support/env';

const STG_API_KEY = 'AIzaSyB_HmS-y7rgzDYVQMAryn5Ugbmsxrjmb5Y';

async function identityToolkit<T>(method: string, body: object): Promise<T> {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${STG_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new Error(`accounts:${method} が失敗しました: ${json.error?.message}`);
  return json;
}

function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@puremite.test`;
}

async function openModal(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: '変更する' }).click();
  const dialog = page.getByRole('dialog', { name: 'メールアドレスを変更する' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('表示（§4.3）', () => {
  test('アカウントカードに現在のメールアドレスを全文で出し、「変更する」でモーダルが開く', async ({ userPage }) => {
    await userPage.goto('/settings');
    await expect(userPage.getByTestId('settings-email')).toHaveText(TEST_USER_EMAILS.user);
    const dialog = await openModal(userPage);
    await expect(dialog.getByLabel('新しいメールアドレス', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('新しいメールアドレス（確認用）')).toBeVisible();
    await expect(dialog.getByLabel('現在のパスワード')).toBeVisible();
    await expect(dialog.getByRole('button', { name: '変更メールを送信する' })).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('入力チェック（§4.3 バリデーション）', () => {
  test('空欄・形式・不一致・現在と同じアドレスでエラーを出す', async ({ userPage }) => {
    const dialog = await openModal(userPage);
    const submit = dialog.getByRole('button', { name: '変更メールを送信する' });
    const newEmail = dialog.getByLabel('新しいメールアドレス', { exact: true });
    const confirm = dialog.getByLabel('新しいメールアドレス（確認用）');

    await submit.click();
    await expect(dialog.getByText('メールアドレスを入力してください')).toHaveCount(2);
    await expect(dialog.getByText('パスワードを入力してください')).toBeVisible();

    await newEmail.fill('not-an-email');
    await submit.click();
    await expect(dialog.getByText('正しいメールアドレスを入力してください')).toBeVisible();

    await newEmail.fill(uniqueEmail('mismatch'));
    await confirm.fill(uniqueEmail('other'));
    await submit.click();
    await expect(dialog.getByText('メールアドレスが一致しません')).toBeVisible();

    await newEmail.fill(TEST_USER_EMAILS.user.toUpperCase());
    await submit.click();
    await expect(dialog.getByText('現在のメールアドレスと同じです')).toBeVisible();
  });
});

test.describe('送信（§4.3 変更フロー）', () => {
  test('パスワード違い・使用中のアドレスはエラー、正しく入れると確認メールを送る', async ({ guestPage }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'アカウントを作るので desktop だけ');
    const email = uniqueEmail('change');
    const password = `E2e-${Math.random().toString(36).slice(2)}A1`;
    const { idToken } = await identityToolkit<{ idToken: string }>('signUp', { email, password, returnSecureToken: true });
    try {
      await guestPage.goto('/login');
      await guestPage.getByLabel('メールアドレス').fill(email);
      await guestPage.getByLabel('パスワード', { exact: true }).fill(password);
      await guestPage.getByRole('button', { name: 'ログインする' }).click();
      await expect(guestPage).not.toHaveURL(/\/login/);

      const dialog = await openModal(guestPage);
      const newEmail = uniqueEmail('new');
      await dialog.getByLabel('新しいメールアドレス', { exact: true }).fill(newEmail);
      await dialog.getByLabel('新しいメールアドレス（確認用）').fill(newEmail);
      const passwordInput = dialog.getByLabel('現在のパスワード');
      const submit = dialog.getByRole('button', { name: '変更メールを送信する' });

      await passwordInput.fill(`${password}-wrong`);
      await submit.click();
      await expect(dialog.getByText('現在のパスワードが正しくありません')).toBeVisible();

      // 使用中のアドレス（Firebase の列挙保護ではエラーにならないため、サーバーで確かめる）
      await dialog.getByLabel('新しいメールアドレス', { exact: true }).fill(TEST_USER_EMAILS.admin);
      await dialog.getByLabel('新しいメールアドレス（確認用）').fill(TEST_USER_EMAILS.admin);
      await passwordInput.fill(password);
      await submit.click();
      await expect(dialog.getByText('このメールアドレスはすでに使用されています')).toBeVisible();

      await dialog.getByLabel('新しいメールアドレス', { exact: true }).fill(newEmail);
      await dialog.getByLabel('新しいメールアドレス（確認用）').fill(newEmail);
      await submit.click();
      await expect(dialog.getByText('確認メールを送信しました')).toBeVisible();
      await expect(dialog.getByText(newEmail)).toBeVisible();
      await dialog.getByRole('button', { name: '閉じる' }).first().click();
      await expect(dialog).toBeHidden();
      // リンクを開くまではアドレスは変わらない
      await expect(guestPage.getByTestId('settings-email')).toHaveText(email);
    } finally {
      await identityToolkit('delete', { idToken }).catch(() => undefined);
    }
  });

  test('確認 API はログインしていないと使えない', async ({ guestPage }) => {
    const res = await guestPage.request.post('/api/account/email/check', { data: { newEmail: TEST_USER_EMAILS.admin } });
    expect(res.status()).toBe(401);
  });
});
