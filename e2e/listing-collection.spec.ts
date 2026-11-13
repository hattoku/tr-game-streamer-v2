// 収集の変更（リブランディング段階4）: 全件保存・自動判定・掲載チャンネルごとの掲載方法・自動掲載の確認画面。
// コンテンツ収集機能仕様書 v4.3 §10.2・§10.4〜§10.7・§10.11、収集候補レビューUI仕様書 v3.6 §8・§9。
// 再生リスト・チャンネル・ゲームは Admin SDK で直接作る（YouTube に無い ID。名前は [E2E] で始まり、終了時に自分で消す）。
// 30日ルール・自動掲載・巡回を含む実行は e2e/refresh-new-videos.spec.ts（毎日の再取得）で確かめる。
import { expect as pwExpect, test as pwTest } from '@playwright/test';
import { expect, hasHorizontalScroll, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';
import { DEFAULT_LISTING_RULES, describeListingReason, judgeListing } from '../lib/listing-rules';

async function seedChannel(params: { channelTitle: string; publishMode?: 'confirm' | 'auto'; status?: string; channelIconUrl?: string }) {
  const ref = e2eDb().collection('exploration_channels').doc();
  const youtubeChannelId = randomId('UCE2E');
  await ref.set({
    name: params.channelTitle, status: params.status ?? 'active', youtubeChannelId, channelTitle: params.channelTitle, channelIconUrl: params.channelIconUrl ?? '',
    subscriberCount: null, searchCandidates: [], tagIds: [], publishMode: params.publishMode ?? 'confirm', authorizedVia: 'admin',
    lastExploredAt: null, lastFoundCount: null, createdAt: new Date(), createdBy: 'e2e', updatedAt: new Date(),
  });
  return { id: ref.id, youtubeChannelId };
}

async function seedGame(title: string, playlistCount: number, packageImageUrl: string | null = null) {
  const ref = e2eDb().collection('games').doc();
  await ref.set({ title, aliases: [], packageImageUrl, platforms: [], genreId: null, genreName: null, themeIds: [], gameTagIds: [], gameTagsFixed: [], playlistCount, createdAt: new Date(), updatedAt: new Date() });
  return ref.id;
}

async function seedPlaylist(params: {
  channel: { id: string; youtubeChannelId: string }; channelTitle: string; listingStatus: string; listingReason?: string;
  listingSetBy?: 'auto' | 'admin'; gameId?: string | null; title?: string; videoCount?: number; youtubeItemCount?: number | null;
}) {
  const id = randomId('PLE2E');
  const title = params.title ?? uniqueText('取り込んだ再生リスト');
  await e2eDb().collection('playlists').doc(id).set({
    youtubePlaylistId: id, title, thumbnailUrl: '', channelId: params.channel.youtubeChannelId, channelName: params.channelTitle, channelIconUrl: '',
    gameId: params.gameId ?? null, gameName: params.gameId ? 'E2Eゲーム' : '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
    videoCount: params.videoCount ?? 12, youtubeItemCount: params.youtubeItemCount === undefined ? 12 : params.youtubeItemCount,
    latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'system', proposedBy: null, isPublic: true,
    score: null, reviewCount: 0, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [], referenceUrl: '', lastFetchedAt: null,
    listingStatus: params.listingStatus, listingReason: params.listingReason ?? 'confirm', listingSetBy: params.listingSetBy ?? 'auto', listingSetAt: new Date(),
    previousListingStatus: null, source: 'channel_sweep', explorationChannelId: params.channel.id, metaFetchedAt: new Date(), playlistPublishedAt: new Date(),
  });
  return { id, title };
}

const playlistDoc = async (id: string) => (await e2eDb().collection('playlists').doc(id).get()).data()!;
const gameCount = async (id: string) => (await e2eDb().collection('games').doc(id).get()).data()!.playlistCount as number;

async function cleanup(params: { channels?: string[]; playlists?: string[]; games?: string[] }) {
  await Promise.all([
    ...(params.channels ?? []).map((id) => e2eDb().collection('exploration_channels').doc(id).delete()),
    ...(params.playlists ?? []).map((id) => e2eDb().collection('playlists').doc(id).delete()),
    ...(params.games ?? []).map((id) => e2eDb().collection('games').doc(id).delete()),
  ]);
}

// ---- 判定のルール（画面を使わない） ----
pwTest('§10.4 掲載状態の判定は、除外語 → 非ゲーム語 → 10本未満 → 掲載方法の順で、最初に当たったもので決まる', () => {
  const judge = (title: string, itemCount: number, mode: 'confirm' | 'auto' = 'confirm') => judgeListing({ title, itemCount }, DEFAULT_LISTING_RULES, mode);
  pwExpect(judge('【単発】いろいろ実況', 30)).toEqual({ status: 'excluded', reason: 'word:単発' });
  pwExpect(judge('【雑談】まったり', 30)).toEqual({ status: 'non_game', reason: 'word:雑談' });
  // 除外語が非ゲーム語より先
  pwExpect(judge('切り抜き 雑談', 30).status).toBe('excluded');
  // 除外語・非ゲーム語は本数より先（10本未満でも言葉で決まる）
  pwExpect(judge('歌ってみた集', 3).status).toBe('non_game');
  pwExpect(judge('ゼルダ実況', 9)).toEqual({ status: 'too_short', reason: 'too_short' });
  pwExpect(judge('ゼルダ実況', 10)).toEqual({ status: 'unconfirmed', reason: 'confirm' });
  // 掲載方法が「自動」ならルールに当たらないものは掲載
  pwExpect(judge('ゼルダ実況', 10, 'auto')).toEqual({ status: 'listed', reason: 'auto' });
  // 言葉の照合は大文字小文字・全角半角を区別しない
  pwExpect(judge('ＶＬＯＧ 旅', 30).status).toBe('non_game');
});

pwTest('§10.5 ゲーム実況にも付く言葉（アーカイブ・コラボ・企画・検証・レビュー）は初期値に入れない', () => {
  for (const word of ['アーカイブ', 'コラボ', '企画', '検証', 'やってみた', 'レビュー']) {
    pwExpect(DEFAULT_LISTING_RULES.excludedWords).not.toContain(word);
    pwExpect(DEFAULT_LISTING_RULES.nonGameWords).not.toContain(word);
  }
  pwExpect(DEFAULT_LISTING_RULES.minVideoCount).toBe(10);
});

pwTest('§8.6 判定の理由を、画面に出す言葉にする', () => {
  const d = (reason: string | null, status: string, videoCount = 7) => describeListingReason({ status, reason, setBy: 'auto', videoCount, rules: DEFAULT_LISTING_RULES });
  pwExpect(d('word:雑談', 'non_game')).toBe('非ゲーム語「雑談」');
  pwExpect(d('word:単発', 'excluded')).toBe('除外語「単発」');
  pwExpect(d('too_short', 'too_short')).toBe('10本未満（7本）');
  pwExpect(d('confirm', 'unconfirmed')).toBe('ルールに当たらず確認待ち');
  pwExpect(d('auto_pending', 'unconfirmed')).toBe('自動で掲載する予定（動画の取得待ち）');
});

// ---- 自動掲載の確認画面 ----
test('§8.2・§8.3 確認待ちの再生リストを掲載すると検索面の対象になり、ゲームの件数が増える。ゲームではないにすると減る', async ({ adminPage }) => {
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const channel = await seedChannel({ channelTitle });
  const gameId = await seedGame(uniqueText('ゲーム'), 1);
  const pending = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', gameId });
  const listed = await seedPlaylist({ channel, channelTitle, listingStatus: 'listed', listingSetBy: 'admin', listingReason: 'admin', gameId });
  try {
    await adminPage.goto(`/admin/collection?channel=${channel.id}`);
    // 確認待ちのタブに、チャンネルごとにまとまり、判定の理由と掲載方法が出る
    const group = adminPage.locator('section').filter({ hasText: channelTitle });
    await expect(group).toContainText('確認してから掲載');
    await expect(group.getByTestId('listing-reason')).toContainText('ルールに当たらず確認待ち');
    await expect(group.getByRole('checkbox', { name: `${pending.title}を選択` })).toBeVisible();
    await expect(adminPage.getByRole('heading', { name: '自動掲載の確認' })).toBeVisible();
    expect(await hasHorizontalScroll(adminPage)).toBe(false);

    // 掲載する（動画一覧は取得済みなので YouTube は呼ばない）
    await group.getByRole('checkbox', { name: `${pending.title}を選択` }).check();
    adminPage.once('dialog', (dialog) => dialog.accept());
    await adminPage.getByRole('button', { name: '掲載する', exact: true }).click();
    await expect(adminPage.getByText('1件を「掲載する」にしました').first()).toBeVisible({ timeout: 60_000 });
    const afterList = await playlistDoc(pending.id);
    expect(afterList.listingStatus).toBe('listed');
    expect(afterList.listingSetBy).toBe('admin');
    expect(afterList.listingReason).toBe('admin');
    expect(await gameCount(gameId)).toBe(2);

    // 掲載中のタブでゲームではないにする
    await adminPage.getByRole('tab', { name: /掲載中/ }).click();
    const listedGroup = adminPage.locator('section').filter({ hasText: channelTitle });
    await listedGroup.getByRole('checkbox', { name: `${listed.title}を選択` }).check();
    adminPage.once('dialog', (dialog) => dialog.accept());
    await adminPage.getByRole('button', { name: 'ゲームではない', exact: true }).click();
    await expect(adminPage.getByText('1件を「ゲームではない」にしました').first()).toBeVisible({ timeout: 60_000 });
    const afterUnlist = await playlistDoc(listed.id);
    expect(afterUnlist.listingStatus).toBe('non_game');
    expect(afterUnlist.listingSetBy).toBe('admin');
    expect(await gameCount(gameId)).toBe(1);
    // 動画・ゲームの紐づけは消さない（§10.7）
    expect(afterUnlist.gameId).toBe(gameId);
  } finally {
    await cleanup({ channels: [channel.id], playlists: [pending.id, listed.id], games: [gameId] });
  }
});

test('§8.3 人が決めた掲載状態は、判定し直しで上書きされない。自動で決めたものは言葉の表で判定し直される', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '判定し直しは stg 全体に効くため desktop だけで実行する');
  test.setTimeout(120_000);
  const channelTitle = uniqueText('チャンネル');
  const channel = await seedChannel({ channelTitle });
  const auto = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', title: uniqueText('【雑談】自動で決めた') });
  const byAdmin = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', listingSetBy: 'admin', listingReason: 'admin', title: uniqueText('【雑談】管理者が決めた') });
  try {
    await adminPage.goto(`/admin/collection?channel=${channel.id}`);
    await adminPage.getByRole('button', { name: '判定の言葉' }).click();
    const dialog = adminPage.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '雑談を削除' })).toBeVisible();
    adminPage.once('dialog', (d) => d.accept());
    await dialog.getByRole('button', { name: '判定し直す' }).click();
    await expect(adminPage.getByText(/判定し直しました/).first()).toBeVisible({ timeout: 60_000 });
    const a = await playlistDoc(auto.id);
    expect(a.listingStatus).toBe('non_game');
    expect(a.listingReason).toBe('word:雑談');
    expect(a.listingSetBy).toBe('auto');
    const b = await playlistDoc(byAdmin.id);
    expect(b.listingStatus).toBe('unconfirmed');
    expect(b.listingSetBy).toBe('admin');
  } finally {
    await cleanup({ channels: [channel.id], playlists: [auto.id, byAdmin.id] });
  }
});

test('§8.4 判定の言葉を追加して保存できる（確認後は元に戻す）', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '判定の言葉は stg 全体に効くため desktop だけで実行する');
  const ref = e2eDb().collection('app_settings').doc('listing_rules');
  const original = await ref.get();
  const word = `E2E語${Date.now().toString(36)}`;
  try {
    await adminPage.goto('/admin/collection');
    await adminPage.getByRole('button', { name: '判定の言葉' }).click();
    const dialog = adminPage.getByRole('dialog');
    await dialog.getByLabel('除外語（対象外にする）を追加').fill(word);
    await dialog.getByRole('button', { name: '追加' }).first().click();
    await expect(dialog.getByRole('button', { name: `${word}を削除` })).toBeVisible();
    await dialog.getByRole('button', { name: '保存する' }).click();
    await expect(adminPage.getByText('保存しました').first()).toBeVisible();
    const saved = (await ref.get()).data()!;
    expect(saved.excludedWords).toContain(word);
    expect(saved.minVideoCount).toBe(10);
  } finally {
    if (original.exists) await ref.set(original.data()!);
    else await ref.delete();
  }
});

test('§8.2・§8.3 チャンネル見出しにアイコンとプレミテのチャンネルページへのリンク、ゲームの欄にパッケージ画像が出る（v3.5）', async ({ adminPage }) => {
  const channelTitle = uniqueText('チャンネル');
  const iconUrl = 'https://yt3.ggpht.com/e2e-channel-icon=s88-c-k-c0x00ffffff-no-rj';
  const channel = await seedChannel({ channelTitle, channelIconUrl: iconUrl });
  // プレミテ内のチャンネルページ（掲載した再生リストがあると作られる channels ドキュメント）
  await e2eDb().collection('channels').doc(channel.youtubeChannelId).set({ name: channelTitle, iconUrl, description: null, isAiGeneratedDescription: false, playlistCount: 1 });
  const withImage = await seedGame(uniqueText('画像ありゲーム'), 0, 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/e2e/e2e.jpg?_ex=200x200');
  const noImage = await seedGame(uniqueText('画像なしゲーム'), 0);
  const a = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', gameId: withImage, title: uniqueText('画像ありの再生リスト') });
  const b = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', gameId: noImage, title: uniqueText('画像なしの再生リスト') });
  // チャンネルページがまだ無いチャンネルにはリンクを出さない
  const otherTitle = uniqueText('ページなしチャンネル');
  const other = await seedChannel({ channelTitle: otherTitle });
  const c = await seedPlaylist({ channel: other, channelTitle: otherTitle, listingStatus: 'unconfirmed' });
  try {
    await adminPage.goto(`/admin/collection?channel=${channel.id}`);
    const group = adminPage.locator('section').filter({ hasText: channelTitle });
    await expect(group.locator(`img[src="${iconUrl}"]`)).toHaveCount(1);
    const link = group.getByRole('link', { name: `${channelTitle}のチャンネルページを開く（プレミテ・新しいタブ）` });
    await expect(link).toHaveAttribute('href', `/channels/${channel.youtubeChannelId}`);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await hasHorizontalScroll(adminPage)).toBe(false);

    // パッケージ画像は一覧カード用の解像度（_ex=400x400）に差し替えて出す。画像の無いゲームは名前だけ
    const rowA = group.getByRole('listitem').filter({ hasText: a.title });
    await expect(rowA.locator('img[src*="thumbnail.image.rakuten.co.jp"]')).toHaveAttribute('src', /_ex=400x400/);
    const rowB = group.getByRole('listitem').filter({ hasText: b.title });
    await expect(rowB).toContainText('E2Eゲーム');
    await expect(rowB.locator('img[src*="thumbnail.image.rakuten.co.jp"]')).toHaveCount(0);

    await adminPage.goto(`/admin/collection?channel=${other.id}`);
    const otherGroup = adminPage.locator('section').filter({ hasText: otherTitle });
    await expect(otherGroup.getByRole('checkbox', { name: `${c.title}を選択` })).toBeVisible();
    await expect(otherGroup.getByRole('link', { name: /チャンネルページを開く/ })).toHaveCount(0);
  } finally {
    await cleanup({ channels: [channel.id, other.id], playlists: [a.id, b.id, c.id], games: [withImage, noImage] });
    await e2eDb().collection('channels').doc(channel.youtubeChannelId).delete();
  }
});

test('§8.3 ゲームの画像・名前を押すと、付いているゲームの詳細と楽天ブックスで選ばれている商品のページが見られる。「ゲームは決めなくても掲載できます」は1回だけ出す（v3.6）', async ({ adminPage }) => {
  const channelTitle = uniqueText('チャンネル');
  const channel = await seedChannel({ channelTitle });
  const rakutenUrl = 'https://books.rakuten.co.jp/rb/e2e-item/';
  const withRakuten = await seedGame(uniqueText('楽天ありゲーム'), 0, 'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/e2e/e2e.jpg?_ex=200x200');
  await e2eDb().collection('games').doc(withRakuten).update({ rakutenUrl, platforms: ['Nintendo Switch'], genreName: 'アクション' });
  const nameOnly = await seedGame(uniqueText('名前だけゲーム'), 0);
  const a = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', gameId: withRakuten, title: uniqueText('楽天ありの再生リスト') });
  const b = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', gameId: nameOnly, title: uniqueText('名前だけの再生リスト') });
  const c = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed', title: uniqueText('ゲームなしの再生リスト') });
  try {
    await adminPage.goto(`/admin/collection?channel=${channel.id}`);
    const group = adminPage.locator('section').filter({ hasText: channelTitle });
    await expect(group.getByRole('checkbox', { name: `${c.title}を選択` })).toBeVisible();
    // 案内は一覧の上に1回だけ（各行には出さない）
    await expect(adminPage.getByText('ゲームは決めなくても掲載できます。')).toHaveCount(1);
    await expect(group.getByText('ゲームは決めなくても掲載できます。')).toHaveCount(0);
    // ゲームの無い行には詳細ボタンが無い
    await expect(group.getByRole('button', { name: `${c.title}に付いているゲーム`, exact: false })).toHaveCount(0);

    await group.getByRole('button', { name: `${a.title}に付いているゲーム「E2Eゲーム」の詳細を見る` }).click();
    const dialog = adminPage.getByRole('dialog', { name: '付いているゲーム' });
    await expect(dialog).toContainText('楽天ありゲーム');
    await expect(dialog).toContainText('Nintendo Switch');
    await expect(dialog).toContainText('アクション');
    const item = dialog.getByRole('link', { name: '選ばれている商品のページを開く' });
    await expect(item).toHaveAttribute('href', rakutenUrl);
    await expect(item).toHaveAttribute('target', '_blank');
    await expect(dialog.getByRole('link', { name: /ゲームタイトル詳細を開く/ })).toHaveAttribute('href', `/games/${withRakuten}`);
    await adminPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // 楽天の商品が無いゲーム
    await group.getByRole('button', { name: `${b.title}に付いているゲーム「E2Eゲーム」の詳細を見る` }).click();
    await expect(dialog).toContainText('名前だけゲーム');
    await expect(dialog).toContainText('商品は選ばれていません');
    await expect(dialog.getByRole('link', { name: '選ばれている商品のページを開く' })).toHaveCount(0);
  } finally {
    await cleanup({ channels: [channel.id], playlists: [a.id, b.id, c.id], games: [withRakuten, nameOnly] });
  }
});

// ---- 掲載チャンネル画面 ----
test('§9.2・§9.3・§9.5 掲載方法の切り替え。掲載を止めるとすぐ再生リストが非表示になり、再開すると元に戻る', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'チャンネルの操作は巡回（YouTube）を伴うため desktop だけで実行する');
  test.setTimeout(180_000);
  const channelTitle = uniqueText('チャンネル');
  const channel = await seedChannel({ channelTitle });
  const gameId = await seedGame(uniqueText('ゲーム'), 1);
  const listed = await seedPlaylist({ channel, channelTitle, listingStatus: 'listed', listingSetBy: 'admin', listingReason: 'admin', gameId });
  const pending = await seedPlaylist({ channel, channelTitle, listingStatus: 'unconfirmed' });
  try {
    await adminPage.goto('/admin/collection/channels');
    await adminPage.getByRole('tab', { name: /登録済み/ }).click();
    const card = adminPage.getByRole('listitem').filter({ hasText: channelTitle });
    await expect(card).toContainText('掲載中 1件');
    await expect(card).toContainText('確認待ち 1件');

    // 掲載方法の切り替え（既定は確認してから掲載）
    await card.getByRole('button', { name: '自動で掲載' }).click();
    await expect(adminPage.getByText('自動で掲載にしました').first()).toBeVisible();
    expect((await e2eDb().collection('exploration_channels').doc(channel.id).get()).data()!.publishMode).toBe('auto');
    await card.getByRole('button', { name: '確認してから掲載' }).click();
    await expect(adminPage.getByText('確認してから掲載にしました').first()).toBeVisible();
    expect((await e2eDb().collection('exploration_channels').doc(channel.id).get()).data()!.publishMode).toBe('confirm');

    // 掲載を止める → すぐ全再生リストが channel_off（opt_out）。元の状態を残し、件数を戻す
    await card.getByRole('button', { name: '掲載を止める' }).click();
    const dialog = adminPage.getByRole('dialog');
    await dialog.getByLabel('理由メモ（運営内部向け・任意）').fill('E2Eの申し出');
    await dialog.getByRole('button', { name: '掲載を止める' }).click();
    await expect(adminPage.getByText('2件の再生リストを非表示にしました').first()).toBeVisible({ timeout: 60_000 });
    const off = await playlistDoc(listed.id);
    expect(off.listingStatus).toBe('channel_off');
    expect(off.listingReason).toBe('opt_out');
    expect(off.previousListingStatus).toBe('listed');
    expect((await playlistDoc(pending.id)).listingStatus).toBe('channel_off');
    expect(await gameCount(gameId)).toBe(0);
    const stopped = (await e2eDb().collection('exploration_channels').doc(channel.id).get()).data()!;
    expect(stopped.status).toBe('opted_out');
    expect(stopped.statusNote).toContain('E2Eの申し出');

    // 掲載停止のタブから再開 → 元の掲載状態に戻る
    await adminPage.getByRole('tab', { name: /掲載停止/ }).click();
    await adminPage.getByRole('listitem').filter({ hasText: channelTitle }).getByRole('button', { name: '掲載を再開する' }).click();
    await expect(adminPage.getByText(/掲載を再開しました/).first()).toBeVisible({ timeout: 90_000 });
    const back = await playlistDoc(listed.id);
    expect(back.listingStatus).toBe('listed');
    expect((await playlistDoc(pending.id)).listingStatus).toBe('unconfirmed');
    expect(await gameCount(gameId)).toBe(1);
    expect((await e2eDb().collection('exploration_channels').doc(channel.id).get()).data()!.status).toBe('active');
  } finally {
    await cleanup({ channels: [channel.id], playlists: [listed.id, pending.id], games: [gameId] });
  }
});

test('§9.3 掲載から外すと再生リストが非表示（channel_excluded）になり、掲載し直すと戻る。掲載停止のチャンネルは再掲載の入口にならない', async ({ adminPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'チャンネルの操作は巡回（YouTube）を伴うため desktop だけで実行する');
  test.setTimeout(180_000);
  const channelTitle = uniqueText('チャンネル');
  const channel = await seedChannel({ channelTitle });
  const listed = await seedPlaylist({ channel, channelTitle, listingStatus: 'listed', listingSetBy: 'admin', listingReason: 'admin' });
  const nonGame = await seedPlaylist({ channel, channelTitle, listingStatus: 'non_game', listingReason: 'word:雑談' });
  try {
    await adminPage.goto('/admin/collection/channels');
    await adminPage.getByRole('tab', { name: /登録済み/ }).click();
    await adminPage.getByRole('listitem').filter({ hasText: channelTitle }).getByRole('button', { name: '掲載から外す' }).click();
    await adminPage.getByRole('dialog').getByRole('button', { name: '掲載から外す' }).click();
    await expect(adminPage.getByText('2件の再生リストを非表示にしました').first()).toBeVisible({ timeout: 60_000 });
    expect((await playlistDoc(listed.id)).listingReason).toBe('channel_excluded');
    expect((await playlistDoc(nonGame.id)).previousListingStatus).toBe('non_game');

    await adminPage.getByRole('tab', { name: /掲載しない/ }).click();
    await adminPage.getByRole('listitem').filter({ hasText: channelTitle }).getByRole('button', { name: '掲載する' }).click();
    await expect(adminPage.getByText(/掲載しました/).first()).toBeVisible({ timeout: 90_000 });
    expect((await playlistDoc(listed.id)).listingStatus).toBe('listed');
    // 人が決めていないが、元の状態（ゲームではない）をそのまま戻す
    const restored = await playlistDoc(nonGame.id);
    expect(restored.listingStatus).toBe('non_game');
    expect(restored.listingReason).toBe('word:雑談');
  } finally {
    await cleanup({ channels: [channel.id], playlists: [listed.id, nonGame.id] });
  }
});
