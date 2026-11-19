// 提案するページ（/propose）の確認項目。ページ 提案する 仕様書 v1.0（§2〜§9）、管理 審査ワークフロー仕様書 §4.2。
// 掲載チャンネル・チャンネル・再生リストは Admin SDK で直接作る（YouTube に無い ID。名前は [E2E] で始まる）。終了時に自分で消す。
// 掲載チャンネルの名前検索はサーバーで1分キャッシュするので、検索のテストは最大90秒待つ。
// データを書き換えるテストは desktop だけで行う（desktop・mobile が同じ会員で同じ再生リストを奪い合わないように）。
import { captureIdToken, expect, hasHorizontalScroll, test } from './support/fixtures';
import { TEST_USER_EMAILS, uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

type Seeded = { channelId: string; channelTitle: string; explorationId: string; playlists: Record<string, { id: string; title: string }> };

async function seedPlaylist(channelId: string, channelName: string, listingStatus: string, listingSetBy: 'auto' | 'admin', listingReason: string) {
  const id = randomId('PLE2E');
  const title = uniqueText(`提案の再生リスト ${listingStatus}`);
  await e2eDb().collection('playlists').doc(id).set({
    title, thumbnailUrl: '', channelId, channelName, channelIconUrl: '',
    gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: 12, youtubeItemCount: 12, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: '', lastFetchedAt: new Date(), playlistPublishedAt: new Date(),
    listingStatus, listingReason, listingSetBy, listingSetAt: new Date(),
    previousListingStatus: null, source: 'channel_sweep', explorationChannelId: null,
  });
  return { id, title };
}

/** 掲載中のチャンネル1つと、状態ごとの再生リストを作る */
async function seedChannelWithPlaylists(): Promise<Seeded> {
  const channelId = randomId('UCE2E');
  const channelTitle = uniqueText('提案のチャンネル');
  await e2eDb().collection('channels').doc(channelId).set({
    youtubeChannelId: channelId, name: channelTitle, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
    playlistCount: 0, registeredAt: new Date(), lastFetchedAt: null,
  });
  const ex = await e2eDb().collection('exploration_channels').add({
    name: channelTitle, status: 'active', youtubeChannelId: channelId, channelTitle, channelIconUrl: '',
    subscriberCount: null, searchCandidates: [], tagIds: [], publishMode: 'confirm', authorizedVia: 'admin',
    lastExploredAt: null, lastFoundCount: null, createdAt: new Date(), createdBy: 'e2e', updatedAt: new Date(),
  });
  const playlists = {
    listed: await seedPlaylist(channelId, channelTitle, 'listed', 'admin', 'admin'),
    unconfirmed: await seedPlaylist(channelId, channelTitle, 'unconfirmed', 'auto', 'confirm'),
    nonGame: await seedPlaylist(channelId, channelTitle, 'non_game', 'auto', 'word:実写'),
    hidden: await seedPlaylist(channelId, channelTitle, 'excluded', 'admin', 'admin'),
    off: await seedPlaylist(channelId, channelTitle, 'channel_off', 'auto', 'channel_off'),
  };
  return { channelId, channelTitle, explorationId: ex.id, playlists };
}

async function cleanup(seed: Seeded) {
  const ids = Object.values(seed.playlists).map((p) => p.id);
  const wfs = await e2eDb().collection('workflows').where('type', '==', 'playlist_register').where('proposalData.channelId', '==', seed.channelId).get();
  await Promise.all(wfs.docs.map((d) => d.ref.delete()));
  for (const id of ids) {
    const videos = await e2eDb().collection('playlists').doc(id).collection('videos').get();
    await Promise.all(videos.docs.map((v) => v.ref.delete()));
    await e2eDb().collection('playlists').doc(id).delete();
  }
  await e2eDb().collection('exploration_channels').doc(seed.explorationId).delete();
  await e2eDb().collection('channels').doc(seed.channelId).delete();
}

test('§2 旧URLは /propose へ転送し、クエリを引き継ぐ。未ログインはログインへ送る', async ({ userPage, guestPage }) => {
  await userPage.goto('/playlists/new?gameId=e2e-none');
  await expect(userPage).toHaveURL(/\/propose\?gameId=e2e-none$/);
  await expect(userPage.getByRole('heading', { name: '提案する', exact: true })).toBeVisible();
  await expect(userPage.getByRole('tab', { name: '再生リスト' })).toHaveAttribute('aria-selected', 'true');

  await userPage.goto('/channels/apply?channel=UCzzzzzzzzzzzzzzzzzzzzzz');
  // 転送先のクエリの並びは決まっていないので、パスとクエリを分けて確かめる
  await expect(userPage).toHaveURL((url) => url.pathname === '/propose' && url.searchParams.get('type') === 'channel' && url.searchParams.get('channel') === 'UCzzzzzzzzzzzzzzzzzzzzzz');
  await expect(userPage.getByRole('tab', { name: 'チャンネル' })).toHaveAttribute('aria-selected', 'true');
  await expect(userPage.getByLabel('推薦・申請するチャンネル')).toHaveValue('UCzzzzzzzzzzzzzzzzzzzzzz');

  await guestPage.goto('/propose?gameId=abc');
  await expect(guestPage).toHaveURL(/\/login\?next=%2Fpropose%3FgameId%3Dabc/);
});

test('§3 タブで切り替えると type がアドレスに残り、入力した内容は側ごとに残る', async ({ userPage }) => {
  await userPage.goto('/propose');
  expect(await hasHorizontalScroll(userPage)).toBe(false);
  await userPage.getByLabel('どのチャンネルの再生リストですか').fill('[E2E] 残る文字');
  await userPage.getByRole('tab', { name: 'チャンネル' }).click();
  await expect(userPage).toHaveURL(/\/propose\?type=channel$/);
  await userPage.getByLabel('推薦・申請するチャンネル').fill('https://www.youtube.com/@E2E');
  await userPage.getByRole('tab', { name: '再生リスト' }).click();
  await expect(userPage).toHaveURL(/\/propose$/);
  await expect(userPage.getByLabel('どのチャンネルの再生リストですか')).toHaveValue('[E2E] 残る文字');
  await userPage.getByRole('tab', { name: 'チャンネル' }).click();
  await expect(userPage.getByLabel('推薦・申請するチャンネル')).toHaveValue('https://www.youtube.com/@E2E');
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});

test('§7 チャンネルが見つからないときは「チャンネルを推薦する」でチャンネル側へ移る', async ({ userPage }) => {
  await userPage.goto('/propose');
  await userPage.getByRole('button', { name: 'チャンネルを推薦する' }).click();
  await expect(userPage.getByRole('tab', { name: 'チャンネル' })).toHaveAttribute('aria-selected', 'true');
  await expect(userPage.getByLabel('推薦・申請するチャンネル')).toHaveValue('');
});

test('§8 URLのコピーのしかたは折りたたみで、スマホ／パソコンを切り替えられる', async ({ userPage }) => {
  await userPage.goto('/propose?type=channel');
  const guide = userPage.getByTestId('url-copy-guide').filter({ visible: true });
  const toggle = guide.getByRole('button', { name: 'URLのコピーのしかた' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(guide.getByRole('button', { name: 'スマホ' })).toHaveAttribute('aria-pressed', 'true');
  await expect(guide).toContainText('「共有」');
  await guide.getByRole('button', { name: 'パソコン' }).click();
  await expect(guide).toContainText('ブラウザのアドレス欄');
  expect(await hasHorizontalScroll(userPage)).toBe(false);
});

test('§6.1 動画のURLでも、投稿したチャンネルとして確認できる', async ({ userPage }) => {
  await userPage.goto('/propose?type=channel');
  const field = userPage.getByLabel('推薦・申請するチャンネル');
  // Google for Developers の動画
  await field.fill('https://www.youtube.com/watch?v=vLAegkGGWrM');
  await field.blur();
  await expect(userPage.getByRole('link', { name: 'YouTubeで開く' })).toHaveAttribute('href', /UC_x5XG1OV2P6uZZ5FSM9Ttw/);
});

test('§4・§5 チャンネル詳細から: チャンネル固定・タブなし、状態ごとの一覧、提案の送信、§6.2 掲載中のチャンネルからの移動', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'データを書き換えるため desktop のみ');
  test.setTimeout(180_000);
  const seed = await seedChannelWithPlaylists();
  try {
    await test.step('チャンネル詳細の「再生リストを追加する」はチャンネル固定で開く', async () => {
      await userPage.goto(`/channels/${seed.channelId}`);
      const link = userPage.locator(`main a[href="/propose?channelId=${seed.channelId}"]`).filter({ visible: true }).first();
      await expect(link).toBeVisible({ timeout: 30_000 });
    });

    await userPage.goto(`/propose?channelId=${seed.channelId}`);
    await expect(userPage.getByRole('tablist')).toHaveCount(0);
    await expect(userPage.getByTestId('propose-channel-selected')).toContainText(seed.channelTitle);
    await expect(userPage.getByRole('button', { name: 'チャンネルを変える' })).toHaveCount(0);

    await test.step('一覧: 未確認は選べる、公開中は詳細へ、対象外は折りたたみ、運営が外したもの・channel_off は出ない', async () => {
      const list = userPage.getByTestId('propose-playlist-list');
      await expect(list.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.unconfirmed.title })).toBeVisible();
      await expect(list).toContainText(seed.playlists.listed.title);
      await expect(list.locator(`a[href="/playlists/${seed.playlists.listed.id}"]`)).toBeVisible();
      await expect(list).not.toContainText(seed.playlists.hidden.title);
      await expect(list).not.toContainText(seed.playlists.off.title);
      await expect(list.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.nonGame.title })).toHaveCount(0);
      await list.getByTestId('propose-out-of-scope-toggle').click();
      await expect(list.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.nonGame.title })).toBeVisible();
      expect(await hasHorizontalScroll(userPage)).toBe(false);
    });

    await test.step('対象外を選ぶと理由欄が出る。選び直すと一覧に戻る', async () => {
      await userPage.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.nonGame.title }).click();
      await expect(userPage.getByTestId('propose-playlist-selected')).toContainText(seed.playlists.nonGame.title);
      await expect(userPage.getByLabel(/^公開してほしい理由/)).toBeVisible();
      await userPage.getByRole('button', { name: '選び直す' }).click();
      await expect(userPage.getByTestId('propose-playlist-list')).toBeVisible();
    });

    await test.step('未確認を選び、ゲームは空欄のまま提案できる（noGame）', async () => {
      await userPage.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.unconfirmed.title }).click();
      await expect(userPage.getByText('ゲームが分からない場合は空欄のままで大丈夫です')).toBeVisible();
      await expect(userPage.getByLabel(/^公開してほしい理由/)).toHaveCount(0);
      await userPage.getByRole('button', { name: '提案する', exact: true }).click();
      await expect(userPage.getByRole('heading', { name: '提案を送りました（確認待ち）' })).toBeVisible();
      const wf = await e2eDb().collection('workflows').where('type', '==', 'playlist_register').where('proposalData.channelId', '==', seed.channelId).get();
      expect(wf.docs).toHaveLength(1);
      expect(wf.docs[0].data().proposalData).toMatchObject({
        youtubePlaylistId: seed.playlists.unconfirmed.id, noGame: true, existingListingStatus: 'unconfirmed', gameId: null,
      });
    });

    await test.step('提案済みの再生リストは「提案済み（確認待ち）」で選べない', async () => {
      await userPage.getByRole('button', { name: '続けて提案する' }).click();
      const row = userPage.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.unconfirmed.title });
      await expect(row).toContainText('あなたが提案済み（確認待ち）');
      await expect(row).toBeDisabled();
    });

    await test.step('運営が外した再生リストは API でも提案できない', async () => {
      const token = await captureIdToken(userPage, '/playlists/proposals');
      const res = await userPage.request.post('/api/playlists/propose', {
        headers: { Authorization: `Bearer ${token}` },
        data: { playlistId: seed.playlists.hidden.id },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error).toBe('hidden_by_admin');
    });

    await test.step('§6.2 チャンネル側で掲載中のチャンネルを入れると、再生リスト側へ移れる', async () => {
      await userPage.goto(`/propose?type=channel&channel=${seed.channelId}`);
      const listed = userPage.getByTestId('channel-already-listed');
      // 確認 API は YouTube からチャンネルを取るため、YouTube に無いテスト用 ID は「見つからない」になる。
      // その場合はこの手順を飛ばす（実在チャンネルでの確認は channel-application.spec.ts の §4）
      const found = await listed.waitFor({ timeout: 15_000 }).then(() => true, () => false);
      if (found) {
        await listed.getByRole('button', { name: 'このチャンネルの再生リストを提案する' }).click();
        await expect(userPage.getByRole('tab', { name: '再生リスト' })).toHaveAttribute('aria-selected', 'true');
        await expect(userPage.getByTestId('propose-channel-selected')).toContainText(seed.channelTitle);
      }
    });
  } finally {
    await cleanup(seed);
  }
});

test('§5.1 掲載中のチャンネルを名前で探して選べる', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'データを書き換えるため desktop のみ');
  test.setTimeout(150_000);
  const seed = await seedChannelWithPlaylists();
  try {
    await userPage.goto('/propose');
    const field = userPage.getByLabel('どのチャンネルの再生リストですか');
    const results = userPage.getByTestId('propose-channel-results');
    // 掲載チャンネルの一覧はサーバーで1分キャッシュする。キャッシュが切れて出てくるまで打ち直す
    await expect(async () => {
      await field.fill('');
      await field.fill(seed.channelTitle);
      await expect(results.getByRole('button', { name: seed.channelTitle })).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 90_000, intervals: [5_000] });
    await results.getByRole('button', { name: seed.channelTitle }).click();
    await expect(userPage.getByTestId('propose-channel-selected')).toContainText(seed.channelTitle);
    await expect(userPage.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.unconfirmed.title })).toBeVisible();
    await userPage.getByTestId('propose-switch-url').click();
    await expect(userPage.getByLabel('再生リストURL')).toBeVisible();
  } finally {
    await cleanup(seed);
  }
});

test('§9 管理者: 見出しは「追加する」、運営が外したものも一覧に出て、その場で公開できる', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'データを書き換えるため desktop のみ');
  test.setTimeout(120_000);
  const seed = await seedChannelWithPlaylists();
  try {
    await adminPage.goto(`/propose?channelId=${seed.channelId}`);
    await expect(adminPage.getByRole('heading', { name: '追加する', exact: true })).toBeVisible();
    const hiddenRow = adminPage.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.hidden.title });
    await adminPage.getByTestId('propose-out-of-scope-toggle').click();
    await expect(hiddenRow).toContainText('運営が非表示');

    await adminPage.getByTestId('propose-playlist-row').filter({ hasText: seed.playlists.unconfirmed.title }).click();
    await adminPage.getByRole('button', { name: '公開する', exact: true }).click();
    await expect(adminPage.getByRole('heading', { name: '公開しました' })).toBeVisible({ timeout: 30_000 });
    const after = (await e2eDb().collection('playlists').doc(seed.playlists.unconfirmed.id).get()).data()!;
    expect(after).toMatchObject({ listingStatus: 'listed', listingSetBy: 'admin' });
    await expect(adminPage.getByRole('link', { name: '再生リストを見る' })).toHaveAttribute('href', `/playlists/${seed.playlists.unconfirmed.id}`);
  } finally {
    await cleanup(seed);
  }
});

test('審査 §4.2 すでにある再生リストの提案を承認すると公開され、ゲーム未設定でも承認できる', async ({ userPage, adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'データを書き換えるため desktop のみ');
  test.setTimeout(150_000);
  const seed = await seedChannelWithPlaylists();
  try {
    const token = await captureIdToken(userPage, '/playlists/proposals');
    const res = await userPage.request.post('/api/playlists/propose', {
      headers: { Authorization: `Bearer ${token}` },
      data: { playlistId: seed.playlists.nonGame.id, reason: '[E2E] ゲーム実況です' },
    });
    expect(res.status()).toBe(200);
    const wf = (await e2eDb().collection('workflows').where('type', '==', 'playlist_register').where('proposalData.channelId', '==', seed.channelId).get()).docs[0];
    expect(wf.data().proposalData).toMatchObject({ proposeReason: '[E2E] ゲーム実況です', existingListingStatus: 'non_game', noGame: true });

    await adminPage.goto(`/admin/workflows/${wf.id}`);
    const box = adminPage.getByTestId('proposal-existing-playlist');
    await expect(box).toContainText('[E2E] ゲーム実況です');
    await adminPage.getByRole('button', { name: '承認する' }).first().click();
    await adminPage.getByRole('dialog').getByRole('button', { name: '承認する' }).click();
    await expect
      .poll(async () => (await e2eDb().collection('playlists').doc(seed.playlists.nonGame.id).get()).data()?.listingStatus, { timeout: 30_000 })
      .toBe('listed');
    const uid = (await e2eDb().collection('users').where('email', '==', TEST_USER_EMAILS.user).limit(1).get()).docs[0].id;
    expect((await e2eDb().collection('playlists').doc(seed.playlists.nonGame.id).get()).data()?.proposedBy).toBe(uid);
  } finally {
    const wfs = await e2eDb().collection('workflows').where('type', '==', 'playlist_register').where('proposalData.channelId', '==', seed.channelId).get();
    for (const wf of wfs.docs) {
      const notes = await e2eDb().collection('notifications').where('workflowId', '==', wf.id).get();
      await Promise.all(notes.docs.map((n) => n.ref.delete()));
    }
    await cleanup(seed);
  }
});
