// 一般ユーザーのゲーム登録（再生リスト詳細仕様書 v1.15 §関連ゲーム、収集候補レビューUI仕様書 v3.2 §6.5）の確認項目。
// ゲーム未設定の再生リスト（gameId=null）とゲームは Admin SDK で直接作り、終了時に自分で消す（[E2E] で始まる名前）。
import { captureIdToken, expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

async function seedPlaylist(extra: Record<string, unknown> = {}) {
  const id = randomId('PLE2E');
  const title = uniqueText('ゲーム登録の再生リスト');
  await e2eDb().collection('playlists').doc(id).set({
    title, thumbnailUrl: '', channelId: 'UCE2E', channelName: uniqueText('チャンネル'), channelIconUrl: '',
    gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: 0, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, listingStatus: 'listed', score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: '', lastFetchedAt: null, ...extra,
  });
  return { id, title };
}

async function seedGame(title: string) {
  const ref = e2eDb().collection('games').doc();
  await ref.set({
    title, aliases: [], packageImageUrl: null, rakutenUrl: null, description: '', isAiGeneratedDescription: false, platforms: [],
    genreId: null, genreName: null, themeIds: [], gameTagIds: [], gameTagsFixed: [], playlistCount: 0, createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}

async function cleanup(playlistId: string, gameId: string) {
  const changes = await e2eDb().collection('playlist_game_changes').where('playlistId', '==', playlistId).get();
  await Promise.all([...changes.docs.map((d) => d.ref.delete()), e2eDb().collection('playlists').doc(playlistId).delete(), e2eDb().collection('games').doc(gameId).delete()]);
}

test('ゲーム未設定の案内は、未ログインではログインの案内だけを出す', async ({ guestPage }) => {
  const { id } = await seedPlaylist();
  try {
    await guestPage.goto(`/playlists/${id}`);
    const card = guestPage.getByTestId('game-register-card');
    await expect(card).toContainText('ゲームが未設定です');
    await expect(card).toContainText('ログインしてください');
    await expect(card.getByRole('button', { name: 'ゲームを登録' })).toHaveCount(0);
  } finally {
    await e2eDb().collection('playlists').doc(id).delete();
  }
});

test('ログイン中はゲームを選んで登録でき（審査なし）、案内が消えて履歴が残る。管理者は戻せる', async ({ userPage, adminPage }) => {
  const gameTitle = uniqueText('登録するゲーム');
  const gameId = await seedGame(gameTitle);
  const { id, title } = await seedPlaylist();
  try {
    await userPage.goto(`/playlists/${id}`);
    const card = userPage.getByTestId('game-register-card');
    await card.getByRole('button', { name: 'ゲームを登録' }).click();
    await userPage.getByRole('dialog').getByText(gameTitle).click();
    await expect(userPage.getByText(`「${gameTitle}」を登録しました`).first()).toBeVisible({ timeout: 30_000 });
    await expect(card).toHaveCount(0);

    const playlist = (await e2eDb().collection('playlists').doc(id).get()).data()!;
    expect(playlist.gameId).toBe(gameId);
    expect(playlist.gameName).toBe(gameTitle);
    expect(playlist.gameSetBy).toBe('user');
    expect((await e2eDb().collection('games').doc(gameId).get()).data()!.playlistCount).toBe(1);
    const changes = await e2eDb().collection('playlist_game_changes').where('playlistId', '==', id).get();
    expect(changes.docs[0].data()).toMatchObject({ from: null, to: gameId, by: 'user' });

    // 管理画面の「ユーザーが登録したゲーム」に出て、戻すとゲーム未設定に戻り、そのゲームは選べなくなる
    await adminPage.goto('/admin/collection/unset');
    const item = adminPage.getByRole('listitem').filter({ hasText: title });
    await expect(item).toContainText(gameTitle);
    adminPage.once('dialog', (dialog) => dialog.accept());
    await item.getByRole('button', { name: /戻す/ }).click();
    await expect(adminPage.getByText('ゲーム未設定に戻しました').first()).toBeVisible();
    const reverted = (await e2eDb().collection('playlists').doc(id).get()).data()!;
    expect(reverted.gameId).toBeNull();
    expect(reverted.rejectedGameIds).toEqual([gameId]);
    expect((await e2eDb().collection('games').doc(gameId).get()).data()!.playlistCount).toBe(0);

    await userPage.reload();
    await userPage.getByTestId('game-register-card').getByRole('button', { name: 'ゲームを登録' }).click();
    await userPage.getByRole('dialog').getByText(gameTitle).click();
    await expect(userPage.getByText('運営が外したため選べません').first()).toBeVisible({ timeout: 30_000 });
    expect((await e2eDb().collection('playlists').doc(id).get()).data()!.gameId).toBeNull();
  } finally {
    await cleanup(id, gameId);
  }
});

test('すでにゲームが付いている再生リストには、一般ユーザーは登録できない（409）', async ({ userPage }) => {
  const gameId = await seedGame(uniqueText('先に付いたゲーム'));
  const other = await seedGame(uniqueText('別のゲーム'));
  const { id } = await seedPlaylist({ gameId, gameName: 'x', gameSetBy: 'admin' });
  try {
    const token = await captureIdToken(userPage, '/contact/history');
    const res = await userPage.request.post(`/api/playlists/${id}/game`, { headers: { Authorization: `Bearer ${token}` }, data: { gameId: other } });
    const status = res.status();
    expect(status).toBe(409);
    expect((await e2eDb().collection('playlists').doc(id).get()).data()!.gameId).toBe(gameId);
  } finally {
    await cleanup(id, gameId);
    await e2eDb().collection('games').doc(other).delete();
  }
});

test('1日20件の上限に達したユーザーは登録できない（429）', async ({ userPage }) => {
  const gameId = await seedGame(uniqueText('上限のゲーム'));
  const { id } = await seedPlaylist();
  const token = await captureIdToken(userPage, '/contact/history');
  const uid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).user_id as string;
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const counterRef = e2eDb().collection('game_link_counters').doc(`${uid}_${today}`);
  const before = await counterRef.get();
  await counterRef.set({ userId: uid, date: today, count: 20, updatedAt: new Date() });
  try {
    const res = await userPage.request.post(`/api/playlists/${id}/game`, { headers: { Authorization: `Bearer ${token}` }, data: { gameId } });
    expect(res.status()).toBe(429);
    expect((await e2eDb().collection('playlists').doc(id).get()).data()!.gameId).toBeNull();
  } finally {
    if (before.exists) await counterRef.set(before.data()!);
    else await counterRef.delete();
    await cleanup(id, gameId);
  }
});

test('不正な入力（JSON が null・予約形式のID）は 400', async ({ userPage }) => {
  const token = await captureIdToken(userPage, '/contact/history');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  expect((await userPage.request.post('/api/playlists/abc/game', { headers, data: 'null' })).status()).toBe(400);
  expect((await userPage.request.post('/api/playlists/abc/game', { headers, data: { gameId: '__x__' } })).status()).toBe(400);
});

async function cleanupProposals(playlistId: string) {
  const ws = await e2eDb().collection('workflows').where('type', '==', 'game_title_register').where('proposalData.playlistId', '==', playlistId).get();
  for (const w of ws.docs) {
    const ns = await e2eDb().collection('notifications').where('workflowId', '==', w.id).get();
    await Promise.all(ns.docs.map((n) => n.ref.delete()));
    await w.ref.delete();
  }
}

test('既存に無いゲームは新しいゲームタイトルとして提案でき、運営が既存のゲームに付けて承認すると再生リストに付き通知が届く', async ({ userPage, adminPage }) => {
  const proposedTitle = uniqueText('提案するゲーム');
  const existingTitle = uniqueText('既存のゲーム');
  const gameId = await seedGame(existingTitle);
  const { id, title } = await seedPlaylist();
  try {
    await userPage.goto(`/playlists/${id}`);
    await userPage.getByTestId('game-register-card').getByRole('button', { name: 'ゲームを登録' }).click();
    await userPage.getByRole('dialog').getByRole('button', { name: /新しいゲームタイトルとして入力する/ }).click();
    const dialog = userPage.getByRole('dialog', { name: '新しいゲームタイトルを提案' });
    await dialog.getByLabel('ゲームタイトル名').fill(proposedTitle);
    await dialog.getByRole('button', { name: '提案する' }).click();
    await expect(userPage.getByText('ゲームタイトルを提案しました').first()).toBeVisible({ timeout: 30_000 });

    const ws = await e2eDb().collection('workflows').where('type', '==', 'game_title_register').where('proposalData.playlistId', '==', id).get();
    expect(ws.size).toBe(1);
    expect(ws.docs[0].data().status).toBe('reviewing_lv1');
    expect(ws.docs[0].data().proposalData.gameTitle).toBe(proposedTitle);

    // 同じ再生リストに審査中の提案があるときは、もう1件は出せない（409）
    const token = await captureIdToken(userPage, '/contact/history');
    const again = await userPage.request.post(`/api/playlists/${id}/game-proposal`, { headers: { Authorization: `Bearer ${token}` }, data: { gameTitle: uniqueText('別の提案') } });
    expect(again.status()).toBe(409);

    // 運営: 既存のゲームに付けて承認する
    await adminPage.goto(`/admin/workflows/${ws.docs[0].id}`);
    await expect(adminPage.getByText(title)).toBeVisible();
    await adminPage.getByRole('button', { name: '既存のゲームに付けて承認' }).click();
    await adminPage.getByRole('dialog').getByText(existingTitle).click();
    await expect(adminPage.getByText('ゲームタイトルを登録し、提案を承認しました').first()).toBeVisible({ timeout: 30_000 });

    const playlist = (await e2eDb().collection('playlists').doc(id).get()).data()!;
    expect(playlist.gameId).toBe(gameId);
    expect(playlist.gameSetBy).toBe('admin');
    expect((await e2eDb().collection('workflows').doc(ws.docs[0].id).get()).data()!.status).toBe('approved');
    const notes = await e2eDb().collection('notifications').where('workflowId', '==', ws.docs[0].id).get();
    expect(notes.size).toBe(1);
    expect(notes.docs[0].data()).toMatchObject({ type: 'review_result', playlistId: id });
  } finally {
    await cleanupProposals(id);
    await cleanup(id, gameId);
  }
});

test('同名のゲームがある提案は 409（一覧から選んでもらう）。入力が不正なら 400', async ({ userPage }) => {
  const existingTitle = uniqueText('同名のゲーム');
  const gameId = await seedGame(existingTitle);
  const { id } = await seedPlaylist();
  try {
    const token = await captureIdToken(userPage, '/contact/history');
    const headers = { Authorization: `Bearer ${token}` };
    expect((await userPage.request.post(`/api/playlists/${id}/game-proposal`, { headers, data: { gameTitle: existingTitle } })).status()).toBe(409);
    expect((await userPage.request.post(`/api/playlists/${id}/game-proposal`, { headers, data: { gameTitle: '   ' } })).status()).toBe(400);
    expect((await userPage.request.post(`/api/playlists/${id}/game-proposal`, { headers, data: { gameTitle: 'あ'.repeat(101) } })).status()).toBe(400);
  } finally {
    await cleanupProposals(id);
    await cleanup(id, gameId);
  }
});
