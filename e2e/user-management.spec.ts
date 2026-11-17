// 退会（締め出し方式）とユーザー管理（2026-11-17）。
// - 管理 ユーザー管理仕様書 §3（一覧・絞り込み・詳細・編集・備考・退会／解除・登録推移グラフ）
// - ページ 設定 仕様書 §8（本人の退会）
// - ページ ログイン アカウント登録・ログイン仕様書 §5.5・§5.6（退会中のログイン・再開、アカウント作成時の案内）
// 退会させるのはテスト用会員ではなく、その場で作る使い捨てアカウント（Firebase Auth の REST API。e2e/email-change.spec.ts と同じ）。
// 最後に Auth のアカウントと users・admin_user_records を消す。
import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { db } from './support/cleanup';
import { E2E_MARK, TEST_USER_EMAILS } from './support/env';

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

interface Account {
  email: string;
  password: string;
  uid: string;
  displayName: string;
}

/** 使い捨てアカウントを作り、users を作る（アカウント作成画面と同じく init-user を呼ぶ） */
async function createAccount(page: Page, label: string): Promise<Account> {
  const email = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@puremite.test`;
  const password = `E2e-${Math.random().toString(36).slice(2)}-pass`;
  const { idToken, localId } = await identityToolkit<{ idToken: string; localId: string }>('signUp', { email, password, returnSecureToken: true });
  const res = await page.request.post('/api/auth/init-user', { headers: { Authorization: `Bearer ${idToken}` } });
  expect(res.ok()).toBeTruthy();
  const displayName = `${E2E_MARK}退会${label}`;
  await db().collection('users').doc(localId).update({ displayName });
  return { email, password, uid: localId, displayName };
}

async function deleteAccount(account: Account): Promise<void> {
  try {
    const { idToken } = await identityToolkit<{ idToken: string }>('signInWithPassword', {
      email: account.email,
      password: account.password,
      returnSecureToken: true,
    });
    await identityToolkit('delete', { idToken });
  } catch {
    // 作成に失敗していた等
  }
  await db().collection('users').doc(account.uid).delete().catch(() => undefined);
  await db().collection('admin_user_records').doc(account.uid).delete().catch(() => undefined);
}

async function idTokenOf(account: Account): Promise<string> {
  const { idToken } = await identityToolkit<{ idToken: string }>('signInWithPassword', {
    email: account.email,
    password: account.password,
    returnSecureToken: true,
  });
  return idToken;
}

async function login(page: Page, account: Account, password = account.password) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(account.email);
  await page.getByLabel('パスワード', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'ログインする' }).click();
}

test.describe('本人の退会と再開（設定 §8・ログイン §5.5）', () => {
  let account: Account;
  test.afterEach(async () => {
    if (account) await deleteAccount(account);
  });

  test('設定から退会するとログアウトされ、ログインで再開を聞かれる。「再開しない」でログアウト、「再開する」で使える', async ({ guestPage: page }) => {
    account = await createAccount(page, 'self');
    await login(page, account);
    await expect(page).toHaveURL(/\/$/);

    // 退会する（理由は任意）
    await page.goto('/settings');
    await page.getByRole('button', { name: '退会する' }).click();
    const dialog = page.getByRole('dialog', { name: '退会しますか？' });
    await expect(dialog.getByText('いつでも利用を再開できます', { exact: false })).toBeVisible();
    await dialog.getByLabel('使わなくなった').check();
    await dialog.getByRole('button', { name: '退会する' }).click();
    await expect(page).toHaveURL(/\/$/);
    // ログアウトされている（設定はログインページへ戻される）
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);

    const data = (await db().collection('users').doc(account.uid).get()).data();
    expect(data?.accountStatus).toBe('withdrawn');
    expect(data?.withdrawnBy).toBe('self');
    expect(data?.withdrawReason).toBe('使わなくなった');

    // 退会中は公開プロフィールが見えない
    expect((await page.request.get(`/api/users/${account.uid}/profile`)).status()).toBe(404);
    // 退会中のトークンではログインが要る API を使えない
    const token = await idTokenOf(account);
    const denied = await page.request.post('/api/account/withdraw', { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect(denied.status()).toBe(403);

    // ログイン → 再開の確認 → 再開しない
    await login(page, account);
    const resume = page.getByRole('dialog', { name: 'このアカウントは退会済みです' });
    await expect(resume).toBeVisible();
    await resume.getByRole('button', { name: '再開しない（ログアウト）' }).click();
    await expect(resume).toBeHidden();
    await expect(page.getByRole('button', { name: 'ログインする' })).toBeVisible();

    // もう一度ログイン → 再開する
    await login(page, account);
    await page.getByRole('dialog', { name: 'このアカウントは退会済みです' }).getByRole('button', { name: '利用を再開する' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(async () => (await db().collection('users').doc(account.uid).get()).data()?.accountStatus).toBe('active');
    expect((await page.request.get(`/api/users/${account.uid}/profile`)).status()).toBe(200);
  });

  test('アカウント作成に退会済みのアドレスを入れると、同じパスワードなら再開の確認に進み、違えば案内を出す', async ({ guestPage: page }) => {
    account = await createAccount(page, 'signup');
    const token = await idTokenOf(account);
    expect((await page.request.post('/api/account/withdraw', { headers: { Authorization: `Bearer ${token}` }, data: {} })).ok()).toBeTruthy();

    await page.goto('/login?mode=signup');
    await page.getByLabel('メールアドレス').fill(account.email);
    await page.getByLabel('パスワード', { exact: true }).fill('wrong-password-123');
    await page.getByLabel('パスワード（確認）').fill('wrong-password-123');
    await page.getByLabel('私は13歳以上です').check();
    await page.getByRole('button', { name: 'アカウントを作成する' }).click();
    await expect(page.getByText('以前のパスワードでログインすると利用を再開できます', { exact: false })).toBeVisible();

    await page.getByLabel('パスワード', { exact: true }).fill(account.password);
    await page.getByLabel('パスワード（確認）').fill(account.password);
    await page.getByRole('button', { name: 'アカウントを作成する' }).click();
    await expect(page.getByRole('dialog', { name: 'このアカウントは退会済みです' })).toBeVisible();
  });
});

test.describe('管理画面のユーザー管理（ユーザー管理 §3）', () => {
  let account: Account;
  test.afterEach(async () => {
    if (account) await deleteAccount(account);
  });

  test('一覧に出て検索で絞れる。詳細でメールは変えられず、名前・備考を保存でき、退会させると本人では再開できない。解除で戻る', async ({ adminPage, guestPage }) => {
    account = await createAccount(guestPage, 'admin');

    await adminPage.goto('/admin/users');
    await expect(adminPage.getByRole('heading', { name: 'ユーザー' })).toBeVisible();
    await adminPage.getByTestId('user-search').fill(account.email);
    await expect(adminPage.getByTestId('user-row')).toHaveCount(1);
    await expect(adminPage.getByTestId('user-row')).toContainText('利用中');
    await adminPage.getByTestId('user-row').click();

    // 基本情報（メールアドレスは表示だけ）
    await expect(adminPage.getByTestId('admin-user-email')).toContainText(account.email);
    await expect(adminPage.getByText('メールアドレスは管理画面からは変更できません')).toBeVisible();

    // 登録情報の編集
    const newName = `${E2E_MARK}運営が修正`;
    await adminPage.getByTestId('admin-user-name').fill(newName);
    await adminPage.getByRole('button', { name: '保存する' }).first().click();
    await expect(adminPage.getByRole('heading', { name: newName })).toBeVisible();
    account.displayName = newName;

    // 備考（本人の users には入らない）
    await adminPage.getByTestId('admin-user-note').fill(`${E2E_MARK}運営メモ`);
    await adminPage.getByRole('button', { name: '保存する' }).nth(1).click();
    await expect(adminPage.getByText('最終更新', { exact: false })).toBeVisible();
    expect((await db().collection('admin_user_records').doc(account.uid).get()).data()?.note).toBe(`${E2E_MARK}運営メモ`);
    expect((await db().collection('users').doc(account.uid).get()).data()?.note).toBeUndefined();

    // 退会させる
    await adminPage.getByTestId('admin-user-withdraw-toggle').click();
    await adminPage.getByRole('dialog', { name: 'このユーザーを退会させますか？' }).getByRole('textbox').fill(`${E2E_MARK}規約違反`);
    await adminPage.getByTestId('admin-user-withdraw-confirm').click();
    await expect(adminPage.getByText('運営（本人では再開できません）')).toBeVisible();

    // 本人がログインすると、再開できない旨とお問い合わせの案内
    await login(guestPage, account);
    const blocked = guestPage.getByRole('dialog', { name: 'このアカウントではログインできません' });
    await expect(blocked).toBeVisible();
    await expect(blocked.getByRole('button', { name: '利用を再開する' })).toHaveCount(0);
    const token = await idTokenOf(account);
    expect((await guestPage.request.post('/api/account/resume', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403);
    await blocked.getByRole('button', { name: '閉じる' }).click();
    await expect(guestPage.getByRole('button', { name: 'ログインする' })).toBeVisible();

    // 一覧の状態の絞り込み
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId('user-search').fill(account.email);
    await expect(adminPage.getByTestId('user-row')).toContainText('退会済み（運営）');

    // 解除すると本人がログインできる
    await adminPage.getByTestId('user-row').click();
    await adminPage.getByTestId('admin-user-withdraw-toggle').click();
    await adminPage.getByTestId('admin-user-withdraw-confirm').click();
    await expect(adminPage.getByRole('button', { name: '退会させる' })).toBeVisible();
    await login(guestPage, account);
    await expect(guestPage).toHaveURL(/\/$/);
  });

  test('テスト用会員は退会させられず、設定の退会ボタンも押せない', async ({ adminPage, userPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId('user-search').fill(TEST_USER_EMAILS.user);
    await adminPage.getByTestId('user-row').first().click();
    await expect(adminPage.getByText('管理者・テスト用会員は退会させられません')).toBeVisible();
    await expect(adminPage.getByTestId('admin-user-withdraw-toggle')).toHaveCount(0);

    await userPage.goto('/settings');
    await expect(userPage.getByRole('button', { name: '退会する' })).toBeDisabled();
    await expect(userPage.getByText('テスト用会員は退会できません')).toBeVisible();
  });

  test('新規登録の推移グラフを日別・週別・月別で切り替え、表でも読める', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    const chart = adminPage.getByTestId('signup-chart');
    await expect(chart.getByRole('button')).toHaveCount(30);
    await adminPage.getByRole('tab', { name: '週別' }).click();
    await expect(chart.getByRole('button')).toHaveCount(12);
    await adminPage.getByRole('tab', { name: '月別' }).click();
    await expect(chart.getByRole('button')).toHaveCount(12);
    await chart.getByRole('button').last().hover();
    await expect(adminPage.getByTestId('signup-chart-readout')).toContainText('人');
    await adminPage.getByRole('button', { name: '表で見る' }).click();
    await expect(adminPage.getByTestId('signup-chart-table').locator('tbody tr')).toHaveCount(12);
  });
});
