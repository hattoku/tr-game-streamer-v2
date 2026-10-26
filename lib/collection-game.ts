// 収集候補の承認で、ゲーム推定なしの候補のゲームタイトルを用意する（サーバー専用）。
// 管理 AI運営者向け収集候補レビューUI仕様書 v2.1 §4.3、管理_Ai運営者 コンテンツ収集機能仕様書 v3.1 §3.6。
// 承認画面で確定したゲーム名（既定は候補の gameQuery）で、登録済みのゲームタイトルを正規化して照合し、
// 無ければ新規登録する。楽天ブックスでタイトルが一致する商品が見つかれば、パッケージ画像・商品ページURL・
// 機種・ジャンル・テーマも入れる（見つからない・失敗したときは名前だけで登録する）。
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { normalizeForMatch } from './exploration-rules';
import { resolveRakutenGenre, searchRakutenGames, type RakutenGameSearchResult } from './rakuten';
import { normalizeRakutenBooksItemUrl, normalizeRakutenGameTitle, toMasterThemeName } from './rakuten-shared';
import { PLATFORM_OPTIONS } from './game-shared';

/** ゲームタイトル名の上限（ゲームタイトル新規登録と同じ。lib/admin-game-input.ts） */
export const MAX_GAME_TITLE_LENGTH = 100;

// 楽天ブックスAPIのレートリミット（1req/秒）に掛からないよう、呼び出しの間隔をあける
const RAKUTEN_INTERVAL_MS = 1100;

export interface CollectionGameResolver {
  /** ゲーム名から gameId を返す（既存に一致すればそのID、無ければ新規登録したID） */
  resolve(title: string): Promise<{ gameId: string; created: boolean }>;
}

/**
 * 1回の承認リクエスト分のリゾルバを作る。games 全件と genres・themes マスタを最初に1回だけ読み、
 * 同じリクエストの中で同じゲーム名が複数あっても新規登録は1回にする。
 */
export async function createCollectionGameResolver(): Promise<CollectionGameResolver> {
  const [gamesSnap, genresSnap, themesSnap] = await Promise.all([
    adminDb.collection('games').get(),
    adminDb.collection('genres').get(),
    adminDb.collection('themes').get(),
  ]);
  const gameIdByNormalized = new Map<string, string>();
  for (const d of gamesSnap.docs) {
    const key = normalizeForMatch((d.data().title as string) ?? '');
    if (key && !gameIdByNormalized.has(key)) gameIdByNormalized.set(key, d.id);
  }
  const genreByName = new Map(genresSnap.docs.map((d) => [d.data().name as string, d.id]));
  const themeByName = new Map(themesSnap.docs.map((d) => [d.data().name as string, d.id]));
  let lastRakutenCallAt = 0;

  async function throttle() {
    const wait = lastRakutenCallAt + RAKUTEN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRakutenCallAt = Date.now();
  }

  /** 正規化したタイトルが完全に一致する楽天ブックスの商品（機種違いが複数あれば先頭） */
  async function findRakutenItem(title: string, key: string): Promise<RakutenGameSearchResult | null> {
    try {
      await throttle();
      const results = await searchRakutenGames(title);
      return results.find((r) => normalizeForMatch(normalizeRakutenGameTitle(r.title)) === key) ?? null;
    } catch (e) {
      console.error('収集候補のゲーム登録で楽天ブックス検索に失敗', title, e);
      return null;
    }
  }

  async function resolve(rawTitle: string): Promise<{ gameId: string; created: boolean }> {
    const title = rawTitle.trim();
    const key = normalizeForMatch(title);
    const existing = gameIdByNormalized.get(key);
    if (existing) return { gameId: existing, created: false };

    const item = await findRakutenItem(title, key);
    let genreId: string | null = null;
    let genreName: string | null = null;
    const themeIds: string[] = [];
    if (item?.booksGenreId) {
      await throttle();
      const genre = await resolveRakutenGenre(item.booksGenreId);
      if (genre) {
        genreId = genreByName.get(genre.genreName) ?? null;
        genreName = genreId ? genre.genreName : null;
        const themeId = genre.themeName ? themeByName.get(toMasterThemeName(genre.themeName)) : undefined;
        if (themeId) themeIds.push(themeId);
      }
    }
    const hardware = item?.hardware.trim() ?? '';

    const now = new Date();
    const gameRef = adminDb.collection('games').doc();
    const batch = adminDb.batch();
    batch.set(gameRef, {
      rakutenItemCode: null,
      rakutenItemName: null,
      title,
      aliases: [],
      packageImageUrl: item?.imageUrl || null,
      rakutenUrl: item?.itemUrl ? normalizeRakutenBooksItemUrl(item.itemUrl) : null,
      description: null,
      isAiGeneratedDescription: false,
      platforms: PLATFORM_OPTIONS.includes(hardware) ? [hardware] : [],
      genreId,
      genreName,
      themeIds,
      gameTagIds: [],
      gameTagsFixed: [],
      playlistCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    if (genreId) {
      batch.update(adminDb.collection('genres').doc(genreId), { gameTitleCount: FieldValue.increment(1) });
    }
    for (const id of themeIds) {
      batch.update(adminDb.collection('themes').doc(id), { gameTitleCount: FieldValue.increment(1) });
    }
    await batch.commit();

    gameIdByNormalized.set(key, gameRef.id);
    return { gameId: gameRef.id, created: true };
  }

  return { resolve };
}
