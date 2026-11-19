// 本人の退会＝データの消去（2026-11-19）と、管理者による退会（締め出し方式）・ユーザー管理（2026-11-17）。
// - 管理 ユーザー管理仕様書 §3（一覧・絞り込み・詳細・編集・備考・退会／解除・登録推移グラフ）
// - ページ 設定 仕様書 §8（本人の退会）
// - ページ ログイン アカウント登録・ログイン仕様書 §5.5・§5.6（管理者が退会させたアカウントのログイン、退会済みアドレスの再登録）
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

test.describe('本人の退会＝データの消去（設定 §8）', () => {
  let account: Account;
  const PLAYLIST = 'e2e-withdraw-playlist';
  test.afterEach(async () => {
    if (account) await deleteAccount(account);
    const reasons = await db().collection('withdrawal_reasons').get();
    await Promise.all(reasons.docs.filter((d) => String(d.get('reason')).includes(E2E_MARK)).map((d) => d.ref.delete()));
  });

  /** 本人の作成データを一通り入れる */
  async function seedData(uid: string) {
    const now = new Date();
    await db().collection('reviews').doc(`${uid}_${PLAYLIST}`).set({
      userId: uid, playlistId: PLAYLIST, starRating: 4, comment: `${E2E_MARK}レビュー`, hasSpoiler: false,
      helpfulCount: 0, userDisplayName: account.displayName, postedAt: now, updatedAt: now,
    });
    await db().collection('mylist').doc(`${uid}_${PLAYLIST}`).set({ userId: uid, playlistId: PLAYLIST, createdAt: now });
    await db().collection('watch_history').doc(`${uid}_vid1`).set({ userId: uid, playlistId: PLAYLIST, youtubeVideoId: 'vid1', watchedAt: now });
    await db().collection('watch_progress').doc(`${uid}_${PLAYLIST}_vid1`).set({ userId: uid, playlistId: PLAYLIST, youtubeVideoId: 'vid1', updatedAt: now });
    await db().collection('notifications').doc(`e2e-withdraw-${uid}`).set({ userId: uid, isRead: false, createdAt: now });
  }

  test('案内→確認（チェックと「退会」の入力）を経て退会すると、データとアカウントが消え、同じアドレスで新しく作れる', async ({ guestPage: page }) => {
    account = await createAccount(page, 'self');
    await seedData(account.uid);
    await login(page, account);
    await expect(page).toHaveURL(/\/$/);

    // ① 消えるものの案内
    await page.goto('/settings');
    await page.getByRole('button', { name: '退会する' }).click();
    const dialog = page.getByRole('dialog', { name: '退会しますか？' });
    await expect(dialog.getByText('元に戻せません', { exact: false }).first()).toBeVisible();
    await expect(dialog.getByText('投稿したレビュー', { exact: false })).toBeVisible();
    await dialog.getByLabel('使わなくなった').check();
    await dialog.getByLabel('ご意見があればお聞かせください（任意）').fill(`${E2E_MARK}理由`);
    await dialog.getByTestId('withdraw-next').click();

    // ② 最後の確認: チェックと「退会」の入力が揃うまで押せない
    const confirm = dialog.getByTestId('withdraw-confirm');
    await expect(confirm).toBeDisabled();
    await dialog.getByTestId('withdraw-understood').check();
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('「退会」と入力してください', { exact: false }).fill('退会');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page).toHaveURL(/\/$/);

    // データもアカウントも消えている
    expect((await db().collection('users').doc(account.uid).get()).exists).toBe(false);
    for (const [name, id] of [
      ['reviews', `${account.uid}_${PLAYLIST}`],
      ['mylist', `${account.uid}_${PLAYLIST}`],
      ['watch_history', `${account.uid}_vid1`],
      ['watch_progress', `${account.uid}_${PLAYLIST}_vid1`],
      ['notifications', `e2e-withdraw-${account.uid}`],
    ] as const) {
      expect((await db().collection(name).doc(id).get()).exists, name).toBe(false);
    }
    // 理由は uid を付けずに残る
    const reasons = (await db().collection('withdrawal_reasons').get()).docs.filter((d) => String(d.get('reason')).includes(E2E_MARK));
    expect(reasons).toHaveLength(1);
    expect(JSON.stringify(reasons[0].data())).not.toContain(account.uid);
    // ログアウトされ、同じメールアドレス・パスワードではもうログインできない
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);
    await login(page, account);
    await expect(page.getByText('メールアドレスまたはパスワードが正しくありません')).toBeVisible();

    // 同じメールアドレスで新しくアカウントを作れる（以前のデータは戻らない）
    await page.goto('/login?mode=signup');
    await page.getByLabel('メールアドレス').fill(account.email);
    await page.getByLabel('パスワード', { exact: true }).fill(account.password);
    await page.getByLabel('パスワード（確認）').fill(account.password);
    await page.getByLabel('私は13歳以上です').check();
    await page.getByRole('button', { name: 'アカウントを作成する' }).click();
    await expect(page).toHaveURL(/\/$/);
    const recreated = await idTokenOf(account);
    expect(recreated).toBeTruthy();
    const me = (await db().collection('users').where('email', '==', account.email).get()).docs;
    expect(me).toHaveLength(1);
    expect((await db().collection('reviews').where('userId', '==', me[0].id).get()).size).toBe(0);
    // 後片づけ用に、作り直した方の UID を持たせる
    account = { ...account, uid: me[0].id };
  });

  test('確認（confirm）が無い退会 API は断る。「戻る」で手続きを取りやめられる', async ({ guestPage: page }) => {
    account = await createAccount(page, 'self-confirm');
    const token = await idTokenOf(account);
    const denied = await page.request.post('/api/account/withdraw', { headers: { Authorization: `Bearer ${token}` }, data: {} });
    expect(denied.status()).toBe(400);
    expect((await db().collection('users').doc(account.uid).get()).exists).toBe(true);

    await login(page, account);
    await page.goto('/settings');
    await page.getByRole('button', { name: '退会する' }).click();
    const dialog = page.getByRole('dialog', { name: '退会しますか？' });
    await dialog.getByTestId('withdraw-next').click();
    await dialog.getByRole('button', { name: '戻る' }).click();
    await expect(dialog.getByTestId('withdraw-next')).toBeVisible();
    await dialog.getByRole('button', { name: 'キャンセル' }).click();
    await expect(dialog).toBeHidden();
    expect((await db().collection('users').doc(account.uid).get()).exists).toBe(true);
  });

  test('管理者が退会させたアカウントの退会済みアドレスでは、再登録できず「すでに登録されています」と出る', async ({ guestPage: page }) => {
    account = await createAccount(page, 'signup');
    await db().collection('users').doc(account.uid).update({ accountStatus: 'withdrawn', withdrawnBy: 'admin' });
    await page.goto('/login?mode=signup');
    await page.getByLabel('メールアドレス').fill(account.email);
    await page.getByLabel('パスワード', { exact: true }).fill(account.password);
    await page.getByLabel('パスワード（確認）').fill(account.password);
    await page.getByLabel('私は13歳以上です').check();
    await page.getByRole('button', { name: 'アカウントを作成する' }).click();
    await expect(page.getByText('このメールアドレスはすでに登録されています')).toBeVisible();
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
    // 再開の API は無い（本人の退会はデータごと消去する方式。2026-11-19）
    const token = await idTokenOf(account);
    expect((await guestPage.request.post('/api/account/resume', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(404);
    // 右上の×（aria-label「閉じる」）と区別するため、ボタンの並びの中から選ぶ
    await blocked.getByTestId('withdrawn-by-admin').getByRole('button', { name: '閉じる' }).click();
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
