// プロフィールのレビュー履歴に出す投稿（ページ 設定 プロフィール仕様書 v1.10 §8.1・§5.3・§6.2）の確認項目。
// 星評価をつけた投稿、またはコメントを投稿したものだけを出し、視聴ステータスだけの投稿は出さない。
// 統計のレビュー投稿数とジャンル分布も同じ定義で数える。
// 架空の利用者（users）・ゲーム・再生リスト・レビューは Admin SDK で直接作り、終了時に自分で消す（名前は [E2E] で始まる）。
import { expect, test } from './support/fixtures';
import { db } from './support/cleanup';
import { randomId } from './support/collection';
import type { ProfileJson } from '../lib/profile-shared';

/** 後始末するドキュメントの参照（コレクション名とID） */
type Ref = [string, string];

const refs: Ref[] = [];
let userId = '';
let starOnlyPlaylist = '';
let commentOnlyPlaylist = '';
let statusOnlyPlaylist = '';
const STATUS_ONLY_GENRE = '[E2E] 視聴ステータスだけのジャンル';
const REVIEWED_GENRE = '[E2E] レビューしたジャンル';

async function set(collection: string, id: string, data: FirebaseFirestore.DocumentData) {
  await db().collection(collection).doc(id).set(data);
  refs.push([collection, id]);
}

async function game(genreName: string): Promise<string> {
  const id = randomId('e2e-game-');
  await set('games', id, { title: `[E2E] ゲーム ${id}`, genreId: null, genreName, playlistCount: 0 });
  return id;
}

async function playlist(title: string, gameId: string | null): Promise<string> {
  const id = randomId('PLE2E');
  await set('playlists', id, {
    title: `[E2E] ${title} ${id}`, thumbnailUrl: '', channelId: null, channelName: '', channelIconUrl: '',
    gameId, gameName: gameId ? '[E2E] ゲーム' : '', gameGenreIds: [], videoCount: 3, registeredAt: new Date(), registeredBy: 'e2e',
    isPublic: true, score: null, reviewCount: 1, mylistCount: 0, playlistTagIds: [], playlistTagsFixed: [],
    listingStatus: 'listed', source: 'admin',
  });
  return id;
}

async function review(playlistId: string, fields: { starRating: number | null; watchStatus: string | null; comment: string | null }, postedAt: Date) {
  const id = `${userId}_${playlistId}`;
  await set('reviews', id, {
    userId, playlistId, ...fields, hasSpoiler: false, helpfulCount: 0, trustScore: 1, userDisplayName: '[E2E] プロフィール',
    isHidden: false, postedAt, updatedAt: postedAt,
  });
}

test.beforeAll(async () => {
  userId = randomId('e2e-prof-');
  await set('users', userId, {
    displayName: '[E2E] プロフィール', bio: null, profileImageUrl: null, accountCreatedAt: new Date(),
    isMylistPublic: true, isReviewHistoryPublic: true, isBanned: false,
  });
  const reviewedGame = await game(REVIEWED_GENRE);
  const statusOnlyGame = await game(STATUS_ONLY_GENRE);
  starOnlyPlaylist = await playlist('星だけ', reviewedGame);
  commentOnlyPlaylist = await playlist('コメントだけ', null);
  statusOnlyPlaylist = await playlist('視聴ステータスだけ', statusOnlyGame);
  const now = Date.now();
  await review(starOnlyPlaylist, { starRating: 4, watchStatus: 'completed', comment: null }, new Date(now - 3000));
  await review(commentOnlyPlaylist, { starRating: null, watchStatus: null, comment: '[E2E] コメントだけのレビュー' }, new Date(now - 2000));
  await review(statusOnlyPlaylist, { starRating: null, watchStatus: 'watching', comment: null }, new Date(now - 1000));
});

test.afterAll(async () => {
  const batch = db().batch();
  refs.forEach(([c, id]) => batch.delete(db().collection(c).doc(id)));
  await batch.commit();
});

test.describe('レビュー履歴は星評価かコメントがある投稿だけ（プロフィール仕様書 v1.10 §8.1）', () => {
  test('API: 視聴ステータスだけの投稿はレビュー履歴・レビュー投稿数・ジャンル分布に入らない（§5.3・§6.2）', async ({ guestPage }) => {
    const res = await guestPage.request.get(`/api/users/${userId}/profile`);
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as ProfileJson;
    const ids = (body.reviews ?? []).map((r) => r.playlist.id);
    // 新着順（§8.5）。星だけ・コメントだけの2件
    expect(ids).toEqual([commentOnlyPlaylist, starOnlyPlaylist]);
    expect(ids).not.toContain(statusOnlyPlaylist);
    expect(body.stats.reviewCount).toBe(2);
    const genreNames = body.genres.map((g) => g.name);
    expect(genreNames).toContain(REVIEWED_GENRE);
    expect(genreNames).not.toContain(STATUS_ONLY_GENRE);
  });

  test('画面: 見出しの件数とカードに視聴ステータスだけの投稿が出ない', async ({ guestPage }) => {
    await guestPage.goto(`/profile/${userId}`);
    const section = guestPage.locator('section').filter({ has: guestPage.getByRole('heading', { name: /^レビュー履歴/ }) });
    await expect(section.getByRole('heading', { name: /^レビュー履歴/ })).toContainText('2件');
    // カードのタイトルのリンクで見る（コメント本文にも「[E2E] コメントだけ」が入るため本文では探さない）
    await expect(section.getByRole('link', { name: /\[E2E\] 星だけ/ })).toBeVisible();
    await expect(section.getByRole('link', { name: /\[E2E\] コメントだけ/ })).toBeVisible();
    await expect(section.getByText('[E2E] コメントだけのレビュー')).toBeVisible();
    await expect(section.getByRole('link', { name: /\[E2E\] 視聴ステータスだけ/ })).toHaveCount(0);
    // 統計のレビュー投稿数も2件
    const stat = guestPage.locator('section[aria-label="統計情報"]').getByText('レビュー投稿数').locator('..');
    await expect(stat).toContainText('2');
  });
});
