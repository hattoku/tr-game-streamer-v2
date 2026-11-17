// 運営からのお知らせ（お知らせマスタ・TOP の重要エリアと運営からのお知らせ欄・お知らせ一覧と詳細・ベル）の確認項目。
// 管理 お知らせ管理仕様書 v2.0 §5・§6・§7（決定ログは /mnt/project-files/plans/お知らせ管理/お知らせ管理-計画.md）。
//
// 公開するとお知らせは stg の全員の TOP に出て、ベル ON なら全会員に通知が作られる。後始末（e2e/support/cleanup.ts）が
// タイトルが [E2E] で始まるお知らせとそのベル通知・画像を消すが、テストの中でも作ったものは終わりに消す。
// 書き込む流れは desktop だけで確かめる（mobile と同時に同じお知らせを操作して食い違わないように）。
import type { Page } from '@playwright/test';
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';
import { E2E_MARK } from './support/env';
import { randomId } from './support/collection';
import { testUserUid } from './support/watch-progress';

test.describe.configure({ mode: 'serial' });

const createdNotices: string[] = [];

async function deleteNotice(id: string) {
  const related = await e2eDb().collection('notifications').where('noticeId', '==', id).get();
  const batch = e2eDb().batch();
  related.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(e2eDb().doc(`notices/${id}`));
  await batch.commit();
}

test.afterEach(async () => {
  while (createdNotices.length > 0) await deleteNotice(createdNotices.pop()!).catch(() => {});
});

function noticeTitle(label: string): string {
  return `${E2E_MARK} ${label} ${randomId('')}`.slice(0, 50);
}

/** Admin SDK で公開中のお知らせを直接作る（表示だけ確かめるテスト用） */
async function seedPublishedNotice(data: Record<string, unknown>): Promise<string> {
  const ref = e2eDb().collection('notices').doc();
  const now = new Date();
  await ref.set({
    title: noticeTitle('表示'),
    body: `${E2E_MARK} 本文です`,
    attachmentType: 'none',
    linkLabel: '',
    linkUrl: '',
    imageFileName: null,
    youtubeVideoId: null,
    youtubeUrl: '',
    notifyBell: false,
    important: false,
    importantUntil: null,
    memo: '',
    status: 'published',
    publishedAt: now,
    bellSentAt: null,
    bellSentCount: null,
    createdBy: 'e2e',
    updatedBy: 'e2e',
    createdAt: now,
    updatedAt: now,
    ...data,
  });
  createdNotices.push(ref.id);
  return ref.id;
}

async function bellCount(noticeId: string): Promise<number> {
  return (await e2eDb().collection('notifications').where('noticeId', '==', noticeId).count().get()).data().count;
}

function noticeIdFromUrl(page: Page): string {
  const m = new URL(page.url()).pathname.match(/^\/admin\/notices\/([^/]+)$/);
  if (!m || m[1] === 'new') throw new Error(`編集画面の URL ではありません: ${page.url()}`);
  return m[1];
}

test('§2 一般ユーザーは /admin/notices を開けない', async ({ userPage }) => {
  await userPage.goto('/admin/notices');
  await expect(userPage).toHaveURL((url) => url.pathname === '/');
});

test('§5・§6.3 下書きを作れて、利用者側には出ない。添付の種類で入力欄が切り替わり、公開するときは必須を確かめる', async ({ adminPage, guestPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '書き込む流れは desktop のみ');
  const title = noticeTitle('下書き');

  await adminPage.goto('/admin/notices/new');
  await expect(adminPage.getByRole('heading', { name: 'お知らせを作る' })).toBeVisible();

  await test.step('添付の種類で入力欄が切り替わる', async () => {
    await expect(adminPage.getByLabel(/^リンク先のURL/)).toHaveCount(0);
    await adminPage.getByRole('radio', { name: 'テキストリンクのみ' }).check();
    await expect(adminPage.getByLabel(/^リンクの文言/)).toBeVisible();
    await expect(adminPage.getByLabel(/^リンク先のURL/)).toBeVisible();
    await adminPage.getByRole('radio', { name: '画像付きテキストリンク' }).check();
    await expect(adminPage.getByRole('button', { name: '画像を選ぶ' })).toBeVisible();
    await adminPage.getByRole('radio', { name: 'YouTube 動画' }).check();
    await expect(adminPage.getByLabel(/^YouTube 動画のURL/)).toBeVisible();
    await expect(adminPage.getByLabel(/^リンク先のURL/)).toHaveCount(0);
    await adminPage.getByRole('radio', { name: '添付なし' }).check();
  });

  await test.step('「メールでも送る」は出さない（決定1）', async () => {
    await expect(adminPage.getByText('メールでも送る')).toHaveCount(0);
  });

  await test.step('タイトルだけで下書き保存でき、編集画面の URL に変わる', async () => {
    await adminPage.getByLabel(/^タイトル/).fill(title);
    await adminPage.getByRole('button', { name: '下書き保存' }).click();
    await expect(adminPage.getByText('下書きを保存しました')).toBeVisible();
    await expect(adminPage).toHaveURL(/\/admin\/notices\/(?!new)[^/]+$/);
    createdNotices.push(noticeIdFromUrl(adminPage));
    await expect(adminPage.getByTestId('notice-status')).toHaveText('下書き');
  });

  await test.step('本文が空のまま「公開する」を押すとメッセージが出る', async () => {
    await adminPage.getByRole('button', { name: '公開する' }).click();
    await expect(adminPage.getByText('本文を入力してください')).toBeVisible();
    await expect(adminPage.getByRole('dialog')).toHaveCount(0);
  });

  await test.step('一覧に「下書き」で出て、利用者側のお知らせ一覧には出ない', async () => {
    await adminPage.goto('/admin/notices');
    await expect(adminPage.getByTestId('admin-notice-list').getByRole('link', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) })).toContainText('下書き');
    await guestPage.goto('/notices');
    await expect(guestPage.getByRole('heading', { name: '運営からのお知らせ' })).toBeVisible();
    await expect(guestPage.getByText(title)).toHaveCount(0);
  });
});

test('§6.4 プレビューが入力に合わせて変わる（TOPでの見え方・メールでの見え方）', async ({ adminPage }) => {
  const title = noticeTitle('プレビュー');
  await adminPage.goto('/admin/notices/new');
  await adminPage.getByLabel(/^タイトル/).fill(title);
  await adminPage.getByLabel(/^本文/).fill('プレビューの本文');
  const preview = adminPage.getByTestId('notice-preview');
  await expect(preview.getByTestId('notice-article')).toContainText(title);
  await expect(preview.getByTestId('notice-article')).toContainText('プレビューの本文');
  await expect(preview.getByTestId('important-notice')).toHaveCount(0);
  await adminPage.getByRole('checkbox', { name: /重要なお知らせとして出す/ }).check();
  await expect(preview.getByTestId('important-notice')).toContainText(title);

  await preview.getByRole('tab', { name: 'メールでの見え方' }).click();
  await expect(preview.getByTestId('email-preview-subject')).toHaveText(`${title} | プレミテ`);
  await expect(preview.getByText('メール送信は準備中です')).toBeVisible();
  await expect(preview.frameLocator('iframe[title="メールの本文のプレビュー"]').getByText('プレビューの本文')).toBeVisible();
  expect(await hasHorizontalScroll(adminPage)).toBe(false);
});

test('§5・§7 公開するとTOPの欄・一覧・詳細に出て、ベルと重要エリアにも届く。直しても・非公開→再公開でもベルは増えない', async ({ adminPage, guestPage, userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '全員のTOPとベルに出すため desktop のみ');
  const title = noticeTitle('公開');
  const uid = await testUserUid();
  let noticeId = '';

  await test.step('ベル・重要をつけて公開する（確認ダイアログに届け方が出る）', async () => {
    await adminPage.goto('/admin/notices/new');
    await adminPage.getByLabel(/^タイトル/).fill(title);
    await adminPage.getByLabel(/^本文/).fill(`${E2E_MARK} 公開のテストです。\n2行目です。`);
    await adminPage.getByRole('checkbox', { name: /ベルで通知する/ }).check();
    await adminPage.getByRole('checkbox', { name: /重要なお知らせとして出す/ }).check();
    await adminPage.getByRole('button', { name: '公開する' }).click();
    const dialog = adminPage.getByRole('dialog', { name: 'このお知らせを公開しますか？' });
    await expect(dialog).toContainText('運営からのお知らせ」欄とお知らせ一覧に載ります');
    await expect(dialog).toContainText('ベルで');
    await expect(dialog).toContainText('重要なお知らせとして出します');
    await dialog.getByRole('button', { name: '公開する' }).click();
    await expect(adminPage.getByText(/公開しました。.*人のベルに通知しました/)).toBeVisible({ timeout: 30_000 });
    noticeId = noticeIdFromUrl(adminPage);
    createdNotices.push(noticeId);
    await expect(adminPage.getByTestId('notice-status')).toHaveText('公開中');
    await expect(adminPage.getByRole('button', { name: '削除' })).toHaveCount(0);
    await expect(adminPage.getByRole('checkbox', { name: /ベルで通知する/ })).toBeDisabled();
  });

  const firstBellCount = await bellCount(noticeId);
  expect(firstBellCount).toBeGreaterThan(0);
  const own = await e2eDb().collection('notifications').where('noticeId', '==', noticeId).where('userId', '==', uid).get();
  expect(own.size).toBe(1);
  expect(own.docs[0].data()).toMatchObject({ type: 'notice', message: title, isRead: false });

  await test.step('TOP の一番上に重要なお知らせ、一番下に運営からのお知らせが出る（未ログイン）', async () => {
    await guestPage.goto('/');
    await expect(guestPage.getByTestId('important-notice').filter({ hasText: title })).toBeVisible();
    await expect(guestPage.getByTestId('top-notices')).toContainText(title);
  });

  await test.step('重要なお知らせは×で閉じると、再読み込みしても出ない', async () => {
    await guestPage.getByTestId('important-notice').filter({ hasText: title }).getByRole('button', { name: 'この重要なお知らせを閉じる' }).click();
    await expect(guestPage.getByTestId('important-notice').filter({ hasText: title })).toHaveCount(0);
    await guestPage.reload();
    await expect(guestPage.getByTestId('top-notices')).toContainText(title);
    await expect(guestPage.getByTestId('important-notice').filter({ hasText: title })).toHaveCount(0);
  });

  await test.step('お知らせ一覧から詳細を開ける', async () => {
    await guestPage.goto('/notices');
    await guestPage.getByTestId('notice-list').getByRole('link', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) }).click();
    await expect(guestPage.getByRole('heading', { name: title })).toBeVisible();
    await expect(guestPage.getByTestId('notice-article')).toContainText('2行目です。');
    await expect(guestPage.getByTestId('notice-article')).toContainText('重要');
  });

  await test.step('会員の通知一覧の「お知らせ」タブに出て、押すと既読になり詳細へ移る', async () => {
    await userPage.goto('/notifications');
    await userPage.getByRole('tab', { name: /お知らせ/ }).click();
    await userPage.getByRole('button', { name: new RegExp(title.replace(/[[\]]/g, '\\$&')) }).click();
    await expect(userPage).toHaveURL(new RegExp(`/notices/${noticeId}$`));
    await expect(userPage.getByRole('heading', { name: title })).toBeVisible();
    await expect.poll(async () => (await e2eDb().doc(`notifications/${own.docs[0].id}`).get()).data()?.isRead, { timeout: 15_000 }).toBe(true);
  });

  await test.step('公開後に直すとすぐ反映され、ベルは増えない', async () => {
    const edited = `${title.slice(0, 44)} 修正`;
    await adminPage.getByLabel(/^タイトル/).fill(edited);
    await adminPage.getByRole('button', { name: '保存', exact: true }).click();
    await expect(adminPage.getByText('保存しました。公開中のお知らせにすぐ反映されます')).toBeVisible();
    await guestPage.goto(`/notices/${noticeId}`);
    await expect(guestPage.getByRole('heading', { name: edited })).toBeVisible();
    expect(await bellCount(noticeId)).toBe(firstBellCount);
  });

  await test.step('非公開にすると TOP・一覧から消え、詳細は「公開を終了しました」', async () => {
    await adminPage.getByRole('button', { name: '非公開にする' }).click();
    await adminPage.getByRole('dialog', { name: '非公開にしますか？' }).getByRole('button', { name: '非公開にする' }).click();
    await expect(adminPage.getByTestId('notice-status')).toHaveText('非公開');
    await guestPage.goto(`/notices/${noticeId}`);
    await expect(guestPage.getByText('このお知らせは公開を終了しました')).toBeVisible();
    await guestPage.goto('/notices');
    await expect(guestPage.getByRole('heading', { name: '運営からのお知らせ' })).toBeVisible();
    await expect(guestPage.getByText(title.slice(0, 20))).toHaveCount(0);
  });

  await test.step('もう一度公開してもベルは増えない', async () => {
    await adminPage.getByRole('button', { name: 'もう一度公開する' }).click();
    const dialog = adminPage.getByRole('dialog', { name: 'もう一度公開しますか？' });
    await expect(dialog).toContainText('ベルの通知は送り直しません');
    await dialog.getByRole('button', { name: '公開する' }).click();
    await expect(adminPage.getByTestId('notice-status')).toHaveText('公開中');
    expect(await bellCount(noticeId)).toBe(firstBellCount);
  });
});

test('§5 下書きは削除できる', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '書き込む流れは desktop のみ');
  const title = noticeTitle('削除');
  await adminPage.goto('/admin/notices/new');
  await adminPage.getByLabel(/^タイトル/).fill(title);
  await adminPage.getByRole('button', { name: '下書き保存' }).click();
  await expect(adminPage).toHaveURL(/\/admin\/notices\/(?!new)[^/]+$/);
  const id = noticeIdFromUrl(adminPage);
  createdNotices.push(id);
  await adminPage.getByRole('button', { name: '削除' }).click();
  await adminPage.getByRole('dialog', { name: 'この下書きを削除しますか？' }).getByRole('button', { name: '削除する' }).click();
  await expect(adminPage).toHaveURL((url) => url.pathname === '/admin/notices');
  await expect.poll(async () => (await e2eDb().doc(`notices/${id}`).get()).exists, { timeout: 15_000 }).toBe(false);
});

test('§7.4 添付（テキストリンク・YouTube）がお知らせ詳細に出る', async ({ guestPage }) => {
  const linkId = await seedPublishedNotice({ title: noticeTitle('リンク'), attachmentType: 'link', linkLabel: '再生リストを探す', linkUrl: '/playlists' });
  const ytId = await seedPublishedNotice({ title: noticeTitle('動画'), attachmentType: 'youtube', youtubeVideoId: 'dQw4w9WgXcQ', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });

  await guestPage.goto(`/notices/${linkId}`);
  await expect(guestPage.getByTestId('notice-article').getByRole('link', { name: '再生リストを探す' })).toHaveAttribute('href', '/playlists');
  expect(await hasHorizontalScroll(guestPage)).toBe(false);

  await guestPage.goto(`/notices/${ytId}`);
  await expect(guestPage.locator('iframe[title="YouTube 動画"]')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  expect(await hasHorizontalScroll(guestPage)).toBe(false);
});

test('§7.1 重要の終わり日時を過ぎたものは重要エリアに出ない（欄・一覧には残る）', async ({ guestPage }) => {
  const title = noticeTitle('期限切れ');
  await seedPublishedNotice({ title, important: true, importantUntil: new Date(Date.now() - 60_000) });
  await guestPage.goto('/');
  await expect(guestPage.getByTestId('top-notices')).toContainText(title);
  await expect(guestPage.getByTestId('important-notice').filter({ hasText: title })).toHaveCount(0);
});

test('§6.2・§6.3 スマートフォン幅でも管理の一覧と編集画面が横にはみ出さない', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'スマートフォン幅の確認');
  await seedPublishedNotice({ title: noticeTitle('スマホ') });
  await adminPage.goto('/admin/notices');
  await expect(adminPage.getByTestId('admin-notice-list')).toBeVisible();
  expect(await hasHorizontalScroll(adminPage)).toBe(false);
  await adminPage.goto('/admin/notices/new');
  await expect(adminPage.getByTestId('notice-preview')).toBeVisible();
  expect(await hasHorizontalScroll(adminPage)).toBe(false);
});
