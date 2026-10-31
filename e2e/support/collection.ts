// 収集候補（/admin/collection）の E2E で共用する、候補の用意と画面の部品の取り出し。
// 候補は Admin SDK で直接作る（YouTube に無い再生リストID）。再生リストタイトルが [E2E] で始まるので後始末の対象になる。
import type { Page } from '@playwright/test';
import { uniqueText } from './env';
import { db as e2eDb } from './cleanup';

export function randomId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** 推定なしの収集候補を作る。同じ channelTitle の候補は一覧で1つのチャンネルにまとまる */
export async function seedCandidate(params: {
  channelTitle: string;
  explorationChannelId: string;
  gameQuery: string;
  /** 実在の再生リストIDで作る（動画一覧の確認用）。既存の収集候補と重ならないIDを使うこと。省略時は YouTube に無いID */
  playlistId?: string;
  /** 承認前の楽天ブックス検索の結果を保存済みにする（v2.2 §3.7。自動検索を待たずに済む） */
  rakutenSearch?: { title: string; query: string; items: Array<{ jan: string; title: string; hardware: string; imageUrl: string; salesDate: string }> };
}): Promise<string> {
  const playlistId = params.playlistId ?? randomId('PLE2E');
  await e2eDb()
    .collection('collection_candidates')
    .doc(playlistId)
    .set({
      playlistId,
      playlistTitle: uniqueText('収集候補'),
      channelId: 'UCE2E',
      channelTitle: params.channelTitle,
      explorationChannelId: params.explorationChannelId,
      thumbnailUrl: '',
      videoCount: 12,
      playlistPublishedAt: new Date(),
      guessedGameId: null,
      guessedGameTitle: null,
      gameQuery: params.gameQuery,
      titleTagIds: [],
      source: 'channel',
      status: 'pending',
      collectedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      reviewComment: null,
      registeredPlaylistId: null,
      ...(params.rakutenSearch ? { rakutenSearch: { ...params.rakutenSearch, searchedAt: new Date() } } : {}),
    });
  return playlistId;
}

export async function gamesTitled(title: string) {
  return (await e2eDb().collection('games').where('title', '==', title).get()).docs;
}

export function section(page: Page, channelTitle: string) {
  return page.locator('section').filter({ hasText: channelTitle });
}
