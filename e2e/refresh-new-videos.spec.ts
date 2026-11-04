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
import { randomId } from './support/collection';

test.describe.configure({ mode: 'serial' });

async function runRefresh(page: Page) {
  await page.goto('/admin');
  await expect(page.getByText(/最終実行:|実行履歴はまだありません/)).toBeVisible();
  const response = page.waitForResponse((r) => r.url().includes('/api/admin/refresh-new-videos'), { timeout: 120_000 });
  await page.getByRole('button', { name: '新着動画を再取得' }).click();
  const res = await response;
  expect(res.status()).toBe(200);
  await expect(page.getByText(/^完了しました/)).toBeVisible();
  const body = await res.json();
  // 画面の「直近の実行」がこの回の結果に置き換わるのを待つ
  await expect(page.getByTestId('refresh-last-batch')).toContainText(
    `公開 ${body.playlistsChecked} 件を確認、動画数が変わった ${body.playlistsRefetched} 件を取り直し、新着 ${body.totalNewVideos} 本`,
  );
  return body;
}

async function latestBatchLog(): Promise<DocumentData> {
  const snap = await e2eDb().collection('batch_logs').orderBy('executedAt', 'desc').limit(1).get();
  return snap.docs[0].data();
}

/** マイリスト登録が無く（通知を作らない）、動画が2本以上ある公開再生リスト */
async function pickRealPlaylist(): Promise<QueryDocumentSnapshot> {
  const snap = await e2eDb().collection('playlists').where('isPublic', '==', true).get();
  for (const d of snap.docs) {
    // 巡回で作っただけの再生リスト（動画一覧が未取得）は除く
    if (d.id.startsWith('PLE2E') || (d.data().videoCount ?? 0) < 2 || d.data().youtubeItemCount == null) continue;
    const own = await e2eDb().collection('videos').where('playlistId', '==', d.id).limit(2).get();
    if (own.size < 2) continue;
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
    // YouTube の再生リストから外れていない見込みが高い、いちばん新しい動画を消す
    const videos = await e2eDb().collection('videos').where('playlistId', '==', playlist.id).get();
    const removed = videos.docs.reduce((a, b) =>
      (b.data().publishedAt?.toMillis?.() ?? 0) > (a.data().publishedAt?.toMillis?.() ?? 0) ? b : a,
    );
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
      expect(after.youtubeItemCount).not.toBe(-1);
      expect(typeof after.youtubeItemCount).toBe('number');

      // 取り直したのは記録をずらした再生リスト（と、その間に YouTube で動画が増えたもの）だけ
      const log = await latestBatchLog();
      expect(log.refetchedCount).toBe(body.playlistsRefetched);
      expect(body.playlistsRefetched).toBeGreaterThanOrEqual(1);
      expect(body.playlistsRefetched).toBeLessThanOrEqual(3);
    } finally {
      if (!(await removed.ref.get()).exists) await removed.ref.set(removedData);
      const current = (await playlist.ref.get()).data()!;
      if (current.youtubeItemCount === -1) await playlist.ref.update({ youtubeItemCount: before.youtubeItemCount ?? null });
    }
  });

  test('§7.1・§7.4 動画数が変わっていなければ取り直さず、消費は確認の分（50件ごとに1）だけ', async ({ adminPage }) => {
    test.setTimeout(240_000);
    // 前のテストの影響を消して記録を揃える。実行の合間に実在のシリーズへ投稿があると取り直しが起きるので、
    // 取り直し・エラーの無い回が出るまで最大3回まわす
    let body = await runRefresh(adminPage);
    for (let i = 0; i < 3 && (i === 0 || body.playlistsRefetched > 0 || body.errors.length > 0); i++) {
      body = await runRefresh(adminPage);
    }
    expect(body.errors).toEqual([]);
    expect(body.playlistsRefetched).toBe(0);
    // 全件を取り直していた頃（約1.5ユニット/件）よりずっと安い。巡回（掲載チャンネル）の分と、30日の取り直しの分が加わるため、
    // 確認の分（50件ごとに1）より多くなりうる
    expect(body.quotaConsumed).toBeLessThan(body.playlistsChecked);
    await expect(adminPage.getByTestId('refresh-last-batch')).toContainText(
      `公開 ${body.playlistsChecked} 件を確認、動画数が変わった 0 件を取り直し、新着 0 本`,
    );
    await expect(adminPage.getByTestId('refresh-last-batch')).toContainText('新着はありません');
  });

  test('§8.4・§10.11 動画一覧を取ってから25日を過ぎた再生リストは、動画数が同じでも全件を取り直す（30日ルール）', async ({ adminPage }) => {
    test.setTimeout(300_000);
    const playlist = await pickRealPlaylist();
    // 記録を揃えてから、取り直しの期限（25日）を過ぎた状態にする
    await runRefresh(adminPage);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await playlist.ref.update({ fullRefetchedAt: sixtyDaysAgo });
    const body = await runRefresh(adminPage);
    expect(body.fullRefetchedCount).toBeGreaterThanOrEqual(1);
    const after = (await playlist.ref.get()).data()!;
    expect(after.fullRefetchedAt.toMillis()).toBeGreaterThan(Date.now() - 60 * 60 * 1000);
    expect((await latestBatchLog()).fullRefetchedCount).toBe(body.fullRefetchedCount);
  });

  test('§10.8・§10.11 チャンネル対象外で記録のない再生リストは30日で消し、掲載停止で記録のあるものは YouTube 由来の項目だけ消す', async ({ adminPage }) => {
    test.setTimeout(240_000);
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    const base = (id: string, title: string, extra: Record<string, unknown>) => ({
      youtubePlaylistId: id, title, thumbnailUrl: 'https://example.invalid/t.jpg', channelId: 'UCE2E', channelName: '[E2E] チャンネル', channelIconUrl: '',
      gameId: null, gameName: '', gameGenreIds: [], videoCount: 3, youtubeItemCount: null, latestVideoPublishedAt: null,
      registeredAt: old, registeredBy: 'system', proposedBy: null, isPublic: true, score: null, reviewCount: 0, mylistCount: 0,
      playlistTagIds: [], playlistTagsFixed: [], referenceUrl: '', lastFetchedAt: null, listingSetBy: 'admin', listingSetAt: old,
      previousListingStatus: 'listed', source: 'channel_sweep', explorationChannelId: null, ...extra,
    });
    const ids = { stale: randomId('PLE2E'), optOut: randomId('PLE2E'), fresh: randomId('PLE2E') };
    const titles = { stale: uniqueText('消える再生リスト'), optOut: uniqueText('掲載停止の再生リスト'), fresh: uniqueText('まだ新しい再生リスト') };
    const col = e2eDb().collection('playlists');
    const historyRef = e2eDb().collection('watch_history').doc(randomId('e2e-history-'));
    await col.doc(ids.stale).set(base(ids.stale, titles.stale, { listingStatus: 'channel_off', listingReason: 'channel_excluded', metaFetchedAt: old }));
    await col.doc(ids.optOut).set(base(ids.optOut, titles.optOut, { listingStatus: 'channel_off', listingReason: 'opt_out', metaFetchedAt: old }));
    await col.doc(ids.fresh).set(base(ids.fresh, titles.fresh, { listingStatus: 'channel_off', listingReason: 'channel_excluded', metaFetchedAt: new Date() }));
    for (const id of [ids.stale, ids.optOut]) {
      await e2eDb().collection('videos').doc(`${id}_v1`).set({ youtubeVideoId: 'v1', playlistId: id, position: 0, title: 'v', thumbnailUrl: '', durationSeconds: 10, publishedAt: old, playStartCount: 0 });
    }
    await historyRef.set({ userId: 'e2e', playlistId: ids.optOut, watchedAt: old });
    try {
      const body = await runRefresh(adminPage);
      expect(body.purgedCount).toBeGreaterThanOrEqual(2);
      // 記録なし: playlists・videos ごと消える
      expect((await col.doc(ids.stale).get()).exists).toBe(false);
      expect((await e2eDb().collection('videos').doc(`${ids.stale}_v1`).get()).exists).toBe(false);
      // 掲載停止で記録あり: YouTube 由来の項目だけ空にして、プレミテの記録は残す
      const stripped = (await col.doc(ids.optOut).get()).data()!;
      expect(stripped.title).toBe('掲載を終了した再生リスト');
      expect(stripped.thumbnailUrl).toBe('');
      expect(stripped.youtubeDataRemovedAt).toBeTruthy();
      expect((await e2eDb().collection('videos').doc(`${ids.optOut}_v1`).get()).exists).toBe(false);
      expect((await historyRef.get()).exists).toBe(true);
      // 30日に達していないものは触らない
      expect((await col.doc(ids.fresh).get()).data()!.title).toBe(titles.fresh);
    } finally {
      await Promise.all([...Object.values(ids).map((id) => col.doc(id).delete()), historyRef.delete(), ...[ids.stale, ids.optOut].map((id) => e2eDb().collection('videos').doc(`${id}_v1`).delete())]);
    }
  });

  test('§10.11 「自動で掲載」のチャンネルの掲載予定（auto_pending）は、動画一覧が取得済みなら毎日の再取得で掲載になる', async ({ adminPage }) => {
    test.setTimeout(240_000);
    const channelRef = e2eDb().collection('exploration_channels').doc();
    const channelTitle = uniqueText('チャンネル');
    const youtubeChannelId = randomId('UCE2E');
    await channelRef.set({
      name: channelTitle, status: 'active', youtubeChannelId, channelTitle, channelIconUrl: '', subscriberCount: null, searchCandidates: [], tagIds: [],
      publishMode: 'auto', authorizedVia: 'admin', createdAt: new Date(), createdBy: 'e2e', updatedAt: new Date(),
    });
    const gameRef = e2eDb().collection('games').doc();
    await gameRef.set({ title: uniqueText('ゲーム'), aliases: [], platforms: [], themeIds: [], genreId: null, genreName: null, playlistCount: 0, createdAt: new Date(), updatedAt: new Date() });
    const playlistId = randomId('PLE2E');
    const playlistRef = e2eDb().collection('playlists').doc(playlistId);
    await playlistRef.set({
      youtubePlaylistId: playlistId, title: uniqueText('自動掲載の再生リスト'), thumbnailUrl: '', channelId: youtubeChannelId, channelName: channelTitle, channelIconUrl: '',
      gameId: gameRef.id, gameName: 'E2Eゲーム', gameGenreIds: [], videoCount: 12, youtubeItemCount: 12, latestVideoPublishedAt: null,
      registeredAt: new Date(), registeredBy: 'system', proposedBy: null, isPublic: true, score: null, reviewCount: 0, mylistCount: 0,
      playlistTagIds: [], playlistTagsFixed: [], referenceUrl: '', lastFetchedAt: null, listingStatus: 'unconfirmed', listingReason: 'auto_pending',
      listingSetBy: 'auto', listingSetAt: new Date(), previousListingStatus: null, source: 'channel_sweep', explorationChannelId: channelRef.id, metaFetchedAt: new Date(),
    });
    try {
      const body = await runRefresh(adminPage);
      expect(body.autoListedCount).toBeGreaterThanOrEqual(1);
      const listed = (await playlistRef.get()).data()!;
      expect(listed.listingStatus).toBe('listed');
      expect(listed.listingReason).toBe('auto');
      expect(listed.listingSetBy).toBe('auto');
      expect((await gameRef.get()).data()!.playlistCount).toBe(1);
    } finally {
      await Promise.all([channelRef.delete(), gameRef.delete(), playlistRef.delete()]);
    }
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
