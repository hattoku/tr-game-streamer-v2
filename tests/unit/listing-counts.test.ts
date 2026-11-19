// 件数の増減の計算（lib/listing-counts.ts）。
// Firestore データモデル設計書 §3.2・コンテンツ収集機能仕様書 §10.7（games.playlistCount・channels.playlistCount・
// tags.usagePlaylistCount は掲載中の再生リストだけを数える）、管理 マスタ管理仕様書 §7.1（genres・themes の gameTitleCount）。
import { describe, expect, it } from 'vitest';
import {
  gameMasterCountDeltas,
  hasCountDeltas,
  playlistCountDeltas,
  playlistCountStateOf,
  type PlaylistCountDeltas,
  type PlaylistCountState,
} from '@/lib/listing-counts';

const listed: PlaylistCountState = { listed: true, gameId: 'g1', channelId: 'UC1', tagIds: ['t1', 't2'] };
const unlisted: PlaylistCountState = { ...listed, listed: false };

/** 比べやすいよう Map を普通のオブジェクトにする */
function plain(d: PlaylistCountDeltas) {
  return { games: Object.fromEntries(d.games), channels: Object.fromEntries(d.channels), tags: Object.fromEntries(d.tags) };
}

describe('playlistCountStateOf（playlists のドキュメントから件数に関わる状態を取り出す）', () => {
  it('listed だけを掲載中として数える', () => {
    expect(playlistCountStateOf({ listingStatus: 'listed' }).listed).toBe(true);
    for (const status of ['unconfirmed', 'non_game', 'excluded', 'too_short', 'channel_off']) {
      expect(playlistCountStateOf({ listingStatus: status }).listed).toBe(false);
    }
  });

  it('listingStatus が無い移行前のドキュメントは掲載中として扱う', () => {
    expect(playlistCountStateOf({}).listed).toBe(true);
    expect(playlistCountStateOf({ listingStatus: null }).listed).toBe(true);
  });

  it('ゲーム未設定（gameId = null・空文字）はゲームの件数に数えない', () => {
    expect(playlistCountStateOf({ gameId: null }).gameId).toBeNull();
    expect(playlistCountStateOf({ gameId: '' }).gameId).toBeNull();
  });

  it('タグは文字列のIDだけを取り出す（無ければ空）', () => {
    expect(playlistCountStateOf({ playlistTagIds: ['t1', '', 3, 't2'] }).tagIds).toEqual(['t1', 't2']);
    expect(playlistCountStateOf({}).tagIds).toEqual([]);
  });
});

describe('playlistCountDeltas（変わる前に数えていた分を引き、変わった後に数える分を足す）', () => {
  it('登録（掲載中で作る）: ゲーム・チャンネル・固定タグがそれぞれ +1', () => {
    expect(plain(playlistCountDeltas(null, listed))).toEqual({ games: { g1: 1 }, channels: { UC1: 1 }, tags: { t1: 1, t2: 1 } });
  });

  it('掲載していない状態で作る（巡回の取り込み）: 件数は動かない', () => {
    expect(hasCountDeltas(playlistCountDeltas(null, unlisted))).toBe(false);
  });

  it('掲載する（listed に入る）: +1、掲載から外す（listed から出る）: -1', () => {
    expect(plain(playlistCountDeltas(unlisted, listed))).toEqual({ games: { g1: 1 }, channels: { UC1: 1 }, tags: { t1: 1, t2: 1 } });
    expect(plain(playlistCountDeltas(listed, unlisted))).toEqual({ games: { g1: -1 }, channels: { UC1: -1 }, tags: { t1: -1, t2: -1 } });
  });

  it('掲載するときに足したタグも、掲載後の状態として数える', () => {
    const after = { ...listed, tagIds: ['t1', 't2', 't3'] };
    expect(plain(playlistCountDeltas({ ...unlisted }, after)).tags).toEqual({ t1: 1, t2: 1, t3: 1 });
  });

  it('掲載中でない状態どうしの切り替え（確認待ち→ゲームではない など）: 件数は動かない', () => {
    expect(hasCountDeltas(playlistCountDeltas(unlisted, { ...unlisted, tagIds: [] }))).toBe(false);
  });

  it('掲載中のまま何も変わらない: 件数は動かない', () => {
    expect(hasCountDeltas(playlistCountDeltas(listed, { ...listed }))).toBe(false);
  });

  it('ゲームを付ける・外す・付け替える（掲載中）: ゲームの件数だけが動く', () => {
    const unset = { ...listed, gameId: null };
    expect(plain(playlistCountDeltas(unset, listed))).toEqual({ games: { g1: 1 }, channels: {}, tags: {} });
    expect(plain(playlistCountDeltas(listed, unset))).toEqual({ games: { g1: -1 }, channels: {}, tags: {} });
    expect(plain(playlistCountDeltas(listed, { ...listed, gameId: 'g2' }))).toEqual({ games: { g1: -1, g2: 1 }, channels: {}, tags: {} });
  });

  it('ゲームを付ける・外す・付け替える（掲載していない）: 件数は動かない', () => {
    expect(hasCountDeltas(playlistCountDeltas({ ...unlisted, gameId: null }, unlisted))).toBe(false);
    expect(hasCountDeltas(playlistCountDeltas(unlisted, { ...unlisted, gameId: 'g2' }))).toBe(false);
  });

  it('タグを付ける・外す（掲載中）: そのタグの件数だけが動く', () => {
    expect(plain(playlistCountDeltas(listed, { ...listed, tagIds: ['t1', 't2', 't3'] }))).toEqual({ games: {}, channels: {}, tags: { t3: 1 } });
    expect(plain(playlistCountDeltas(listed, { ...listed, tagIds: ['t2'] }))).toEqual({ games: {}, channels: {}, tags: { t1: -1 } });
  });

  it('タグを付ける・外す（掲載していない）: 件数は動かない（掲載したときにまとめて数える）', () => {
    expect(hasCountDeltas(playlistCountDeltas(unlisted, { ...unlisted, tagIds: ['t1', 't2', 't3'] }))).toBe(false);
  });

  it('同じタグが2つ入っていても1回だけ数える', () => {
    expect(plain(playlistCountDeltas(null, { ...listed, tagIds: ['t1', 't1'] })).tags).toEqual({ t1: 1 });
  });

  it('消す（掲載中のもの）: すべて -1', () => {
    expect(plain(playlistCountDeltas(listed, null))).toEqual({ games: { g1: -1 }, channels: { UC1: -1 }, tags: { t1: -1, t2: -1 } });
  });

  it('チャンネルが分からない再生リストは、チャンネルの件数を動かさない', () => {
    expect(plain(playlistCountDeltas(null, { ...listed, channelId: null })).channels).toEqual({});
  });
});

describe('gameMasterCountDeltas（genres・themes の gameTitleCount）', () => {
  it('ゲームタイトルの登録: ジャンルとテーマがそれぞれ +1', () => {
    const d = gameMasterCountDeltas(null, { genreId: 'action', themeIds: ['fantasy', 'horror'] });
    expect(Object.fromEntries(d.genres)).toEqual({ action: 1 });
    expect(Object.fromEntries(d.themes)).toEqual({ fantasy: 1, horror: 1 });
  });

  it('編集でジャンルを変えた: 前のジャンル -1、新しいジャンル +1。同じテーマは動かない', () => {
    const d = gameMasterCountDeltas({ genreId: 'action', themeIds: ['fantasy', 'horror'] }, { genreId: 'rpg', themeIds: ['fantasy', 'sf'] });
    expect(Object.fromEntries(d.genres)).toEqual({ action: -1, rpg: 1 });
    expect(Object.fromEntries(d.themes)).toEqual({ horror: -1, sf: 1 });
  });

  it('ジャンル未設定から設定・設定から未設定', () => {
    expect(Object.fromEntries(gameMasterCountDeltas({ genreId: null, themeIds: [] }, { genreId: 'rpg', themeIds: [] }).genres)).toEqual({ rpg: 1 });
    expect(Object.fromEntries(gameMasterCountDeltas({ genreId: 'rpg', themeIds: [] }, { genreId: null, themeIds: [] }).genres)).toEqual({ rpg: -1 });
  });

  it('何も変わらない編集: 件数は動かない', () => {
    const d = gameMasterCountDeltas({ genreId: 'rpg', themeIds: ['sf'] }, { genreId: 'rpg', themeIds: ['sf'] });
    expect(d.genres.size + d.themes.size).toBe(0);
  });
});
