// 収集候補の承認で、ゲーム推定なしの候補のゲームタイトルを用意する（サーバー専用）。
// 管理 AI運営者向け収集候補レビューUI仕様書 v2.1 §4.3、管理_Ai運営者 コンテンツ収集機能仕様書 v3.1 §3.6。
// 承認画面で確定したゲーム名（既定は候補の gameQuery）で、登録済みのゲームタイトル（タイトル・別名）を正規化して
// 照合し、無ければ新規登録する。楽天ブックスでタイトルが一致する商品が見つかれば、パッケージ画像・商品ページURL・
// 機種・ジャンル・テーマも入れる（見つからない・失敗したときは名前だけで登録する）。
// 新規登録したのに、同じリクエストで再生リストを1件も登録できなかったゲームタイトルは discardUnused で消す。
// v2.2 §3.7: 承認前に画面で楽天ブックスの商品を選べる。選んだ商品（JAN）を渡されたらそれを使い、
// 「楽天なし」を渡されたら楽天を検索せず名前だけで登録する。何も渡されなければ従来どおり完全一致で探す。
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { normalizeForMatch } from './exploration-rules';
import { resolveRakutenGenre, searchRakutenGames, searchRakutenGamesByJan, type RakutenGameSearchResult } from './rakuten';
import { normalizeRakutenBooksItemUrl, normalizeRakutenGameTitle, toMasterThemeName } from './rakuten-shared';
import { PLATFORM_OPTIONS } from './game-shared';

/** ゲームタイトル名の上限（ゲームタイトル新規登録と同じ。lib/admin-game-input.ts） */
export const MAX_GAME_TITLE_LENGTH = 100;

// 楽天ブックスAPIのレートリミット（1req/秒）に掛からないよう、呼び出しの間隔をあける
const RAKUTEN_INTERVAL_MS = 1100;

/**
 * 新規登録するゲームに結び付ける楽天ブックスの商品。
 * undefined: 名前が完全一致する商品を探す／string: 画面で選んだ商品のJAN／null: 楽天なし（名前だけで登録）
 */
export type RakutenChoice = string | null | undefined;

export interface CollectionGameResolver {
  /** ゲーム名から gameId を返す（既存に一致すればそのID、無ければ新規登録したID） */
  resolve(title: string, rakuten?: RakutenChoice): Promise<{ gameId: string; created: boolean }>;
  /** 再生リストの登録に成功したことを記録する（このリクエストで新規登録したゲームを残す対象にする） */
  markUsed(gameId: string): void;
  /** このリクエストで新規登録し、再生リストが1件も付かなかったゲームタイトルを消し、消したIDを返す */
  discardUnused(): Promise<string[]>;
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
  // タイトルを先に入れ、別名は同じ語のタイトルが無いときだけ使う
  const gameIdByNormalized = new Map<string, string>();
  for (const d of gamesSnap.docs) {
    const key = normalizeForMatch((d.data().title as string) ?? '');
    if (key && !gameIdByNormalized.has(key)) gameIdByNormalized.set(key, d.id);
  }
  for (const d of gamesSnap.docs) {
    for (const alias of (d.data().aliases as string[] | undefined) ?? []) {
      const key = normalizeForMatch(alias);
      if (key && !gameIdByNormalized.has(key)) gameIdByNormalized.set(key, d.id);
    }
  }
  const genreByName = new Map(genresSnap.docs.map((d) => [d.data().name as string, d.id]));
  const themeByName = new Map(themesSnap.docs.map((d) => [d.data().name as string, d.id]));
  let lastRakutenCallAt = 0;
  // ジャンルの解決結果（楽天のジャンルID→結果）。2回目以降は楽天を呼ばないので間隔待ちもしない
  const genreCache = new Map<string, Awaited<ReturnType<typeof resolveRakutenGenre>>>();
  // このリクエストで新規登録したゲーム（ID→ジャンル・テーマ。消すときに件数を戻すため）と、再生リストが付いたゲーム
  const created = new Map<string, { genreId: string | null; themeIds: string[]; key: string }>();
  const used = new Set<string>();

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

  /** 画面で選んだ商品をJANで取り直す（見つからない・失敗したときは名前だけで登録する） */
  async function findRakutenItemByJan(jan: string): Promise<RakutenGameSearchResult | null> {
    try {
      await throttle();
      const results = await searchRakutenGamesByJan(jan);
      return results.find((r) => r.jan === jan) ?? null;
    } catch (e) {
      console.error('収集候補のゲーム登録で楽天ブックスのJAN検索に失敗', jan, e);
      return null;
    }
  }

  async function resolve(rawTitle: string, rakuten?: RakutenChoice): Promise<{ gameId: string; created: boolean }> {
    const title = rawTitle.trim();
    const key = normalizeForMatch(title);
    const existing = gameIdByNormalized.get(key);
    if (existing) return { gameId: existing, created: false };

    const item = rakuten === null ? null : rakuten ? await findRakutenItemByJan(rakuten) : await findRakutenItem(title, key);
    let genreId: string | null = null;
    let genreName: string | null = null;
    const themeIds: string[] = [];
    if (item?.booksGenreId) {
      if (!genreCache.has(item.booksGenreId)) {
        await throttle();
        genreCache.set(item.booksGenreId, await resolveRakutenGenre(item.booksGenreId));
      }
      const genre = genreCache.get(item.booksGenreId);
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
    created.set(gameRef.id, { genreId, themeIds, key });
    return { gameId: gameRef.id, created: true };
  }

  async function discardUnused(): Promise<string[]> {
    const unused = [...created.entries()].filter(([id]) => !used.has(id));
    if (unused.length === 0) return [];
    const batch = adminDb.batch();
    for (const [id, game] of unused) {
      batch.delete(adminDb.collection('games').doc(id));
      if (game.genreId) {
        batch.update(adminDb.collection('genres').doc(game.genreId), { gameTitleCount: FieldValue.increment(-1) });
      }
      for (const themeId of game.themeIds) {
        batch.update(adminDb.collection('themes').doc(themeId), { gameTitleCount: FieldValue.increment(-1) });
      }
      gameIdByNormalized.delete(game.key);
    }
    await batch.commit();
    return unused.map(([id]) => id);
  }

  return { resolve, markUsed: (gameId) => used.add(gameId), discardUnused };
}

// ---- 承認前の楽天ブックス検索（v2.2 §3.7） ----

/** 候補に保存する楽天ブックスの商品（画面で選ぶのに必要な分だけ） */
export interface RakutenPick {
  jan: string;
  title: string;
  hardware: string;
  imageUrl: string;
  salesDate: string;
  /** 楽天ブックスの商品ページ（v2.3 で追加。それより前に保存した結果には無い） */
  itemUrl?: string;
}

/**
 * ゲーム名で楽天ブックスを検索するときの検索語。0件なら順に短くして探し直す。
 * 再生リスト名由来のゲーム名には「デッドライジングDR」のような略称・副題が付いていることが多いため、
 * 末尾の英数字の略称を外したもの、区切り（空白・コロン・中黒など）の前だけにしたものを続けて試す。
 */
export function rakutenQueriesFor(title: string): string[] {
  const base = title.normalize('NFKC').trim();
  const withoutSuffix = base.replace(/[\s\-_:・~〜]*[A-Za-z0-9]+$/, '').trim();
  const firstSegment = base.split(/[\s:：・~〜\-–—|｜]/)[0]?.trim() ?? '';
  const queries = [base];
  // 英数字だけの名前（Pacific Drive 等）は短くすると別の語（Pacific）になるので、日本語を含む場合だけ短くする
  if (withoutSuffix && /[^\x00-\x7F]/.test(withoutSuffix)) queries.push(withoutSuffix);
  if (firstSegment.length >= 2 && /[^\x00-\x7F]/.test(firstSegment)) queries.push(firstSegment);
  return [...new Set(queries.filter((q) => q.length >= 2))];
}

/** ゲーム名で楽天ブックスを検索する。0件なら検索語を短くして探し直す（呼び出しの間隔は1.1秒あける） */
export async function searchRakutenForGameTitle(title: string): Promise<{ query: string; items: RakutenPick[] }> {
  const queries = rakutenQueriesFor(title);
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, RAKUTEN_INTERVAL_MS));
    const results = await searchRakutenGames(queries[i]);
    if (results.some((r) => r.jan)) {
      return {
        query: queries[i],
        // JAN で取り直して登録するため、JAN の無い商品は選べないので外す
        items: results.filter((r) => r.jan).map((r) => ({ jan: r.jan, title: r.title, hardware: r.hardware, imageUrl: r.imageUrl, salesDate: r.salesDate, itemUrl: r.itemUrl })),
      };
    }
  }
  return { query: queries[0] ?? title, items: [] };
}
