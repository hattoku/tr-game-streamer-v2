// チャンネル申請・提案の分岐・実況者向けページ（リブランディング段階6）の確認項目。
// v1.3（2026-11-16）でフォームは「提案する」（/propose）のチャンネル側に移った（ページ 提案する 仕様書 §6）。
// ページ チャンネルを申請する 仕様書 v1.3（§2〜§8）、ページ 実況者・事務所の方へ 仕様書、ページ 再生リストを追加する 仕様書 §10.1、
// 管理 審査ワークフロー仕様書 §4.4、ページ お問い合わせフォーム仕様書 §4（v1.5）。
// 実在の YouTube チャンネルを使う（確認 API が YouTube から取るため）。申請の送信は desktop・mobile で別のチャンネルを使い、
// 掲載状態（exploration_channels）を書き換えるテストは同じチャンネルを奪い合わないよう desktop だけで行う。
// 作ったデータ（workflows・exploration_channels・notifications）はテストの最後に自分で消す。
import type { Page } from '@playwright/test';
import { captureIdToken, expect, hasHorizontalScroll, test } from './support/fixtures';
import { waitForGuest } from './support/guest';
import { TEST_USER_EMAILS, uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

// 申請の送信で使うチャンネル（project ごとに別）
const SUBMIT_CHANNEL: Record<string, { handle: string; id: string; name: string }> = {
  desktop: { handle: '@GoogleDevelopers', id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw', name: 'Google for Developers' },
  mobile: { handle: '@AndroidDevelopers', id: 'UCVHFbqXqoYvEWM1Ddxl0QDg', name: 'Android Developers' },
};
// 掲載状態を書き換えるテストで使う YouTube 公式チャンネルと、その再生リスト
const STATE_CHANNEL = { handle: '@YouTube', id: 'UCBR8-60-B28hp2BmDPdntcQ' };
const STATE_PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLM6OA8eOe83s';

async function uidOf(email: string): Promise<string> {
  const snap = await e2eDb().collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) throw new Error(`テスト用会員が見つかりません: ${email}`);
  return snap.docs[0].id;
}

/** 指定のチャンネルの申請だけを消す（desktop・mobile が同じ会員を使うので、他方の申請を巻き込まないよう channelIds で絞る） */
async function deleteWorkflowsFor(uid: string, channelIds: string[]) {
  const snap = await e2eDb().collection('workflows').where('submittedBy', '==', uid).where('type', '==', 'channel_application').get();
  for (const wf of snap.docs.filter((d) => channelIds.includes(d.data().proposalData?.youtubeChannelId))) {
    const notes = await e2eDb().collection('notifications').where('workflowId', '==', wf.id).get();
    await Promise.all(notes.docs.map((n) => n.ref.delete()));
    await wf.ref.delete();
  }
}

/** 実在チャンネル（@YouTube）の掲載チャンネルを書き換える前の状態。終わったら元に戻す（stg に本当に登録されている場合に備える） */
const stashed = new Map<string, Array<{ id: string; data: Record<string, unknown> }>>();
async function stashExplorationChannels(youtubeChannelId: string) {
  const snap = await e2eDb().collection('exploration_channels').where('youtubeChannelId', '==', youtubeChannelId).get();
  stashed.set(youtubeChannelId, snap.docs.map((d) => ({ id: d.id, data: d.data() })));
}
async function restoreExplorationChannels(youtubeChannelId: string) {
  await deleteExplorationChannels(youtubeChannelId);
  for (const d of stashed.get(youtubeChannelId) ?? []) await e2eDb().collection('exploration_channels').doc(d.id).set(d.data);
  stashed.delete(youtubeChannelId);
}

async function deleteExplorationChannels(youtubeChannelId: string) {
  const snap = await e2eDb().collection('exploration_channels').where('youtubeChannelId', '==', youtubeChannelId).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

async function seedExplorationChannel(youtubeChannelId: string, status: string) {
  await deleteExplorationChannels(youtubeChannelId);
  await e2eDb().collection('exploration_channels').add({
    name: uniqueText('掲載チャンネル'), status, youtubeChannelId, channelTitle: uniqueText('掲載チャンネル'), channelIconUrl: '',
    subscriberCount: null, searchCandidates: [], tagIds: [], publishMode: 'confirm', authorizedVia: 'admin',
    lastExploredAt: null, lastFoundCount: null, createdAt: new Date(), createdBy: 'e2e', updatedAt: new Date(),
  });
}

async function seedWorkflow(params: { submittedBy: string; youtubeChannelId: string; channelTitle: string; status?: string }) {
  const ref = e2eDb().collection('workflows').doc();
  await ref.set({
    type: 'channel_application', status: params.status ?? 'reviewing_lv1', submittedBy: params.submittedBy, genreId: null,
    step1AssignedOperatorIds: [], reportData: null, step1History: [], step1Errors: [], step2History: [], editHistory: [], operatorMemo: null,
    submittedAt: new Date(), updatedAt: new Date(),
    proposalData: {
      channelUrl: params.youtubeChannelId, youtubeChannelId: params.youtubeChannelId, channelTitle: params.channelTitle, channelIconUrl: '',
      subscriberCount: 1234, reason: 'E2E の理由',
    },
  });
  return ref.id;
}

async function checkChannel(page: Page, input: string) {
  const field = page.getByLabel('推薦・申請するチャンネル');
  await field.fill(input);
  await field.blur();
}

test.beforeEach(async ({}, testInfo) => {
  test.skip(!SUBMIT_CHANNEL[testInfo.project.name], 'desktop・mobile のみ');
});

test('§2 未ログインは申請ページ（旧URL）からログインへ送られる', async ({ guestPage }) => {
  await guestPage.goto('/channels/apply');
  await expect(guestPage).toHaveURL(/\/login\?next=%2Fpropose%3Ftype%3Dchannel/);
});

test('§2 管理者には申請ではなく掲載チャンネル画面への案内を出す', async ({ adminPage }) => {
  await adminPage.goto('/propose?type=channel');
  await expect(adminPage.getByText('管理者は掲載チャンネル画面から直接登録できます')).toBeVisible();
  await expect(adminPage.getByRole('link', { name: '掲載チャンネル画面へ' })).toHaveAttribute('href', '/admin/collection/channels');
});

test('§3 チャンネルから探すの下に、申請への入口が出る', async ({ guestPage }) => {
  await guestPage.goto('/channels');
  await waitForGuest(guestPage);
  const hint = guestPage.getByTestId('channel-apply-hint');
  await expect(hint).toContainText('探しているチャンネルが見つからないときは');
  // 未ログインはその場でログイン要求モーダル（共通 uiコンポーネント フロント 仕様書 §5.2 v2.11）。ログイン後は申請ページへ戻る
  await hint.getByRole('link', { name: 'チャンネルを申請する' }).click();
  const dialog = guestPage.getByRole('dialog');
  await expect(dialog).toContainText('チャンネルを申請するにはアカウントが必要です');
  await dialog.getByRole('link', { name: 'ログイン', exact: true }).click();
  await expect(guestPage).toHaveURL(/\/login\?next=%2Fpropose%3Ftype%3Dchannel/);
});

test('§4 チャンネルの確認、必須項目、送信、完了画面、提案履歴、見送りと通知', async ({ userPage, adminPage }, testInfo) => {
  test.setTimeout(180_000);
  const channel = SUBMIT_CHANNEL[testInfo.project.name];
  const uid = await uidOf(TEST_USER_EMAILS.user);
  await deleteWorkflowsFor(uid, [channel.id]);
  try {
    await userPage.goto('/propose?type=channel');
    await expect(userPage.getByRole('heading', { name: '提案する' })).toBeVisible();
    await expect(userPage.getByRole('tab', { name: 'チャンネル' })).toHaveAttribute('aria-selected', 'true');
    expect(await hasHorizontalScroll(userPage)).toBe(false);
    // 申請の区分は聞かない（提案する 仕様書 §6.1）。実況者向けページ以外から来たら「推薦する」
    await expect(userPage.getByLabel('好きなチャンネルを推薦する')).toHaveCount(0);
    const submit = userPage.getByRole('button', { name: '推薦する', exact: true });
    await expect(submit).toBeDisabled();

    await test.step('見つからないチャンネルはエラーを出す', async () => {
      await checkChannel(userPage, 'https://www.youtube.com/channel/UCzzzzzzzzzzzzzzzzzzzzzz');
      await expect(userPage.getByText('チャンネルが見つかりませんでした。URLをご確認ください')).toBeVisible();
    });

    await test.step('URL を入れるとチャンネルの確認が出て、送れるようになる', async () => {
      await checkChannel(userPage, `https://www.youtube.com/${channel.handle}`);
      await expect(userPage.getByRole('link', { name: 'YouTubeで開く' })).toHaveAttribute('href', new RegExp(channel.id));
      await userPage.getByLabel(/^推薦・申請の理由/).fill('[E2E] 申請の理由');
      await expect(submit).toBeEnabled();
    });

    await test.step('送信すると完了画面と、提案履歴の「確認待ち」が出る', async () => {
      await submit.click();
      await expect(userPage.getByRole('heading', { name: '申請を送りました（確認待ち）' })).toBeVisible();
      await userPage.getByRole('link', { name: '提案履歴を見る' }).click();
      // 同じ会員が desktop・mobile で別のチャンネルを申請するので、チャンネル名で自分の分に絞る
      const card = userPage.getByTestId('channel-application-card').filter({ hasText: channel.name }).first();
      await expect(card).toContainText('チャンネル申請');
      await expect(card).toContainText('確認待ち');
      // §6 v1.3: 申請したチャンネルが合っているか、YouTube で確かめられる（新しいタブ）
      const yt = card.getByTestId('channel-application-youtube-link');
      await expect(yt).toHaveAttribute('href', `https://www.youtube.com/channel/${channel.id}`);
      await expect(yt).toHaveAttribute('target', '_blank');
      await expect(yt).toContainText('YouTubeで見る');
      expect(await hasHorizontalScroll(userPage)).toBe(false);
    });

    await test.step('同じチャンネルは審査中の間、誰からも申請できない', async () => {
      await userPage.goto('/propose?type=channel');
      await checkChannel(userPage, `https://www.youtube.com/${channel.handle}`);
      await expect(userPage.getByText('このチャンネルは申請済みです（確認待ち）')).toBeVisible();
      await expect(userPage.getByRole('button', { name: '推薦する', exact: true })).toBeDisabled();
      // 他の人の申請でも同じ（管理者の uid で確認 API を叩く）
      const adminToken = await captureIdToken(adminPage, '/playlists/proposals');
      const res = await adminPage.request.post('/api/channels/apply/preview', {
        headers: { Authorization: `Bearer ${adminToken}` },
        data: { input: channel.id },
      });
      expect((await res.json()).state).toBe('pending');
    });

    await test.step('管理者が定型の理由で見送ると、本人の履歴と通知に出る', async () => {
      const wf = (await e2eDb().collection('workflows').where('submittedBy', '==', uid).where('type', '==', 'channel_application').get()).docs.find(
        (d) => d.data().proposalData?.youtubeChannelId === channel.id,
      );
      await adminPage.goto(`/admin/workflows/${wf!.id}`);
      // 申請の区分は記録しない（提案する 仕様書 §6.1）
      await expect(adminPage.getByText('申請の種別')).toHaveCount(0);
      await expect(adminPage.getByText('掲載チャンネルとしての今の状態:')).toBeVisible();
      await adminPage.getByRole('button', { name: '却下する' }).click();
      const dialog = adminPage.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: '却下する' })).toBeDisabled();
      await dialog.getByLabel('その他（掲載の基準に合わない）').check();
      await dialog.getByRole('button', { name: '却下する' }).click();
      await expect(adminPage.getByText('見送り理由: その他（掲載の基準に合わない）')).toBeVisible();

      // 審査結果の通知は通知一覧ではなく、提案履歴の「新しい審査結果」に出る（ユーザー通知機能仕様書 v1.7 §4.3）
      await userPage.goto('/playlists/proposals');
      await expect(userPage.getByTestId('unseen-review-results')).toContainText(`チャンネル「${channel.name}」の申請は見送りになりました（その他（掲載の基準に合わない））`);
      await expect(userPage.getByTestId('channel-application-card').filter({ hasText: channel.name }).first()).toContainText('見送り理由: その他（掲載の基準に合わない）');
    });
  } finally {
    await deleteWorkflowsFor(uid, [channel.id]);
  }
});

test('§4 掲載中・掲載停止のチャンネルは申請できない（再生リスト提案も同じ）', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '掲載状態を書き換えるため desktop のみ');
  test.setTimeout(120_000);
  await stashExplorationChannels(STATE_CHANNEL.id);
  try {
    await seedExplorationChannel(STATE_CHANNEL.id, 'active');
    await userPage.goto('/propose?type=channel');
    await checkChannel(userPage, STATE_CHANNEL.id);
    await expect(userPage.getByText('このチャンネルはすでに掲載しています')).toBeVisible();
    await expect(userPage.getByRole('button', { name: '推薦する', exact: true })).toBeDisabled();

    await seedExplorationChannel(STATE_CHANNEL.id, 'opted_out');
    await userPage.goto('/propose?type=channel');
    await checkChannel(userPage, STATE_CHANNEL.id);
    await expect(userPage.getByText('このチャンネルは掲載していません', { exact: true })).toBeVisible();
    await expect(userPage.getByRole('button', { name: '推薦する', exact: true })).toBeDisabled();
  } finally {
    await restoreExplorationChannels(STATE_CHANNEL.id);
  }
});

test('§8 1日の申請は5件まで（日本時間）', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '上限の確認は desktop のみ');
  // 一般ユーザーの申請と数が混ざらないよう、管理者の uid で確認 API を叩く（確認 API は管理者も呼べる）
  const uid = await uidOf(TEST_USER_EMAILS.admin);
  const limitIds = Array.from({ length: 5 }, () => randomId('UCE2E'));
  try {
    const token = await captureIdToken(adminPage, '/playlists/proposals');
    const preview = async () =>
      (await (await adminPage.request.post('/api/channels/apply/preview', { headers: { Authorization: `Bearer ${token}` }, data: { input: SUBMIT_CHANNEL.desktop.id } })).json());
    expect((await preview()).limitReached).toBe(false);
    for (const id of limitIds) await seedWorkflow({ submittedBy: uid, youtubeChannelId: id, channelTitle: uniqueText('上限') });
    expect((await preview()).limitReached).toBe(true);
    const res = await adminPage.request.post('/api/channels/apply', { headers: { Authorization: `Bearer ${token}` }, data: { input: SUBMIT_CHANNEL.desktop.id } });
    // 管理者は申請できない（403）。上限の確認 API だけを見る
    expect(res.status()).toBe(403);
  } finally {
    await deleteWorkflowsFor(uid, limitIds);
  }
});

test('審査 §4.4 承認すると掲載チャンネルに加わり（確認してから掲載）、本人に通知が届く', async ({ userPage, adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '掲載チャンネルを書き換えるため desktop のみ');
  test.setTimeout(180_000);
  const uid = await uidOf(TEST_USER_EMAILS.user);
  const fakeChannelId = randomId('UCE2E');
  const title = uniqueText('承認するチャンネル');
  try {
    await seedWorkflow({ submittedBy: uid, youtubeChannelId: fakeChannelId, channelTitle: title });
    await adminPage.goto('/admin/workflows');
    await adminPage.getByRole('link').filter({ hasText: title }).first().click();
    await adminPage.getByRole('button', { name: '承認する' }).first().click();
    await adminPage.getByRole('dialog').getByRole('button', { name: '承認する' }).click();
    await expect(adminPage.getByText('承認', { exact: true }).first()).toBeVisible();

    await expect
      .poll(async () => (await e2eDb().collection('exploration_channels').where('youtubeChannelId', '==', fakeChannelId).get()).docs[0]?.data(), { timeout: 30_000 })
      .toMatchObject({ status: 'active', publishMode: 'confirm', authorizedVia: 'channel_application' });

    // 審査結果の通知は通知一覧ではなく、提案履歴の「新しい審査結果」に出る（ユーザー通知機能仕様書 v1.7 §4.3）
    await userPage.goto('/playlists/proposals');
    await expect(userPage.getByTestId('unseen-review-results')).toContainText(`チャンネル「${title}」の申請が承認されました`);
    await expect(userPage.getByTestId('channel-application-card').filter({ hasText: title })).toContainText('承認');
  } finally {
    await deleteWorkflowsFor(uid, [fakeChannelId]);
    await deleteExplorationChannels(fakeChannelId);
  }
});

test('審査 §4.4 掲載停止のチャンネルは承認できない', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '掲載チャンネルを書き換えるため desktop のみ');
  const uid = await uidOf(TEST_USER_EMAILS.user);
  const fakeChannelId = randomId('UCE2E');
  const title = uniqueText('掲載停止のチャンネル');
  try {
    await seedExplorationChannel(fakeChannelId, 'opted_out');
    await seedWorkflow({ submittedBy: uid, youtubeChannelId: fakeChannelId, channelTitle: title });
    await adminPage.goto('/admin/workflows');
    await adminPage.getByRole('link').filter({ hasText: title }).first().click();
    await adminPage.getByRole('button', { name: '承認する' }).first().click();
    await adminPage.getByRole('dialog').getByRole('button', { name: '承認する' }).click();
    await expect(adminPage.locator('p[role="alert"]').filter({ hasText: 'このチャンネルは掲載停止中のため承認できません' })).toBeVisible();
    const docs = await e2eDb().collection('exploration_channels').where('youtubeChannelId', '==', fakeChannelId).get();
    expect(docs.docs.every((d) => d.data().status === 'opted_out')).toBe(true);
  } finally {
    await deleteWorkflowsFor(uid, [fakeChannelId]);
    await deleteExplorationChannels(fakeChannelId);
  }
});

test('再生リストを追加する §10.1 掲載していないチャンネルはチャンネルの推薦へ誘導し、提案は送れない', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '掲載状態を書き換えるため desktop のみ');
  test.setTimeout(120_000);
  const token = await captureIdToken(userPage, '/playlists/proposals');
  const propose = async () =>
    userPage.request.post('/api/playlists/propose', {
      headers: { Authorization: `Bearer ${token}` },
      data: { playlistUrl: STATE_PLAYLIST_URL, newGameTitle: uniqueText('提案のゲーム') },
    });
  const openWithUrl = () => userPage.goto(`/propose?url=${encodeURIComponent(STATE_PLAYLIST_URL)}`);
  await stashExplorationChannels(STATE_CHANNEL.id);
  try {
    await deleteExplorationChannels(STATE_CHANNEL.id);
    await openWithUrl();
    const notListed = userPage.getByTestId('channel-not-listed');
    await expect(notListed).toContainText('このチャンネルはまだプレミテに掲載していません');
    await expect(userPage.getByRole('button', { name: '提案する' })).toHaveCount(0);
    const res = await propose();
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('channel_not_listed');

    // 「このチャンネルを推薦する」でチャンネル側へ移り、そのチャンネルがすでに確認された状態で開く（提案する 仕様書 §7）
    await notListed.getByRole('button', { name: 'このチャンネルを推薦する' }).click();
    await expect(userPage.getByRole('tab', { name: 'チャンネル' })).toHaveAttribute('aria-selected', 'true');
    await expect(userPage.getByRole('link', { name: 'YouTubeで開く' })).toHaveAttribute('href', new RegExp(STATE_CHANNEL.id));

    await seedExplorationChannel(STATE_CHANNEL.id, 'opted_out');
    expect((await (await propose()).json()).error).toBe('channel_opted_out');
    await openWithUrl();
    await expect(userPage.getByText('このチャンネルの再生リストは掲載していません')).toBeVisible();
    await expect(userPage.getByTestId('channel-not-listed')).toHaveCount(0);

    // 掲載中のチャンネルなら分岐は出ず、提案フォームを続けられる
    await seedExplorationChannel(STATE_CHANNEL.id, 'active');
    await openWithUrl();
    await expect(userPage.getByText('公開されている再生リストです')).toBeVisible();
    await expect(userPage.getByTestId('channel-not-listed')).toHaveCount(0);
    await expect(userPage.getByRole('button', { name: '提案する' })).toBeVisible();
  } finally {
    await restoreExplorationChannels(STATE_CHANNEL.id);
  }
});

test('§1 実況者・事務所の方へ: 4つの案内と、お問い合わせ・申請への導線', async ({ guestPage }) => {
  await guestPage.goto('/creators');
  await expect(guestPage.getByRole('heading', { name: '実況者・事務所の方へ', exact: true })).toBeVisible();
  for (const section of ['プレミテについて', '掲載のしかた', '掲載を外してほしいとき', '掲載を申請したいとき', 'よくある質問']) {
    await expect(guestPage.getByRole('heading', { name: section })).toBeVisible();
  }
  await expect(guestPage.getByText('認定')).toHaveCount(0);
  await expect(guestPage.getByRole('link', { name: '掲載を申請する' })).toHaveAttribute('href', '/propose?type=channel&as=creator');
  expect(await hasHorizontalScroll(guestPage)).toBe(false);

  // 掲載停止の窓口: お問い合わせが「チャンネルの掲載について」を選んだ状態で開く
  await guestPage.getByRole('link', { name: '掲載についてお問い合わせ' }).click();
  await expect(guestPage).toHaveURL(/\/contact\?type=channel_listing/);
  await expect(guestPage.getByRole('button', { name: 'お問い合わせ種別（必須）' })).toContainText('チャンネルの掲載について');
  await expect(guestPage.getByText('チャンネル名またはチャンネルのURLを書き添えてください')).toBeVisible();
});

test('§3 フッターに「実況者・事務所の方へ」があり、チャンネル詳細からはリンクしない', async ({ guestPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'フッターはPC幅の部品（モバイルはハンバーガーメニュー）');
  await guestPage.goto('/channels');
  await expect(guestPage.locator('footer').getByRole('link', { name: '実況者・事務所の方へ' })).toHaveAttribute('href', '/creators');
  const first = guestPage.locator('main a[href^="/channels/"]:visible').first();
  if ((await first.count()) === 0) test.skip(true, 'チャンネルが無い環境');
  await first.click();
  await expect(guestPage.getByRole('heading').first()).toBeVisible();
  await expect(guestPage.locator('main').getByRole('link', { name: /実況者・事務所/ })).toHaveCount(0);
});

test('提案する §6.1 実況者向けページから来たときはボタンが「申請する」になる', async ({ userPage }) => {
  await userPage.goto('/creators');
  await userPage.getByRole('link', { name: '掲載を申請する' }).click();
  await expect(userPage).toHaveURL(/\/propose\?type=channel&as=creator/);
  await expect(userPage.getByRole('tab', { name: 'チャンネル' })).toHaveAttribute('aria-selected', 'true');
  await expect(userPage.getByRole('button', { name: '申請する', exact: true })).toBeDisabled();
  await expect(userPage.getByRole('button', { name: '推薦する', exact: true })).toHaveCount(0);
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});
