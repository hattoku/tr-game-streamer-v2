// 詳細ページからの変更の提案（ゲーム・チャンネル・再生リスト）の確認項目。
// ページ 詳細ページからの変更提案 仕様書 v1.0（§3〜§9）、管理 審査ワークフロー仕様書 §4.5。
// 対象（ゲーム・再生リスト・チャンネル・掲載チャンネル）は Admin SDK で直接作り（[E2E] で始まる名前、ID は PLE2E／UCE2E）、終わったら自分で消す。
// 提案を送るテストは、1人1日5件の上限を desktop と mobile で取り合わないよう desktop だけで行う（mobile はボタンとモーダルの表示だけ）。
import type { Page } from '@playwright/test';
import { captureIdToken, expect, test } from './support/fixtures';
import { TEST_USER_EMAILS, uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

const TOAST = '提案を受け付けました。結果は提案履歴でお知らせします';

async function uidOf(email: string): Promise<string> {
  const snap = await e2eDb().collection('users').where('email', '==', email).limit(1).get();
  if (snap.empty) throw new Error(`テスト用会員が見つかりません: ${email}`);
  return snap.docs[0].id;
}

async function seedGame(label: string) {
  const title = uniqueText(label);
  const ref = e2eDb().collection('games').doc();
  await ref.set({
    title, aliases: [], packageImageUrl: null, rakutenUrl: null, description: '', isAiGeneratedDescription: false, platforms: [],
    genreId: null, genreName: null, themeIds: [], gameTagIds: [], gameTagsFixed: [], playlistCount: 0, createdAt: new Date(), updatedAt: new Date(),
  });
  return { id: ref.id, title };
}

async function seedChannel(opts: { listed: boolean }) {
  const id = randomId('UCE2E');
  const name = uniqueText('提案のチャンネル');
  await e2eDb().collection('channels').doc(id).set({
    youtubeChannelId: id, name, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
    playlistCount: 1, registeredAt: new Date(), lastFetchedAt: null,
  });
  if (opts.listed) {
    await e2eDb().collection('exploration_channels').add({
      name, status: 'active', youtubeChannelId: id, channelTitle: name, channelIconUrl: '', subscriberCount: null, searchCandidates: [], tagIds: [],
      publishMode: 'confirm', authorizedVia: 'admin', lastExploredAt: null, lastFoundCount: null, createdAt: new Date(), createdBy: 'e2e', updatedAt: new Date(),
    });
  }
  return { id, name };
}

async function seedPlaylist(extra: Record<string, unknown> = {}) {
  const id = randomId('PLE2E');
  const title = uniqueText('提案の再生リスト');
  await e2eDb().collection('playlists').doc(id).set({
    title, thumbnailUrl: '', channelId: 'UCE2E', channelName: uniqueText('チャンネル'), channelIconUrl: '',
    gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: 0, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
    isPublic: true, listingStatus: 'listed', listingSetBy: 'auto', score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    referenceUrl: '', lastFetchedAt: null, ...extra,
  });
  return { id, title };
}

/** 対象への提案（workflows）と、その通知を消す */
async function deleteProposals(targetKey: string) {
  const snap = await e2eDb().collection('workflows').where('reportData.targetKey', '==', targetKey).get();
  for (const wf of snap.docs) {
    const notes = await e2eDb().collection('notifications').where('workflowId', '==', wf.id).get();
    await Promise.all(notes.docs.map((n) => n.ref.delete()));
    await wf.ref.delete();
  }
}

async function proposalsFor(targetKey: string) {
  return (await e2eDb().collection('workflows').where('reportData.targetKey', '==', targetKey).get()).docs;
}

async function deleteChannel(id: string) {
  const ex = await e2eDb().collection('exploration_channels').where('youtubeChannelId', '==', id).get();
  await Promise.all([...ex.docs.map((d) => d.ref.delete()), e2eDb().collection('channels').doc(id).delete()]);
}

/**
 * 見えている方のカード右上の「⋯」を開き、「情報の更新を提案する」を押せるようにする（仕様書 §3.1。
 * 再生リスト詳細は基本情報カードを PC・モバイル用に2つ描くため、見えている方を使う）
 */
function proposeButton(page: Page) {
  return {
    async click() {
      const menu = page.getByTestId('change-proposal-menu').filter({ visible: true });
      await expect(menu).toHaveAccessibleName('その他のメニュー');
      // ボタン自体は文言を出さないアイコンだけ
      await expect(menu).toHaveText('');
      await menu.click();
      const item = page.getByRole('menuitem', { name: '情報の更新を提案する' });
      await item.click();
    },
  };
}

test('§3.1 未ログインでは3つの詳細ページにボタンが出て、押すとログイン案内。チャンネルは本人・事務所向けの案内も出す（§5.3）', async ({ guestPage }) => {
  const game = await seedGame('提案のゲーム');
  const channel = await seedChannel({ listed: true });
  const playlist = await seedPlaylist({ gameId: game.id, gameName: game.title });
  try {
    for (const path of [`/games/${game.id}`, `/playlists/${playlist.id}`]) {
      await guestPage.goto(path);
      await proposeButton(guestPage).click();
      await expect(guestPage.getByRole('dialog')).toContainText('情報の更新を提案するにはアカウントが必要です');
      await expect(guestPage.getByTestId('change-proposal-creator-note')).toHaveCount(0);
      await guestPage.keyboard.press('Escape');
    }
    await guestPage.goto(`/channels/${channel.id}`);
    // チャンネル詳細ページそのものには本人向けの案内を出さない
    await expect(guestPage.getByTestId('change-proposal-creator-note')).toHaveCount(0);
    await proposeButton(guestPage).click();
    const note = guestPage.getByRole('dialog').getByTestId('change-proposal-creator-note');
    await expect(note).toContainText('ご本人・事務所の方へ');
    await expect(note.getByRole('link', { name: /掲載についてお問い合わせ/ })).toHaveAttribute('href', '/contact?type=channel_listing');
  } finally {
    await deleteChannel(channel.id);
    await e2eDb().collection('playlists').doc(playlist.id).delete();
    await e2eDb().collection('games').doc(game.id).delete();
  }
});

test('§3.1 管理者にはボタンを出さない', async ({ adminPage }) => {
  const game = await seedGame('提案のゲーム');
  try {
    await adminPage.goto(`/games/${game.id}`);
    await expect(adminPage.getByRole('button', { name: /ゲームタイトル情報を編集する/ })).toBeVisible();
    await expect(adminPage.getByTestId('change-proposal-menu')).toHaveCount(0);
  } finally {
    await e2eDb().collection('games').doc(game.id).delete();
  }
});

test('§4.2 ゲーム: 違う項目と補足（必須）で送れ、もう一度開くと「確認待ち」（§3.2・§7.1 同じ人の重複）', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '提案の送信は desktop だけ');
  const game = await seedGame('提案のゲーム');
  const key = `game:${game.id}`;
  try {
    await userPage.goto(`/games/${game.id}`);
    await proposeButton(userPage).click();
    const dialog = userPage.getByTestId('change-proposal-modal');
    const submit = dialog.getByRole('button', { name: '提案する' });
    await dialog.getByLabel('ゲームタイトル名').check();
    await expect(submit).toBeDisabled();
    await dialog.getByLabel('補足（必須）').fill('[E2E] 正しくはPS版です');
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(userPage.getByText(TOAST).first()).toBeVisible({ timeout: 30_000 });

    const docs = await proposalsFor(key);
    expect(docs).toHaveLength(1);
    expect(docs[0].data()).toMatchObject({ type: 'game_title_edit', status: 'reviewing_lv1', submittedBy: await uidOf(TEST_USER_EMAILS.user) });
    expect(docs[0].data().reportData).toMatchObject({ targetType: 'game', targetId: game.id, fields: ['title'], targetName: game.title });

    await proposeButton(userPage).click();
    await expect(userPage.getByTestId('change-proposal-pending')).toContainText('確認待ち');
  } finally {
    await deleteProposals(key);
    await e2eDb().collection('games').doc(game.id).delete();
  }
});

test('§6.3・§8 再生リスト「ゲームが違う」: 2人の報告を1行にまとめ、承認で選ばれたゲームに付け替え、全員に通知（§9）', async ({ userPage, adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '提案の送信は desktop だけ');
  const wrong = await seedGame('今のゲーム');
  const right = await seedGame('正しいゲーム');
  const playlist = await seedPlaylist({ gameId: wrong.id, gameName: wrong.title });
  const key = `playlist:${playlist.id}`;
  try {
    // 一般ユーザーは画面から
    await userPage.goto(`/playlists/${playlist.id}`);
    // 今のゲームを読み込んでから開く（ゲームが分かるまで「付いているゲームが違う」は出さない）
    await expect(userPage.getByText(wrong.title).first()).toBeVisible({ timeout: 30_000 });
    await proposeButton(userPage).click();
    const dialog = userPage.getByTestId('change-proposal-modal');
    await dialog.getByLabel('付いているゲームが違う').check();
    await expect(dialog.getByRole('button', { name: '提案する' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'ゲームを選ぶ' }).click();
    // ゲーム選択のモーダルは提案のモーダルの上に重ねて開く
    await userPage.getByRole('dialog').last().getByText(right.title).click();
    await dialog.getByRole('button', { name: '提案する' }).click();
    await expect(userPage.getByText(TOAST).first()).toBeVisible({ timeout: 30_000 });

    // 2人目（管理者の会員で API から。画面のボタンは管理者に出さない）
    const adminToken = await captureIdToken(adminPage, '/playlists/proposals');
    const res = await adminPage.request.post('/api/change-proposals', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { targetType: 'playlist', targetId: playlist.id, reason: 'wrong_game', proposedGameId: right.id },
    });
    expect(res.status()).toBe(200);

    const docs = (await proposalsFor(key)).sort((a, b) => a.data().submittedAt.toMillis() - b.data().submittedAt.toMillis());
    expect(docs).toHaveLength(2);

    await adminPage.goto('/admin/workflows');
    await expect(adminPage.getByText(`変更の提案（再生リスト）2人 — 付いているゲームが違う — 「${playlist.title}」`)).toBeVisible({ timeout: 30_000 });

    await adminPage.goto(`/admin/workflows/${docs[0].id}`);
    const detail = adminPage.getByTestId('change-proposal-detail');
    await expect(detail.getByTestId('change-proposal-reports').getByRole('listitem')).toHaveCount(2);
    await expect(detail.getByLabel('ゲームを付け替える')).toBeChecked();
    await expect(detail).toContainText(`付け替えるゲーム: ${right.title}`);
    await detail.getByRole('button', { name: '承認する' }).click();
    await adminPage.getByRole('dialog').getByRole('button', { name: '承認する' }).click();
    await expect(adminPage.getByText('承認しました').first()).toBeVisible({ timeout: 30_000 });

    const updated = (await e2eDb().collection('playlists').doc(playlist.id).get()).data()!;
    expect(updated.gameId).toBe(right.id);
    expect(updated.rejectedGameIds).toEqual([wrong.id]);
    for (const d of await proposalsFor(key)) {
      expect(d.data().status).toBe('approved');
      expect(d.data().reportData.decisionId).toBe(docs[0].id);
      const notes = await e2eDb().collection('notifications').where('workflowId', '==', d.id).get();
      expect(notes.docs[0].data().message).toContain('への提案を反映しました');
    }

    // 提案履歴に「反映済み」で並ぶ
    await userPage.goto('/playlists/proposals');
    const card = userPage.getByTestId('change-proposal-card').filter({ hasText: playlist.title });
    await expect(card).toContainText('反映済み');
    await expect(card).toContainText('付いているゲームが違う');
  } finally {
    await deleteProposals(key);
    const changes = await e2eDb().collection('playlist_game_changes').where('playlistId', '==', playlist.id).get();
    await Promise.all(changes.docs.map((d) => d.ref.delete()));
    await e2eDb().collection('playlists').doc(playlist.id).delete();
    await Promise.all([wrong.id, right.id].map((id) => e2eDb().collection('games').doc(id).delete()));
  }
});

test('§6.3 再生リスト「ゲーム実況ではない」: 承認で「ゲームではない」にし、管理者の判断として残す', async ({ userPage, adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '提案の送信は desktop だけ');
  const playlist = await seedPlaylist();
  const key = `playlist:${playlist.id}`;
  try {
    await userPage.goto(`/playlists/${playlist.id}`);
    await proposeButton(userPage).click();
    const dialog = userPage.getByTestId('change-proposal-modal');
    // ゲーム未設定の再生リストでは「付いているゲームが違う」を出さない（§6.2）
    await expect(dialog.getByLabel('付いているゲームが違う')).toHaveCount(0);
    await dialog.getByLabel('ゲーム実況の再生リストではない').check();
    await dialog.getByRole('button', { name: '提案する' }).click();
    await expect(userPage.getByText(TOAST).first()).toBeVisible({ timeout: 30_000 });

    const [wf] = await proposalsFor(key);
    await adminPage.goto(`/admin/workflows/${wf.id}`);
    const detail = adminPage.getByTestId('change-proposal-detail');
    await expect(detail.getByLabel('「ゲームではない」にして、さがすから外す')).toBeChecked();
    await detail.getByRole('button', { name: '承認する' }).click();
    await adminPage.getByRole('dialog').getByRole('button', { name: '承認する' }).click();
    await expect(adminPage.getByText('承認しました').first()).toBeVisible({ timeout: 30_000 });

    const updated = (await e2eDb().collection('playlists').doc(playlist.id).get()).data()!;
    expect(updated).toMatchObject({ listingStatus: 'non_game', listingSetBy: 'admin', listingReason: 'report' });
  } finally {
    await deleteProposals(key);
    await e2eDb().collection('playlists').doc(playlist.id).delete();
  }
});

test('§5・§8.3 チャンネル: 報告を送り、却下すると定型の見送り理由が提案履歴と通知に出る', async ({ userPage, adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '提案の送信は desktop だけ');
  const channel = await seedChannel({ listed: true });
  const key = `channel:${channel.id}`;
  try {
    await userPage.goto(`/channels/${channel.id}`);
    await proposeButton(userPage).click();
    const dialog = userPage.getByTestId('change-proposal-modal');
    await expect(dialog.getByTestId('change-proposal-creator-note')).toBeVisible();
    await dialog.getByLabel('もうゲーム実況をしていない').check();
    await dialog.getByRole('button', { name: '提案する' }).click();
    await expect(userPage.getByText(TOAST).first()).toBeVisible({ timeout: 30_000 });

    const [wf] = await proposalsFor(key);
    expect(wf.data().type).toBe('channel_report');
    await adminPage.goto(`/admin/workflows/${wf.id}`);
    const detail = adminPage.getByTestId('change-proposal-detail');
    await expect(detail.getByLabel('チャンネルを掲載から外す')).toBeChecked();
    await detail.getByRole('button', { name: '却下する' }).click();
    const modal = adminPage.getByRole('dialog');
    await modal.getByLabel('確認しましたが、今の内容で合っていました').check();
    await modal.getByRole('button', { name: '却下する' }).click();
    await expect(adminPage.getByText('却下しました').first()).toBeVisible({ timeout: 30_000 });

    // 掲載はそのまま
    const ex = await e2eDb().collection('exploration_channels').where('youtubeChannelId', '==', channel.id).get();
    expect(ex.docs[0].data().status).toBe('active');
    const notes = await e2eDb().collection('notifications').where('workflowId', '==', wf.id).get();
    expect(notes.docs[0].data().message).toContain('見送りになりました（確認しましたが、今の内容で合っていました）');

    await userPage.goto('/playlists/proposals');
    const card = userPage.getByTestId('change-proposal-card').filter({ hasText: channel.name });
    await expect(card).toContainText('見送り理由: 確認しましたが、今の内容で合っていました');
  } finally {
    await deleteProposals(key);
    await deleteChannel(channel.id);
  }
});

test('§7.2 掲載チャンネルでないチャンネルには送れない', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '提案の送信は desktop だけ');
  const channel = await seedChannel({ listed: false });
  const key = `channel:${channel.id}`;
  try {
    await userPage.goto(`/channels/${channel.id}`);
    await proposeButton(userPage).click();
    const dialog = userPage.getByTestId('change-proposal-modal');
    await dialog.getByLabel('もうゲーム実況をしていない').check();
    await dialog.getByRole('button', { name: '提案する' }).click();
    await expect(dialog.getByRole('alert')).toContainText('このチャンネルは今、提案を受け付けていません');
    expect(await proposalsFor(key)).toHaveLength(0);
  } finally {
    await deleteProposals(key);
    await deleteChannel(channel.id);
  }
});

test('§7.1 1人1日5件まで', async ({ userPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '提案の送信は desktop だけ');
  const uid = await uidOf(TEST_USER_EMAILS.user);
  const game = await seedGame('上限のゲーム');
  // 直近24時間の提案を5件まで埋める（架空の対象）
  const seeded: string[] = [];
  const existing = (await e2eDb().collection('workflows').where('submittedBy', '==', uid).get()).docs.filter(
    (d) => ['game_title_edit', 'channel_report', 'playlist_report'].includes(d.data().type) && d.data().submittedAt.toMillis() > Date.now() - 86_400_000,
  ).length;
  try {
    for (let i = existing; i < 5; i++) {
      const ref = e2eDb().collection('workflows').doc();
      seeded.push(ref.id);
      await ref.set({
        type: 'game_title_edit', status: 'rejected', submittedBy: uid, proposalData: null, step2History: [],
        reportData: { targetType: 'game', targetId: `e2e-limit-${i}`, targetKey: `game:e2e-limit-${i}`, targetName: uniqueText('上限') },
        submittedAt: new Date(), updatedAt: new Date(),
      });
    }
    await userPage.goto(`/games/${game.id}`);
    await proposeButton(userPage).click();
    const dialog = userPage.getByTestId('change-proposal-modal');
    await dialog.getByLabel('説明文').check();
    await dialog.getByLabel('補足（必須）').fill('[E2E] 上限の確認');
    await dialog.getByRole('button', { name: '提案する' }).click();
    await expect(dialog.getByRole('alert')).toContainText('提案は1日5件までです');
  } finally {
    await Promise.all(seeded.map((id) => e2eDb().collection('workflows').doc(id).delete()));
    await deleteProposals(`game:${game.id}`);
    await e2eDb().collection('games').doc(game.id).delete();
  }
});
