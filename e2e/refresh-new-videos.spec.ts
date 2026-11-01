// 新着動画の再取得（差分取得）。共通 YouTube定期取得仕様書 v1.7 §7・管理_ダッシュボード仕様書 v1.9 §9.2 の確認項目。
// 再取得は stg の全公開再生リストを相手に YouTube API を呼ぶため、同時に2つ走らないよう desktop だけで順番に実行する
// （mobile は表示の崩れだけを見る）。
// - 見つからない再生リストは、YouTube に無い再生リストIDで Admin SDK から直接作る（タイトルは [E2E] で始まる。
//   テストの終わりと e2e/support/cleanup.ts が消す）
// - 「動画数が変わった再生リストだけ取り直す」は、stg の実在の再生リスト（マイリスト登録の無いもの）から動画を1本消し、
//   前回の動画数の記録をずらして確かめる。取り直しで動画は元に戻る（戻らなかったときはテストの終わりに書き戻す）
import type { Page } from '@playwright/test';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';

test.describe.configure({ mode: 'serial' });

async function runRefresh(page: Page) {
  await page.goto('/admin');
  const response = page.waitForResponse((r) => r.url().includes('/api/admin/refresh-new-videos'), { timeout: 120_000 });
  await page.getByRole('button', { name: '新着動画を再取得' }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  await expect(page.getByText(/^完了しました/)).toBeVisible();
  return res.json();
}

async function latestBatchLog(): Promise<DocumentData> {
  const snap = await e2eDb().collection('batch_logs').orderBy('executedAt', 'desc').limit(1).get();
  return snap.docs[0].data();
}

/** マイリスト登録が無く（通知を作らない）、動画が2本以上ある公開再生リスト */
async function pickRealPlaylist(): Promise<QueryDocumentSnapshot> {
  const snap = await e2eDb().collection('playlists').where('isPublic', '==', true).get();
  for (const d of snap.docs) {
    if (d.id.startsWith('PLE2E') || (d.data().videoCount ?? 0) < 2) continue;
    const mylist = await e2eDb().collection('mylist').where('playlistId', '==', d.id).limit(1).get();
    if (mylist.empty) return d;
  }
  throw new Error('マイリスト登録の無い公開再生リストが stg にありません');
}

test.describe('再取得', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '再取得は stg 全体に効くため desktop だけで実行する');
  });

  test('§7.2 動画数が変わった再生リストだけ取り直し、増えた本数が再生リスト名つきで出る', async ({ adminPage }) => {
    test.setTimeout(240_000);
    const playlist = await pickRealPlaylist();
    const videos = await e2eDb().collection('videos').where('playlistId', '==', playlist.id).limit(1).get();
    const removed = videos.docs[0];
    const removedData = removed.data();

    // 1回目で記録を揃える（初回は全件取り直しになる）
    await runRefresh(adminPage);

    // 動画を1本消し、前回の動画数の記録をずらす（YouTube 側の数と違う＝変わった扱いにする）
    await removed.ref.delete();
    const before = (await playlist.ref.get()).data()!;
    await playlist.ref.update({ youtubeItemCount: -1 });

    try {
      const body = await runRefresh(adminPage);
      expect(body.newVideoDetails).toContainEqual({ playlistId: playlist.id, title: before.title, newVideos: 1 });

      // 画面: 新着のあった再生リストに名前と +1本
      const list = adminPage.getByRole('list', { name: '新着のあった再生リスト' });
      const row = list.getByRole('listitem').filter({ hasText: before.title });
      await expect(row).toContainText('+1本');
      await expect(row.getByRole('link')).toHaveAttribute('href', `/playlists/${playlist.id}`);

      // 消した動画が戻り、記録が YouTube 側の数に揃う
      expect((await removed.ref.get()).exists).toBe(true);
      const after = (await playlist.ref.get()).data()!;
      expect(after.youtubeItemCount).toBeGreaterThanOrEqual(0);

      // 取り直したのは記録をずらした再生リストを含む少数で、動画数が同じ再生リストは取り直さない
      const log = await latestBatchLog();
      expect(log.refetchedCount).toBeLessThan(log.processedCount);
    } finally {
      if (!(await removed.ref.get()).exists) await removed.ref.set(removedData);
      const current = (await playlist.ref.get()).data()!;
      if (current.youtubeItemCount === -1) await playlist.ref.update({ youtubeItemCount: before.youtubeItemCount ?? null });
    }
  });

  test('§7.1・§7.4 動画数が変わっていなければ取り直さず、消費は確認の分（50件ごとに1）だけ', async ({ adminPage }) => {
    test.setTimeout(240_000);
    await runRefresh(adminPage); // 前のテストの影響を消して記録を揃える
    const body = await runRefresh(adminPage);
    expect(body.playlistsRefetched).toBe(0);
    expect(body.quotaConsumed).toBe(Math.ceil(body.playlistsChecked / 50));
    await expect(adminPage.getByTestId('refresh-last-batch')).toContainText(
      `公開 ${body.playlistsChecked} 件を確認、動画数が変わった 0 件を取り直し、新着 0 本`,
    );
    await expect(adminPage.getByTestId('refresh-last-batch')).toContainText('新着はありません');
  });

  test('§7.2 YouTube で見つからない再生リストは一覧に出し、非公開にはしない', async ({ adminPage }) => {
    test.setTimeout(240_000);
    const playlistId = `PLE2E${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const title = uniqueText('見つからない再生リスト');
    const ref = e2eDb().collection('playlists').doc(playlistId);
    await ref.set({
      youtubePlaylistId: playlistId,
      title,
      thumbnailUrl: '',
      channelId: 'UCE2E',
      channelName: '[E2E] チャンネル',
      channelIconUrl: '',
      gameId: null,
      gameName: null,
      gameGenreIds: [],
      videoCount: 3,
      youtubeItemCount: 3,
      latestVideoPublishedAt: null,
      registeredAt: new Date(),
      registeredBy: 'e2e',
      proposedBy: null,
      isPublic: true,
      score: null,
      reviewCount: 0,
      mylistCount: 0,
      playlistTagIds: [],
      playlistTagsFixed: [],
      referenceUrl: `https://www.youtube.com/playlist?list=${playlistId}`,
      lastFetchedAt: null,
    });

    try {
      const body = await runRefresh(adminPage);
      expect(body.notFoundPlaylists).toContainEqual({ playlistId, title });
      await expect(adminPage.getByRole('list', { name: 'YouTubeで見つからない再生リスト' })).toContainText(title);
      expect((await ref.get()).data()!.isPublic).toBe(true);
    } finally {
      await ref.delete();
    }
  });
});

test.describe('表示の崩れ', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'mobile の幅で見る');
  });
  test('§9.2 直近の実行結果がカードに出て、390px で横スクロールが出ない', async ({ adminPage }) => {
    await adminPage.goto('/admin');
    await expect(adminPage.getByText(/最終実行:/)).toBeVisible();
    expect(await hasHorizontalScroll(adminPage)).toBe(false);
  });
});
