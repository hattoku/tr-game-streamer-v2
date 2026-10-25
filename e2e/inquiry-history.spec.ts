// お問い合わせ履歴（フェーズ7ステップ7-3-2）。ページ お問い合わせ履歴 仕様書・管理 お問い合わせ管理仕様書 §1.1/§4.5/§5・
// ページ ユーザー通知機能仕様書 §2.1 の確認項目（plans/7-3-2-お問い合わせ履歴-実装計画.md §6）をテストにする。
// 一般ユーザーと管理者を別のブラウザで同時に動かし、送信 → 返信 → 既読 → ユーザー返信 → クローズ → 再オープンを順にたどる。
import { expect, captureIdToken, hasHorizontalScroll, test } from './support/fixtures';
import { uniqueText } from './support/env';

test('お問い合わせの送信から再オープンまで', async ({ userPage, adminPage }) => {
  test.setTimeout(180_000);
  const body = uniqueText('お問い合わせ履歴のテスト');
  const adminReply = uniqueText('運営からの返信');
  const userReply = uniqueText('ユーザーからの返信');
  const memo = uniqueText('内部メモ（ユーザーに見せない）');
  let inquiryId = '';

  await test.step('一般ユーザーが送信すると、履歴一覧に「未対応」で出る', async () => {
    await userPage.goto('/contact');
    await userPage.getByRole('button', { name: '選択してください' }).click();
    await userPage.getByRole('menuitemradio', { name: 'その他' }).click();
    await userPage.getByLabel('お問い合わせ内容（必須）').fill(body);
    await userPage.getByRole('button', { name: '送信する' }).click();
    await expect(userPage.getByRole('heading', { name: 'お問い合わせを受け付けました' })).toBeVisible();

    await userPage.getByRole('link', { name: 'お問い合わせ履歴を見る' }).click();
    const item = userPage.getByRole('link').filter({ hasText: body });
    await expect(item).toBeVisible();
    await expect(item).toContainText('未対応');
    await expect(item).not.toContainText('運営から新しい返信があります');
    expect(await hasHorizontalScroll(userPage)).toBe(false);
    inquiryId = (await item.getAttribute('href'))!.split('/').pop()!;
    expect(inquiryId).not.toBe('');
  });

  await test.step('管理者が対応メモを書き、返信する', async () => {
    await adminPage.goto(`/admin/inquiries/${inquiryId}`);
    await expect(adminPage.getByText(body).first()).toBeVisible();

    await adminPage.getByRole('button', { name: '編集する' }).click();
    await adminPage.getByLabel(/^対応メモ/).fill(memo);
    await adminPage.getByRole('button', { name: '保存する' }).click();
    await expect(adminPage.getByText(memo)).toBeVisible();

    await adminPage.getByLabel('返信', { exact: true }).fill(adminReply);
    await adminPage.getByRole('button', { name: '送信', exact: true }).click();
    await expect(adminPage.getByText(adminReply)).toBeVisible();
  });

  await test.step('一般ユーザーに通知と未読インジケーターが付き、スレッドを開くと既読になる', async () => {
    await userPage.goto('/notifications');
    await expect(userPage.getByText('お問い合わせに返信が届きました').first()).toBeVisible();

    await userPage.goto('/contact/history');
    const item = userPage.getByRole('link').filter({ hasText: body });
    await expect(item).toContainText('運営から新しい返信があります');
    // 管理者が返信すると「未対応」から「対応中」になる（管理 お問い合わせ管理仕様書 §4.5）
    await expect(item).toContainText('対応中');

    await item.click();
    await expect(userPage.getByText(adminReply)).toBeVisible();
    await expect(userPage.getByText('運営', { exact: true })).toBeVisible();
    expect(await hasHorizontalScroll(userPage)).toBe(false);

    await userPage.goto('/contact/history');
    await expect(userPage.getByRole('link').filter({ hasText: body })).not.toContainText('運営から新しい返信があります');
  });

  await test.step('一般ユーザーが返信すると、管理画面に「ユーザー返信あり」が出る', async () => {
    await userPage.goto(`/contact/history/${inquiryId}`);
    await userPage.getByLabel('メッセージ', { exact: true }).fill(userReply);
    await userPage.getByRole('button', { name: '送信する' }).click();
    await expect(userPage.getByText(userReply)).toBeVisible();

    await adminPage.goto('/admin/inquiries');
    await adminPage.getByLabel('キーワード検索').fill(body);
    const row = adminPage.getByRole('link').filter({ hasText: body });
    await expect(row).toContainText('ユーザー返信あり');
  });

  await test.step('管理者がクローズすると入力欄が消え、一般ユーザーが再オープンすると「未対応」に戻る', async () => {
    await adminPage.goto(`/admin/inquiries/${inquiryId}`);
    await adminPage.getByRole('button', { name: 'クローズ', exact: true }).click();
    await adminPage.getByRole('dialog').getByRole('button', { name: 'クローズする' }).click();
    await expect(adminPage.getByText('このスレッドはクローズされています')).toBeVisible();

    await userPage.goto(`/contact/history/${inquiryId}`);
    await expect(userPage.getByText('このスレッドはクローズされています。', { exact: false })).toBeVisible();
    await expect(userPage.getByLabel('メッセージ', { exact: true })).toHaveCount(0);
    await userPage.getByRole('button', { name: '再オープンする' }).click();
    await expect(userPage.getByLabel('メッセージ', { exact: true })).toBeVisible();
    await expect(userPage.getByText('未対応', { exact: true })).toBeVisible();
  });

  await test.step('API は本人以外に 404・未ログインに 401 を返し、対応メモを含めない', async () => {
    const userToken = await captureIdToken(userPage, '/contact/history');
    const adminToken = await captureIdToken(adminPage, '/admin');
    const api = userPage.request;

    const own = await api.get(`/api/inquiries/${inquiryId}`, { headers: { Authorization: `Bearer ${userToken}` } });
    expect(own.status()).toBe(200);
    const ownText = await own.text();
    expect(ownText).not.toContain('operatorMemo');
    expect(ownText).not.toContain(memo);
    const list = await api.get('/api/inquiries', { headers: { Authorization: `Bearer ${userToken}` } });
    expect(list.status()).toBe(200);
    expect(await list.text()).not.toContain(memo);

    // 管理者も、ユーザー側 API では他人のお問い合わせとして扱われる
    const other = await api.get(`/api/inquiries/${inquiryId}`, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(other.status()).toBe(404);

    expect((await api.get('/api/inquiries')).status()).toBe(401);
    expect((await api.get(`/api/inquiries/${inquiryId}`)).status()).toBe(401);
  });
});

test('存在しないお問い合わせIDのスレッドは 404 になる', async ({ userPage }) => {
  await userPage.goto('/contact/history/e2e-does-not-exist');
  await expect(userPage.getByRole('heading', { name: 'ページが見つかりません' })).toBeVisible();
});
