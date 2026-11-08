// 一覧のサーバー側検索（リブランディング段階7）の確認項目。共通 一覧のサーバー側検索 仕様書の各節と、
// ページ 再生リストを探す 仕様書 v2.2・チャンネル 探す v2.1・ゲームタイトル 探す v1.6・top v2.1・ゲーム/チャンネル詳細の段階7の追記。
// 再生リスト・チャンネル・ゲームは Admin SDK で直接作り、終了時に自分で消す（名前は [E2E] で始まる）。
// desktop と mobile で同時に走るため、検索の目印（token）はテストごとに一意にする。
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import { uniqueText } from './support/env';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

interface SeedPlaylist {
  channelId: string;
  channelName: string;
  title?: string;
  listingStatus?: string;
  gameId?: string | null;
  gameName?: string;
  gameGenreIds?: string[];
  tagIds?: string[];
  score?: number | null;
  mylistCount?: number;
  videoCount?: number;
  registeredAt?: Date;
}

async function seedPlaylists(list: SeedPlaylist[]): Promise<string[]> {
  const batch = e2eDb().batch();
  const ids = list.map((p) => {
    const id = randomId('PLE2E');
    batch.set(e2eDb().collection('playlists').doc(id), {
      title: p.title ?? uniqueText('サーバー検索の再生リスト'), thumbnailUrl: '', channelId: p.channelId, channelName: p.channelName, channelIconUrl: '',
      gameId: p.gameId ?? null, gameName: p.gameName ?? '', gameGenreIds: p.gameGenreIds ?? [], gameHint: null, gameSetBy: null, gameSetAt: null,
      videoCount: p.videoCount ?? 10, latestVideoPublishedAt: null, registeredAt: p.registeredAt ?? new Date(), registeredBy: 'e2e', proposedBy: null,
      isPublic: true, score: p.score ?? null, reviewCount: 0, mylistCount: p.mylistCount ?? 0, playlistTagIds: p.tagIds ?? [], playlistTagsFixed: [],
      referenceUrl: '', lastFetchedAt: null,
      listingStatus: p.listingStatus ?? 'listed', listingReason: 'e2e', listingSetBy: 'admin', listingSetAt: new Date(),
      previousListingStatus: null, source: 'admin', explorationChannelId: null,
    });
    return id;
  });
  await batch.commit();
  return ids;
}

async function seedChannel(name: string) {
  const id = randomId('UCE2E');
  await e2eDb().collection('channels').doc(id).set({
    youtubeChannelId: id, name, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
    playlistCount: 0, registeredAt: new Date(), lastFetchedAt: null,
  });
  return id;
}

async function seedGame(title: string, extra: { genreId?: string | null; gameTagIds?: string[] } = {}) {
  const ref = e2eDb().collection('games').doc();
  await ref.set({
    title, aliases: [], packageImageUrl: null, rakutenUrl: null, description: '', isAiGeneratedDescription: false, platforms: [],
    genreId: extra.genreId ?? null, genreName: null, themeIds: [], gameTagIds: extra.gameTagIds ?? [], gameTagsFixed: [], playlistCount: 0,
    createdAt: new Date(), updatedAt: new Date(),
  });
  return ref.id;
}

async function cleanup(playlistIds: string[], channelIds: string[] = [], gameIds: string[] = []) {
  await Promise.all([
    ...playlistIds.map((id) => e2eDb().collection('playlists').doc(id).delete()),
    ...channelIds.map((id) => e2eDb().collection('channels').doc(id).delete()),
    ...gameIds.map((id) => e2eDb().collection('games').doc(id).delete()),
  ]);
}

function token() {
  return Math.random().toString(36).slice(2, 10);
}

/** 半角英数字を全角にする（NFKC で元に戻る） */
function toFullWidth(s: string) {
  return s.replace(/[0-9a-z]/g, (c) => String.fromCharCode(c.toUpperCase().charCodeAt(0) + 0xfee0));
}

/** API を呼ぶ。索引への反映は数秒かかることがあるので、条件を満たすまで呼び直す */
async function apiUntil<T>(request: APIRequestContext, path: string, ok: (body: T) => boolean): Promise<T> {
  let body: T | undefined;
  await expect
    .poll(
      async () => {
        const res = await request.get(path);
        if (!res.ok()) return false;
        body = (await res.json()) as T;
        return ok(body);
      },
      { timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .toBe(true);
  return body!;
}

interface PlaylistPage {
  items: Array<{ id: string; title: string; mylistCount: number }>;
  total: number;
  page: number;
  pageCount: number;
  totalVideoCount: number;
}

async function openSearch(page: Page, path: string, label: string, keyword: string) {
  await page.goto(path);
  // モバイルでは検索条件がアコーディオンに畳まれている
  const toggle = page.locator('button[aria-expanded]').filter({ hasText: '検索条件' });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByLabel(label).filter({ visible: true }).fill(keyword);
}

test('§4.1 キーワードはサーバー側で部分一致。カタカナ/ひらがな・全角/半角を無視し、空白で区切った語はすべて含むもの', async ({ guestPage }) => {
  const t = token();
  const channelName = `[E2E] カタカナチャンネル ${t}`;
  const channelId = await seedChannel(channelName);
  const [hit] = await seedPlaylists([{ channelId, channelName, gameName: 'テスト用ゲーム' }]);
  const [other] = await seedPlaylists([{ channelId, channelName, gameName: 'べつのゲーム' }]);
  try {
    // ひらがな＋全角の目印＋ゲーム名の一部（別の項目）。どれも含むものだけが出る
    await openSearch(guestPage, '/playlists', 'ゲームタイトル・チャンネル名で検索', `かたかなちゃんねる ${toFullWidth(t)} てすと`);
    await expect(guestPage.locator(`a[href="/playlists/${hit}"]`).first()).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByText(/^1件$/)).toBeVisible();
    await expect(guestPage.locator(`a[href="/playlists/${other}"]`)).toHaveCount(0);
  } finally {
    await cleanup([hit, other], [channelId]);
  }
});

test('§3.1・§5.1 再生リストを探すは1ページ20件をサーバーから受け取り、件数は条件に合う全体の数', async ({ guestPage, request }) => {
  const t = token();
  const channelName = `[E2E] ページ送り ${t}`;
  const channelId = await seedChannel(channelName);
  const ids = await seedPlaylists(Array.from({ length: 21 }, (_, i) => ({ channelId, channelName, mylistCount: i })));
  try {
    const first = await apiUntil<PlaylistPage>(request, `/api/catalog/playlists?q=${encodeURIComponent(t)}`, (b) => b.total === 21);
    expect(first.items).toHaveLength(20);
    expect(first.pageCount).toBe(2);
    // 範囲外のページは最後のページに丸める
    const last = (await (await request.get(`/api/catalog/playlists?q=${encodeURIComponent(t)}&page=99`)).json()) as PlaylistPage;
    expect(last.page).toBe(2);
    expect(last.items).toHaveLength(1);

    await openSearch(guestPage, '/playlists', 'ゲームタイトル・チャンネル名で検索', t);
    await expect(guestPage.getByText(/^21件$/)).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.locator('a[href^="/playlists/PLE2E"]')).toHaveCount(20);
    await guestPage.getByRole('navigation', { name: 'ページ送り' }).getByRole('button', { name: '2', exact: true }).click();
    await expect(guestPage.locator('a[href^="/playlists/PLE2E"]')).toHaveCount(1);
  } finally {
    await cleanup(ids, [channelId]);
  }
});

test('§4.2 並び順はサーバー側（マイリスト順・スコア順。評価なしは末尾）。タグはすべて含むものだけ', async ({ request }) => {
  const t = token();
  const channelName = `[E2E] 並び順 ${t}`;
  const channelId = await seedChannel(channelName);
  const tagA = `e2e-tag-a-${t}`;
  const tagB = `e2e-tag-b-${t}`;
  const ids = await seedPlaylists([
    { channelId, channelName, title: `${t}-low`, score: 3.0, mylistCount: 5, tagIds: [tagA] },
    { channelId, channelName, title: `${t}-high`, score: 4.5, mylistCount: 1, tagIds: [tagA, tagB] },
    { channelId, channelName, title: `${t}-none`, score: null, mylistCount: 9, tagIds: [tagA, tagB] },
  ]);
  try {
    const q = `q=${encodeURIComponent(t)}`;
    const byScore = await apiUntil<PlaylistPage>(request, `/api/catalog/playlists?${q}&sort=score`, (b) => b.total === 3);
    expect(byScore.items.map((i) => i.title)).toEqual([`${t}-high`, `${t}-low`, `${t}-none`]);
    const byMylist = (await (await request.get(`/api/catalog/playlists?${q}&sort=mylist`)).json()) as PlaylistPage;
    expect(byMylist.items.map((i) => i.title)).toEqual([`${t}-none`, `${t}-low`, `${t}-high`]);
    const both = (await (await request.get(`/api/catalog/playlists?${q}&tags=${tagA},${tagB}`)).json()) as PlaylistPage;
    expect(both.items.map((i) => i.title).sort()).toEqual([`${t}-high`, `${t}-none`]);
  } finally {
    await cleanup(ids, [channelId]);
  }
});

test('§2.2 Firestore の変更は数秒で一覧に反映され、掲載中でなくなったものは消える', async ({ request }) => {
  const t = token();
  const channelName = `[E2E] 反映 ${t}`;
  const channelId = await seedChannel(channelName);
  const [id] = await seedPlaylists([{ channelId, channelName, videoCount: 7 }]);
  try {
    const path = `/api/catalog/playlists?q=${encodeURIComponent(t)}`;
    await apiUntil<PlaylistPage>(request, path, (b) => b.total === 1 && b.totalVideoCount === 7);
    await e2eDb().collection('playlists').doc(id).update({ videoCount: 12 });
    await apiUntil<PlaylistPage>(request, path, (b) => b.totalVideoCount === 12);
    await e2eDb().collection('playlists').doc(id).update({ listingStatus: 'excluded' });
    await apiUntil<PlaylistPage>(request, path, (b) => b.total === 0);
  } finally {
    await cleanup([id], [channelId]);
  }
});

test('§3.2 チャンネルの一覧はサーバーで集計（掲載中だけの再生リスト数・動画数・ピックアップ最大3件）', async ({ guestPage, request }) => {
  const t = token();
  const channelName = `[E2E] シュウケイ ${t}`;
  const channelId = await seedChannel(channelName);
  const ids = await seedPlaylists([
    ...Array.from({ length: 4 }, (_, i) => ({ channelId, channelName, videoCount: 10, score: i + 1 })),
    { channelId, channelName, videoCount: 100, listingStatus: 'unconfirmed' },
  ]);
  try {
    type ChannelPage = { items: Array<{ id: string; playlistCount: number; videoCount: number; topPlaylists: Array<{ score: number | null }> }>; total: number };
    const body = await apiUntil<ChannelPage>(request, `/api/catalog/channels?q=${encodeURIComponent(`しゅうけい ${t}`)}`, (b) => b.total === 1 && b.items[0].playlistCount === 4);
    expect(body.items[0].videoCount).toBe(40);
    expect(body.items[0].topPlaylists.map((p) => p.score)).toEqual([4, 3, 2]);

    await openSearch(guestPage, '/channels', 'チャンネル名で検索', t);
    const card = guestPage.locator(`a[href="/channels/${channelId}"]`).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText('4 再生リスト');
  } finally {
    await cleanup(ids, [channelId]);
  }
});

test('§3.3 ゲームタイトルの一覧はサーバーで絞り込み（ジャンルはどれか・タグはすべて）', async ({ request }) => {
  const t = token();
  const genreA = `e2e-genre-a-${t}`;
  const genreB = `e2e-genre-b-${t}`;
  const tag = `e2e-gtag-${t}`;
  const g1 = await seedGame(`[E2E] ゲームA ${t}`, { genreId: genreA, gameTagIds: [tag] });
  const g2 = await seedGame(`[E2E] ゲームB ${t}`, { genreId: genreB });
  const g3 = await seedGame(`[E2E] ゲームC ${t}`, { genreId: null, gameTagIds: [tag] });
  try {
    type GamePage = { items: Array<{ id: string }>; total: number };
    const q = `q=${encodeURIComponent(t)}`;
    await apiUntil<GamePage>(request, `/api/catalog/games?${q}`, (b) => b.total === 3);
    const genres = (await (await request.get(`/api/catalog/games?${q}&genres=${genreA},${genreB}`)).json()) as GamePage;
    expect(genres.items.map((i) => i.id).sort()).toEqual([g1, g2].sort());
    const tagged = (await (await request.get(`/api/catalog/games?${q}&tags=${tag}`)).json()) as GamePage;
    expect(tagged.items.map((i) => i.id).sort()).toEqual([g1, g3].sort());
  } finally {
    await cleanup([], [], [g1, g2, g3]);
  }
});

test('§3.4 TOP はサーバーが選んだ分だけ返す（注目は最大40件・新着とタグは最大20件）', async ({ guestPage, request }) => {
  const t = token();
  const channelName = `[E2E] TOP ${t}`;
  const channelId = await seedChannel(channelName);
  // スコア満点・マイリスト最多で、注目の先頭に来るようにする。新着にも入る（登録日が今）
  const [id] = await seedPlaylists([{ channelId, channelName, score: 5, mylistCount: 999_999 }]);
  try {
    type Top = { playlists: Array<{ id: string }>; featured: { overall: string[]; byGenre: Record<string, string[]> }; newArrivals: string[]; tagPickups: Array<{ ids: string[] }> };
    const top = await apiUntil<Top>(request, '/api/catalog/top', (b) => b.featured.overall[0] === id);
    expect(top.featured.overall.length).toBeLessThanOrEqual(40);
    for (const ids of Object.values(top.featured.byGenre)) expect(ids.length).toBeLessThanOrEqual(40);
    expect(top.newArrivals.length).toBeLessThanOrEqual(20);
    expect(top.newArrivals).toContain(id);
    for (const p of top.tagPickups) expect(p.ids.length).toBeLessThanOrEqual(20);
    const all = new Set(top.playlists.map((p) => p.id));
    for (const pid of [...top.featured.overall, ...top.newArrivals]) expect(all.has(pid)).toBe(true);

    // 未ログインの TOP の注目の再生リストに出る（カルーセルは最大20件）
    await guestPage.goto('/');
    const featured = guestPage.locator('section').filter({ has: guestPage.getByRole('heading', { name: '注目の再生リスト' }) });
    await expect(featured.locator(`a[href="/playlists/${id}"]`).first()).toBeVisible({ timeout: 30_000 });
    expect(await featured.locator('a[href^="/playlists/"]').count()).toBeLessThanOrEqual(20);
  } finally {
    await cleanup([id], [channelId]);
  }
});

test('ゲーム/チャンネル詳細: 一覧は20件ずつ、件数と総動画数は掲載中の全体', async ({ guestPage }) => {
  const t = token();
  const channelName = `[E2E] 詳細 ${t}`;
  const gameTitle = uniqueText('詳細のゲーム');
  const channelId = await seedChannel(channelName);
  const gameId = await seedGame(gameTitle);
  const ids = await seedPlaylists([
    ...Array.from({ length: 21 }, () => ({ channelId, channelName, gameId, gameName: gameTitle, videoCount: 3 })),
    { channelId, channelName, gameId, gameName: gameTitle, videoCount: 50, listingStatus: 'non_game' },
  ]);
  try {
    await guestPage.goto(`/channels/${channelId}`);
    await expect(guestPage.getByText('21 再生リスト')).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByText('63 動画')).toBeVisible();
    await expect(guestPage.locator('a[href^="/playlists/PLE2E"]')).toHaveCount(20);
    await guestPage.getByRole('navigation', { name: 'ページ送り' }).getByRole('button', { name: '2', exact: true }).click();
    await expect(guestPage.locator('a[href^="/playlists/PLE2E"]')).toHaveCount(1);

    await guestPage.goto(`/games/${gameId}`);
    await expect(guestPage.getByText('63 動画')).toBeVisible({ timeout: 30_000 });
    await expect(guestPage.getByText(/^21件$/)).toBeVisible();
  } finally {
    await cleanup(ids, [channelId], [gameId]);
  }
});
