// 再生リスト新着通知で、どの配信者のどの動画が新しいか分かるようにする変更の確認項目。
// ページ ユーザー通知機能仕様書 v1.4 §2.1「再生リスト新着通知」、Firestore データモデル設計書 v2.9 §3.30、
// ページ 再生リスト詳細ページにおける動画プレーヤー 仕様書 v1.19「各動画に表示する情報」（投稿日・NEW）。
// 再生リスト・動画・通知は Admin SDK で直接作り、終了時に自分で消す（タイトルは [E2E] で始まる）。
// 「再取得で通知に配信者と動画タイトルが入る」は stg 全体の再取得を動かすため desktop だけで実行する。
import type { Page } from '@playwright/test';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';
import { testUserUid } from './support/watch-progress';

test.describe.configure({ mode: 'serial' });

const DAY_MS = 24 * 60 * 60 * 1000;

/** 後始末するドキュメントのパス */
const created: string[] = [];

test.afterEach(async () => {
  while (created.length > 0) {
    const path = created.pop()!;
    await e2eDb().doc(path).delete().catch(() => {});
  }
});

async function seedPlaylist(channelName: string): Promise<string> {
  const id = randomId('PLE2E');
  await e2eDb().collection('playlists').doc(id).set({
    title: `[E2E] 新着通知の再生リスト ${id}`, thumbnailUrl: '', channelId: null, channelName, channelIconUrl: '',
    gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: 2, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: `https://www.youtube.com/playlist?list=${id}`, lastFetchedAt: null,
    listingStatus: 'listed', listingReason: 'e2e', listingSetBy: 'admin', listingSetAt: new Date(),
    previousListingStatus: null, source: 'admin', explorationChannelId: null,
  });
  created.push(`playlists/${id}`);
  return id;
}

async function seedVideo(playlistId: string, position: number, title: string, publishedAt: Date, addedToPlaylistAt = publishedAt) {
  // YouTube の動画IDの形（11文字）にする。形が違うとプレーヤーが「Invalid video id」で落ち、エラー画面になる
  const youtubeVideoId = `E2E${position}${Math.random().toString(36).slice(2)}xxxxxxxx`.slice(0, 11);
  const id = `${playlistId}_${youtubeVideoId}`;
  await e2eDb().collection('videos').doc(id).set({
    youtubeVideoId, playlistId, position, title, thumbnailUrl: '', durationSeconds: 600, publishedAt, addedToPlaylistAt, playStartCount: 0,
  });
  created.push(`videos/${id}`);
}

async function seedNotification(userId: string, playlistId: string, title: string, extra: Record<string, unknown>) {
  const ref = e2eDb().collection('notifications').doc();
  await ref.set({
    userId, type: 'series_new_episode', playlistId, playlistTitle: title,
    message: `「${title}」に新しい動画が追加されました`, isRead: false, createdAt: new Date(), ...extra,
  });
  created.push(`notifications/${ref.id}`);
}

function notificationCard(page: Page, playlistTitle: string) {
  return page.getByRole('listitem').filter({ hasText: playlistTitle });
}

test('§2.1 再生リスト新着: 配信者名・アイコンと、新しい動画のタイトル（先頭1本＋ほかN本）が出て、サムネイルは出ない', async ({ userPage }) => {
  const uid = await testUserUid();
  const playlistId = await seedPlaylist('[E2E] とても長い名前の配信者Aはホラーゲームばかりやっている');
  const title = `[E2E] 新着通知の再生リスト ${playlistId}`;
  await seedNotification(uid, playlistId, title, {
    channelName: '[E2E] とても長い名前の配信者Aはホラーゲームばかりやっている',
    channelIconUrl: 'https://yt3.ggpht.com/e2e-icon.jpg',
    newVideoTitles: ['[E2E] #6 新しい話', '[E2E] #7 もっと新しい話'],
    newVideoCount: 2,
  });

  await userPage.goto('/notifications');
  const card = notificationCard(userPage, title);
  await expect(card.getByTestId('notification-channel')).toHaveText('[E2E] とても長い名前の配信者Aはホラーゲームばかりやっている');
  // 種別ラベルは「再生リスト新着」で、390px でも改行しない（v1.5）
  const label = card.getByText('再生リスト新着', { exact: true });
  await expect(label).toBeVisible();
  const box = await label.boundingBox();
  const lineHeight = await label.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.5);
  const padding = await label.evaluate((el) => parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom));
  expect(box!.height).toBeLessThan(lineHeight * 2 + padding);
  await expect(card.getByTestId('notification-new-videos')).toHaveText('[E2E] #6 新しい話 ほか1本');
  // 画像は配信者アイコンの1枚だけ（動画のサムネイルは出さない）
  const images = card.locator('img');
  await expect(images).toHaveCount(1);
  await expect(images.first()).toHaveAttribute('src', 'https://yt3.ggpht.com/e2e-icon.jpg');
  expect(await hasHorizontalScroll(userPage)).toBe(false);

  // 遷移先は再生リストのページ（選ぶ動画は通常どおり「続きから」）
  await card.getByRole('button').click();
  await expect(userPage).toHaveURL(new RegExp(`/playlists/${playlistId}$`));
});

test('§2.1 実装状況 配信者の情報を持たない以前の通知は、再生リストから配信者名を補う（動画タイトルは出さない）', async ({ userPage }) => {
  const uid = await testUserUid();
  const playlistId = await seedPlaylist('[E2E] 配信者B');
  const title = `[E2E] 新着通知の再生リスト ${playlistId}`;
  await seedNotification(uid, playlistId, title, {});

  await userPage.goto('/notifications');
  const card = notificationCard(userPage, title);
  await expect(card.getByTestId('notification-channel')).toHaveText('[E2E] 配信者B');
  await expect(card.getByTestId('notification-new-videos')).toHaveCount(0);
});

test('動画プレーヤー仕様書「各動画に表示する情報」動画リストに投稿日が出て、投稿（または再生リストへの追加）から7日以内の動画だけ NEW が付く', async ({ guestPage }) => {
  const playlistId = await seedPlaylist('[E2E] 配信者C');
  const now = Date.now();
  const old = new Date(now - 40 * DAY_MS);
  const recent = new Date(now - 2 * DAY_MS);
  await seedVideo(playlistId, 0, '[E2E] 古い話', old);
  await seedVideo(playlistId, 1, '[E2E] 新しい話', recent);
  // 昔の動画をあとから再生リストに足した（新着通知は届く）ときも NEW
  await seedVideo(playlistId, 2, '[E2E] あとから足した話', old, recent);

  await guestPage.goto(`/playlists/${playlistId}`);
  const oldRow = guestPage.getByRole('listitem').filter({ hasText: '[E2E] 古い話' });
  const newRow = guestPage.getByRole('listitem').filter({ hasText: '[E2E] 新しい話' });
  const md = (d: Date) => {
    const y = d.getFullYear() === new Date(now).getFullYear() ? '' : `${d.getFullYear()}/`;
    return `${y}${d.getMonth() + 1}/${d.getDate()}`;
  };
  await expect(oldRow.getByTestId('video-published-date')).toHaveText(md(old));
  await expect(newRow.getByTestId('video-published-date')).toHaveText(md(recent));
  await expect(newRow.getByText('NEW')).toBeVisible();
  await expect(oldRow.getByText('NEW')).toHaveCount(0);
  const addedRow = guestPage.getByRole('listitem').filter({ hasText: '[E2E] あとから足した話' });
  await expect(addedRow.getByTestId('video-published-date')).toHaveText(md(old));
  await expect(addedRow.getByText('NEW')).toBeVisible();
  expect(await hasHorizontalScroll(guestPage)).toBe(false);
});

/** マイリスト登録が無く（実在の会員に通知を作らない）、動画が2本以上ある公開再生リスト（refresh-new-videos.spec.ts と同じ選び方） */
async function pickRealPlaylist(): Promise<QueryDocumentSnapshot> {
  const snap = await e2eDb().collection('playlists').where('isPublic', '==', true).get();
  for (const d of snap.docs) {
    if (d.id.startsWith('PLE2E') || (d.data().videoCount ?? 0) < 2 || d.data().youtubeItemCount == null || !d.data().channelName) continue;
    const own = await e2eDb().collection('videos').where('playlistId', '==', d.id).limit(2).get();
    if (own.size < 2) continue;
    const mylist = await e2eDb().collection('mylist').where('playlistId', '==', d.id).limit(1).get();
    if (mylist.empty) return d;
  }
  throw new Error('マイリスト登録の無い公開再生リストが stg にありません');
}

test('§2.1・データモデル §3.30 再取得で作る新着通知に、配信者名・アイコンと新しい動画のタイトル・本数が入る', async ({ adminPage, userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '再取得は stg 全体に効くため desktop だけで実行する');
  test.setTimeout(300_000);
  const uid = await testUserUid();
  const playlist = await pickRealPlaylist();
  const before = playlist.data();

  // テスト用会員だけがマイリスト登録している状態にする
  const mylistId = `${uid}_${playlist.id}`;
  await e2eDb().collection('mylist').doc(mylistId).set({ userId: uid, playlistId: playlist.id, watchStatus: 'want_to_watch', isReverseOrder: false, createdAt: new Date(), updatedAt: new Date() });
  created.push(`mylist/${mylistId}`);

  // いちばん新しい動画を消し、前回の動画数の記録をずらす（取り直しで「新しく増えた動画」として戻る）
  const videos = await e2eDb().collection('videos').where('playlistId', '==', playlist.id).get();
  const removed = videos.docs.reduce((a, b) =>
    (b.data().publishedAt?.toMillis?.() ?? 0) > (a.data().publishedAt?.toMillis?.() ?? 0) ? b : a,
  );
  const removedData = removed.data();
  await removed.ref.delete();
  await playlist.ref.update({ youtubeItemCount: -1 });

  try {
    await adminPage.goto('/admin');
    await expect(adminPage.getByText(/最終実行:|実行履歴はまだありません/)).toBeVisible();
    const response = adminPage.waitForResponse((r) => r.url().includes('/api/admin/refresh-new-videos'), { timeout: 240_000 });
    await adminPage.getByRole('button', { name: '新着動画を再取得' }).click();
    expect((await response).status()).toBe(200);

    const snap = await e2eDb().collection('notifications').where('userId', '==', uid).where('playlistId', '==', playlist.id).get();
    snap.docs.forEach((d) => created.push(`notifications/${d.id}`));
    expect(snap.size).toBe(1);
    const n = snap.docs[0].data();
    expect(n.channelName).toBe(before.channelName);
    expect(n.channelIconUrl).toBe(before.channelIconUrl ?? '');
    expect(n.newVideoTitles).toEqual([removedData.title]);
    expect(n.newVideoCount).toBe(1);

    await userPage.goto('/notifications');
    const card = userPage.getByRole('listitem').filter({ hasText: removedData.title });
    await expect(card.getByTestId('notification-channel')).toHaveText(before.channelName);
    await expect(card.getByTestId('notification-new-videos')).toHaveText(removedData.title);
  } finally {
    if (!(await removed.ref.get()).exists) await removed.ref.set(removedData);
    const current = (await playlist.ref.get()).data()!;
    if (current.youtubeItemCount === -1) await playlist.ref.update({ youtubeItemCount: before.youtubeItemCount ?? null });
  }
});
