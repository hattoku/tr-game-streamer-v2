// お問い合わせ返信・審査結果を通知一覧・ベルから外し、ユーザーアイコンとメニューで知らせる変更の確認項目。
// ページ ユーザー通知機能仕様書 v1.7 §2・§4.1・§4.3・§5.3、共通 uiコンポーネント フロント 仕様書 v2.2 §2.12、
// ページ 再生リストを追加する 仕様書 v5.3 §9.4。
// 通知は Admin SDK で直接作り、終了時に自分で消す。提案履歴を開くと一般ユーザーの未読の審査結果がすべて既読になるため、
// 既読の流れは desktop だけで確かめる（mobile・tablet と同時に走って食い違わないように）。
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';
import { testUserUid } from './support/watch-progress';

test.describe.configure({ mode: 'serial' });

const created: string[] = [];

test.afterEach(async () => {
  while (created.length > 0) {
    const path = created.pop()!;
    await e2eDb().doc(path).delete().catch(() => {});
  }
});

async function seedNotification(data: Record<string, unknown>): Promise<string> {
  const ref = e2eDb().collection('notifications').doc();
  await ref.set({ isRead: false, createdAt: new Date(), ...data });
  created.push(`notifications/${ref.id}`);
  return ref.id;
}

test('§4.3 お問い合わせ返信・審査結果は通知一覧に出ず、ユーザーアイコンの件数とメニューの未読数で知らせる。提案履歴を開くと既読になる', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '一般ユーザーの未読の審査結果を既読にするため desktop のみ');
  const uid = await testUserUid();
  const reviewMessage = `[E2E] 再生リスト「${randomId('分離')}」の提案は見送りになりました（E2E）`;
  const inquiryMessage = `[E2E] お問い合わせに返信が届きました ${randomId('分離')}`;
  const reviewId = await seedNotification({ userId: uid, type: 'review_result', workflowId: randomId('wfE2E'), playlistId: null, playlistTitle: '', message: reviewMessage });
  const inquiryId = await seedNotification({ userId: uid, type: 'inquiry_reply', inquiryId: randomId('inqE2E'), message: inquiryMessage });

  await test.step('通知一覧には出ず、審査結果・お問い合わせ返信のタブもない', async () => {
    await userPage.goto('/notifications');
    await expect(userPage.getByRole('heading', { name: '通知', exact: true })).toBeVisible();
    await expect(userPage.getByText(reviewMessage)).toHaveCount(0);
    await expect(userPage.getByText(inquiryMessage)).toHaveCount(0);
    await expect(userPage.getByRole('tab', { name: /審査結果/ })).toHaveCount(0);
    await expect(userPage.getByRole('tab', { name: /お問い合わせ返信/ })).toHaveCount(0);
  });

  await test.step('ユーザーアイコンに件数が付き、メニューの「提案履歴」「お問い合わせ履歴」に未読数が出る', async () => {
    await expect(userPage.getByTestId('user-menu-badge')).toBeVisible();
    const trigger = userPage.getByRole('button', { name: /ユーザーメニュー（.*お問い合わせの未読の返信 \d+ 件.*未読の審査結果 \d+ 件/ });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(userPage.getByRole('menuitem', { name: /提案履歴.*未読 \d+/ })).toBeVisible();
    await expect(userPage.getByRole('menuitem', { name: /お問い合わせ履歴.*未読 \d+/ })).toBeVisible();
    await userPage.keyboard.press('Escape');
  });

  await test.step('提案履歴の上部「新しい審査結果」に出て、開いた時点で既読になる', async () => {
    await userPage.goto('/playlists/proposals');
    await expect(userPage.getByTestId('unseen-review-results')).toContainText(reviewMessage);
    await expect.poll(async () => (await e2eDb().doc(`notifications/${reviewId}`).get()).data()?.isRead, { timeout: 15_000 }).toBe(true);
    // お問い合わせ返信は提案履歴では既読にしない
    expect((await e2eDb().doc(`notifications/${inquiryId}`).get()).data()?.isRead).toBe(false);
    await userPage.reload();
    await expect(userPage.getByRole('heading', { name: '提案履歴', exact: true })).toBeVisible();
    await expect(userPage.getByText(reviewMessage)).toHaveCount(0);
  });

  await test.step('お問い合わせ返信を既読にすると、メニューの未読数が消える', async () => {
    await e2eDb().doc(`notifications/${inquiryId}`).update({ isRead: true });
    await userPage.goto('/notifications');
    await userPage.getByRole('button', { name: /^ユーザーメニュー/ }).click();
    await expect(userPage.getByRole('menuitem', { name: /お問い合わせ履歴/ })).not.toContainText('未読');
    await userPage.keyboard.press('Escape');
  });
});

test('§5.3 通知一覧のタブはスマホでも1行に収まる', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'スマホ幅だけで確かめる');
  const uid = await testUserUid();
  // タブは通知が1件以上あるときに出る。審査結果・お問い合わせ返信が届いていてもタブは増えない
  await seedNotification({ userId: uid, type: 'series_new_episode', playlistId: randomId('PLE2E'), playlistTitle: '[E2E] タブ確認', message: '[E2E] 「タブ確認」に新しい動画が追加されました' });
  await seedNotification({ userId: uid, type: 'review_result', workflowId: randomId('wfE2E'), playlistId: null, playlistTitle: '', message: '[E2E] タブ確認の審査結果', isRead: true });
  await seedNotification({ userId: uid, type: 'inquiry_reply', inquiryId: randomId('inqE2E'), message: '[E2E] タブ確認のお問い合わせ返信', isRead: true });

  await userPage.goto('/notifications');
  const tabs = userPage.getByRole('tab');
  await expect(tabs).toHaveCount(3);
  const tops = await tabs.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});
