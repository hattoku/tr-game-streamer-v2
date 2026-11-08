// 人気のチャンネル（リブランディング段階5）の確認項目。共通 人気のチャンネル 集計 仕様書の各節と、
// ページ top 仕様書 v2.2 §4.2・§6A、ページ チャンネル 探す 仕様書 v2.2 §9.2・§9.3、ページ チャンネル 詳細 仕様書 v1.10 §8.2、
// 共通 uiコンポーネント フロント 仕様書 v2.1 §2.4・§2.7・§3.3、管理 AI運営者向け収集候補レビューUI仕様書 v3.4 §9.2。
// 再生リスト・チャンネル・マイリスト・レビュー・視聴履歴は Admin SDK で直接作り、終了時に自分で消す（名前は [E2E] で始まる）。
// 集計は stg 全体に効くため、集計するテストは desktop だけで順番に実行する。
import type { APIRequestContext, Page } from '@playwright/test';
import { captureIdToken, expect, hasHorizontalScroll, test } from './support/fixtures';
import { db as e2eDb } from './support/cleanup';
import { randomId } from './support/collection';

const DAY_MS = 24 * 60 * 60 * 1000;

function token() {
  return Math.random().toString(36).slice(2, 10);
}

/** 後始末するドキュメントの参照（コレクション名とID） */
type Ref = [string, string];

class Seed {
  readonly refs: Ref[] = [];

  async channel(name: string): Promise<string> {
    const id = randomId('UCE2E');
    await e2eDb().collection('channels').doc(id).set({
      youtubeChannelId: id, name, iconUrl: '', description: null, isAiGeneratedDescription: false, subscriberCount: null,
      playlistCount: 0, registeredAt: new Date(), lastFetchedAt: null,
    });
    this.refs.push(['channels', id]);
    return id;
  }

  async playlist(channelId: string, channelName: string, extra: { listingStatus?: string; reviewCount?: number; mylistCount?: number } = {}): Promise<string> {
    const id = randomId('PLE2E');
    await e2eDb().collection('playlists').doc(id).set({
      title: `[E2E] 人気の再生リスト ${id}`, thumbnailUrl: '', channelId, channelName, channelIconUrl: '',
      gameId: null, gameName: '', gameGenreIds: [], gameHint: null, gameSetBy: null, gameSetAt: null,
      videoCount: 10, latestVideoPublishedAt: null, registeredAt: new Date(), registeredBy: 'e2e', proposedBy: null,
      isPublic: true, score: null, reviewCount: extra.reviewCount ?? 0, mylistCount: extra.mylistCount ?? 0, playlistTagIds: [], playlistTagsFixed: [],
      referenceUrl: '', lastFetchedAt: null,
      listingStatus: extra.listingStatus ?? 'listed', listingReason: 'e2e', listingSetBy: 'admin', listingSetAt: new Date(),
      previousListingStatus: null, source: 'admin', explorationChannelId: null,
    });
    this.refs.push(['playlists', id]);
    return id;
  }

  async mylist(userId: string, playlistId: string, createdAt = new Date()) {
    const id = `${userId}_${playlistId}`;
    await e2eDb().collection('mylist').doc(id).set({ userId, playlistId, watchStatus: 'want_to_watch', isReverseOrder: false, createdAt, updatedAt: createdAt });
    this.refs.push(['mylist', id]);
  }

  async review(userId: string, playlistId: string, extra: { isHidden?: boolean; postedAt?: Date } = {}) {
    const id = `${userId}_${playlistId}`;
    const postedAt = extra.postedAt ?? new Date();
    await e2eDb().collection('reviews').doc(id).set({
      userId, playlistId, starRating: 4, watchStatus: null, comment: '[E2E] 人気の集計のレビュー', hasSpoiler: false, helpfulCount: 0,
      trustScore: 1, userDisplayName: '[E2E]', isHidden: extra.isHidden ?? false, postedAt, updatedAt: postedAt,
    });
    this.refs.push(['reviews', id]);
  }

  async watch(userId: string, playlistId: string, videoId: string, watchedAt = new Date()) {
    const id = `${userId}_${videoId}`;
    await e2eDb().collection('watch_history').doc(id).set({ userId, playlistId, youtubeVideoId: videoId, progressPercent: 10, watchedAt });
    this.refs.push(['watch_history', id]);
    // 集計が作る「見始めた」記録も消す
    this.refs.push(['playlist_viewers', `${userId}_${playlistId}`]);
  }

  async pin(youtubeChannelId: string, name: string, featuredOrder: number) {
    const ref = e2eDb().collection('exploration_channels').doc();
    await ref.set({
      name, status: 'active', youtubeChannelId, channelTitle: name, channelIconUrl: '', subscriberCount: null, searchCandidates: [], tagIds: [],
      publishMode: 'confirm', featuredOrder, authorizedVia: 'admin', createdAt: new Date(), createdBy: 'e2e', updatedAt: new Date(),
    });
    this.refs.push(['exploration_channels', ref.id]);
  }

  async cleanup() {
    for (let i = 0; i < this.refs.length; i += 400) {
      const batch = e2eDb().batch();
      this.refs.slice(i, i + 400).forEach(([c, id]) => batch.delete(e2eDb().collection(c).doc(id)));
      await batch.commit();
    }
  }
}

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

interface ChannelPage {
  items: Array<{ id: string; name: string; playlistCount: number; reviewCount: number }>;
  total: number;
}

interface TopBody {
  popularChannels: Array<{ id: string; name: string; playlistCount: number }>;
}

/** 管理者のトークンで集計の API を呼ぶ */
async function recompute(adminPage: Page): Promise<{ processedCount: number; updatedChannelCount: number; newViewerCount: number }> {
  const idToken = await captureIdToken(adminPage, '/admin/collection/channels');
  const res = await adminPage.request.post('/api/admin/popularity/recompute', { headers: { Authorization: `Bearer ${idToken}` }, timeout: 120_000 });
  expect(res.status()).toBe(200);
  return res.json();
}

async function popularityOf(channelId: string) {
  return (await e2eDb().collection('channels').doc(channelId).get()).get('popularity') as Record<string, number> | undefined;
}

test.describe('集計と並び（desktop だけ）', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '集計は stg 全体に効くため desktop だけで実行する');
  });

  test('集計 §2.1・§2.2: 掲載中の再生リストについて、同じ人は1人・非表示のレビューは数えず、直近30日を加点して人気順に並ぶ', async ({ adminPage, request }) => {
    test.setTimeout(240_000);
    const t = token();
    const seed = new Seed();
    const u = (n: number) => `e2e-pop-${t}-u${n}`;
    try {
      const nameA = `[E2E] 人気集計 ${t} A`;
      const nameB = `[E2E] 人気集計 ${t} B`;
      const nameC = `[E2E] 人気集計 ${t} C`;
      const [a, b, c] = await Promise.all([seed.channel(nameA), seed.channel(nameB), seed.channel(nameC)]);
      const [a1, a2, aOff, b1] = await Promise.all([
        seed.playlist(a, nameA),
        seed.playlist(a, nameA),
        seed.playlist(a, nameA, { listingStatus: 'unconfirmed' }),
        seed.playlist(b, nameB),
      ]);
      await seed.playlist(c, nameC);
      await Promise.all([
        // A: u1 は2つの再生リストに入れても1人。掲載していない再生リスト（aOff）の u5 は数えない → マイリスト 2人（直近 2人）
        seed.mylist(u(1), a1),
        seed.mylist(u(1), a2),
        seed.mylist(u(2), a1),
        seed.mylist(u(5), aOff),
        // B: レビュー u1（u2 は通報で非表示なので数えない）・40日前のマイリスト u3・視聴 u4（動画2本でも1人）
        seed.review(u(1), b1),
        seed.review(u(2), b1, { isHidden: true }),
        seed.mylist(u(3), b1, new Date(Date.now() - 40 * DAY_MS)),
        seed.watch(u(4), b1, `v1${t}`),
        seed.watch(u(4), b1, `v2${t}`),
      ]);

      const summary = await recompute(adminPage);
      expect(summary.newViewerCount).toBeGreaterThanOrEqual(1);

      expect(await popularityOf(a)).toMatchObject({ mylistUsers: 2, recentMylistUsers: 2, reviewUsers: 0, viewerUsers: 0 });
      expect(await popularityOf(b)).toMatchObject({
        mylistUsers: 1, recentMylistUsers: 0, reviewUsers: 1, recentReviewUsers: 1, viewerUsers: 1, recentViewerUsers: 1,
      });
      // 一度も数が付かなかったチャンネルは書かない
      expect(await popularityOf(c)).toBeUndefined();

      // 点数: A = 2+2 = 4、B = (1+0)+(1+1)+(1+1) = 5、C = 0 → B・A・C の順（§5）
      const page = await apiUntil<ChannelPage>(request, `/api/catalog/channels?q=${encodeURIComponent(`人気集計 ${t}`)}`, (body) => body.items[0]?.id === b);
      expect(page.items.map((i) => i.id)).toEqual([b, a, c]);

      // §2.3 視聴履歴を消しても「見始めた」記録は残る
      await e2eDb().collection('watch_history').doc(`${u(4)}_v1${t}`).delete();
      await e2eDb().collection('watch_history').doc(`${u(4)}_v2${t}`).delete();
      await recompute(adminPage);
      expect(await popularityOf(b)).toMatchObject({ viewerUsers: 1 });
      expect((await e2eDb().collection('playlist_viewers').doc(`${u(4)}_${b1}`).get()).exists).toBe(true);
    } finally {
      await seed.cleanup();
    }
  });

  test('並び §5: ピン留めしたチャンネルは人気の点数に関係なく先頭に、数字の小さい順に出る（すぐ反映）', async ({ request }) => {
    const t = token();
    const seed = new Seed();
    try {
      const names = ['P', 'Q', 'R'].map((x) => `[E2E] ピン留め ${t} ${x}`);
      const [p, q, r] = await Promise.all(names.map((n) => seed.channel(n)));
      await Promise.all([seed.playlist(p, names[0]), seed.playlist(q, names[1]), seed.playlist(q, names[1]), seed.playlist(r, names[2])]);
      const path = `/api/catalog/channels?q=${encodeURIComponent(`ピン留め ${t}`)}`;
      // ピン留めなし: 点数はどれも0なので再生リストの多い Q が先頭
      await apiUntil<ChannelPage>(request, path, (b) => b.total === 3 && b.items[0].id === q);

      await seed.pin(r, names[2], 2);
      await seed.pin(p, names[0], 1);
      const pinned = await apiUntil<ChannelPage>(request, path, (b) => b.items[0]?.id === p && b.items[1]?.id === r);
      expect(pinned.items.map((i) => i.id)).toEqual([p, r, q]);

      // 他の並び（再生リスト登録数順）ではピン留めを使わない
      const byCount = (await (await request.get(`${path}&sort=playlistCount`)).json()) as ChannelPage;
      expect(byCount.items[0].id).toBe(q);
    } finally {
      await seed.cleanup();
    }
  });

  test('管理画面 §9.2: ピン留めの入力と人気の点数を出し、「人気の数字を今すぐ集計する」で集計できる', async ({ adminPage }) => {
    test.setTimeout(180_000);
    await adminPage.goto('/admin/collection/channels');
    await adminPage.getByRole('tab', { name: /登録済み/ }).click();
    await expect(adminPage.getByTestId('popularity-last-run')).toBeVisible();
    const button = adminPage.getByRole('button', { name: '人気の数字を今すぐ集計する' });
    const response = adminPage.waitForResponse((r) => r.url().includes('/api/admin/popularity/recompute'), { timeout: 120_000 });
    await button.click();
    expect((await response).status()).toBe(200);
    await expect(adminPage.getByText(/チャンネルを集計しました/)).toBeVisible();
    await expect(adminPage.getByTestId('popularity-last-run')).not.toContainText('最後に集計 -');
    // 登録済みのチャンネルがあれば、行にピン留めの入力と人気の点数が出る
    const rows = adminPage.getByTestId('channel-popularity');
    if ((await rows.count()) > 0) {
      await expect(rows.first()).toContainText(/人気 \d+点/);
      await expect(adminPage.getByLabel(/のピン留め$/).first()).toBeVisible();
    }
  });
});

test('TOP §6A: 「人気のチャンネル」にピン留めしたチャンネルが出て、カードからチャンネル詳細へ行ける', async ({ guestPage, request }, testInfo) => {
  test.setTimeout(120_000);
  const t = token();
  const seed = new Seed();
  try {
    const name = `[E2E] TOP人気 ${t}`;
    const id = await seed.channel(name);
    await seed.playlist(id, name);
    await seed.playlist(id, name);
    // stg にある他のピン留めより前に出す（desktop と mobile が同時に走っても重ならない値）
    await seed.pin(id, name, testInfo.project.name === 'desktop' ? -2_000_000 : -1_000_000);
    await apiUntil<TopBody>(request, '/api/catalog/top', (b) => b.popularChannels.slice(0, 2).some((c) => c.id === id));

    await guestPage.goto('/');
    const section = guestPage.getByRole('group', { name: '人気のチャンネル' });
    const card = section.locator(`a[href="/channels/${id}"]`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText(name);
    await expect(card).toContainText('再生リスト 2');
    // セクションは「注目の再生リスト」より上（§3）
    const popularTop = (await section.boundingBox())!.y;
    const featured = guestPage.getByRole('heading', { name: '注目の再生リスト' });
    if (await featured.isVisible()) expect(popularTop).toBeLessThan((await featured.boundingBox())!.y);
    expect(await hasHorizontalScroll(guestPage)).toBe(false);

    await card.click();
    await expect(guestPage).toHaveURL(new RegExp(`/channels/${id}$`));
    await expect(guestPage.getByRole('heading', { level: 1, name })).toBeVisible();
  } finally {
    await seed.cleanup();
  }
});

test('TOP §4.2: キャッチコピーと検索バーのプレースホルダーが新しい文言', async ({ guestPage }) => {
  await guestPage.goto('/');
  await expect(guestPage.getByText('人気のゲーム実況者のシリーズを、最初から・続きから。').first()).toBeVisible();
  await expect(guestPage.getByPlaceholder('チャンネル名・ゲームタイトルで検索')).toBeVisible();
});

test('チャンネル §9.3・詳細 §8.2: カードにレビュー合計、詳細にレビュー合計とマイリスト合計が出る', async ({ guestPage }) => {
  const t = token();
  const seed = new Seed();
  try {
    const name = `[E2E] 合計 ${t}`;
    const id = await seed.channel(name);
    await seed.playlist(id, name, { reviewCount: 3, mylistCount: 4 });
    await seed.playlist(id, name, { reviewCount: 2, mylistCount: 1 });
    // 掲載していない再生リストは数えない
    await seed.playlist(id, name, { listingStatus: 'unconfirmed', reviewCount: 10, mylistCount: 10 });

    await guestPage.goto('/channels');
    await guestPage.getByLabel('チャンネル名で検索').filter({ visible: true }).fill(`合計 ${t}`);
    const card = guestPage.locator(`a[href="/channels/${id}"]`).first();
    await expect(card).toContainText('5 レビュー', { timeout: 30_000 });
    await expect(card).toContainText('2 再生リスト');

    await guestPage.goto(`/channels/${id}`);
    await expect(guestPage.getByTestId('channel-review-total')).toHaveText('5 レビュー', { timeout: 30_000 });
    await expect(guestPage.getByTestId('channel-mylist-total')).toHaveText('5 マイリスト');
  } finally {
    await seed.cleanup();
  }
});

test('チャンネル §9.2: 既定のソートは「人気順」', async ({ guestPage }) => {
  await guestPage.goto('/channels');
  await expect(guestPage.getByRole('button', { name: '並び替え' }).first()).toContainText('人気順');
});

test('ナビ §2.4・§3.3（PC）: グローバルナビとフッターのサービスはチャンネルが先頭、フッターの説明は新しい文言', async ({ guestPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'グローバルナビ・フッターは PC 幅で確認する');
  await guestPage.goto('/');
  const nav = guestPage.getByRole('navigation', { name: 'グローバルナビゲーション' });
  await expect(nav.getByRole('link')).toHaveText(['チャンネルから探す', '再生リストを探す', 'ゲームから探す']);
  const footer = guestPage.locator('footer');
  await expect(footer.getByText('人気のゲーム実況者のシリーズを、最初から・続きから。')).toBeVisible();
  const service = footer.getByRole('link', { name: /から探す|を探す/ });
  await expect(service).toHaveText(['チャンネル名から探す', '再生リストを探す', 'ゲームタイトルから探す']);
});

test('ナビ §2.7（モバイル）: ボトムタブ「さがす」はチャンネルへ、さがすタブはチャンネルが先頭', async ({ guestPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'ボトムタブはモバイル幅で確認する');
  await guestPage.goto('/');
  await guestPage.getByRole('navigation', { name: 'メインナビゲーション' }).getByRole('link', { name: 'さがす' }).click();
  await expect(guestPage).toHaveURL(/\/channels$/);
  const tabs = guestPage.getByRole('navigation', { name: 'さがす' }).getByRole('link');
  await expect(tabs.first()).toHaveAttribute('href', '/channels');
  await expect(tabs.nth(1)).toHaveAttribute('href', '/playlists');
  await expect(tabs.nth(2)).toHaveAttribute('href', '/games');
});
