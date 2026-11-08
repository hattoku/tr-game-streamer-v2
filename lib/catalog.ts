// 一覧のサーバー側検索（リブランディング段階7）の呼び出し側。API（app/api/catalog/*）を呼び、1ページ分を受け取る。
// 仕様: 共通 一覧のサーバー側検索 仕様書。検索条件が変わるたびに呼ぶため、古い応答が新しい応答を上書きしないよう
// useCatalogQuery で直前の呼び出しを取り消す。
'use client';

import { useEffect, useState } from 'react';
import type {
  CatalogPage,
  ChannelListItem,
  ChannelSort,
  GameListItem,
  GameSort,
  PlaylistSearchResult,
  PlaylistSort,
  TopCatalog,
} from './catalog-shared';

export class CatalogFetchError extends Error {}

async function getJson<T>(path: string, params: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') qs.set(key, String(value));
  }
  const query = qs.toString();
  const res = await fetch(query ? `${path}?${query}` : path, { signal, cache: 'no-store' });
  if (!res.ok) throw new CatalogFetchError(`一覧を読み込めませんでした（${res.status}）`);
  return (await res.json()) as T;
}

export interface PlaylistQuery {
  keyword?: string;
  tagIds?: string[];
  sort: PlaylistSort;
  page: number;
  gameId?: string;
  channelId?: string;
}

export function fetchPlaylistPage(q: PlaylistQuery, signal?: AbortSignal): Promise<PlaylistSearchResult> {
  return getJson(
    '/api/catalog/playlists',
    { q: q.keyword?.trim(), tags: q.tagIds?.join(','), sort: q.sort, page: q.page, gameId: q.gameId, channelId: q.channelId },
    signal,
  );
}

export interface ChannelQuery {
  keyword?: string;
  sort: ChannelSort;
  page: number;
}

export function fetchChannelPage(q: ChannelQuery, signal?: AbortSignal): Promise<CatalogPage<ChannelListItem>> {
  return getJson('/api/catalog/channels', { q: q.keyword?.trim(), sort: q.sort, page: q.page }, signal);
}

export interface GameQuery {
  keyword?: string;
  genreIds?: string[];
  tagIds?: string[];
  sort: GameSort;
  page: number;
}

export function fetchGamePage(q: GameQuery, signal?: AbortSignal): Promise<CatalogPage<GameListItem>> {
  return getJson(
    '/api/catalog/games',
    { q: q.keyword?.trim(), genres: q.genreIds?.join(','), tags: q.tagIds?.join(','), sort: q.sort, page: q.page },
    signal,
  );
}

export function fetchTopCatalog(signal?: AbortSignal): Promise<TopCatalog> {
  return getJson('/api/catalog/top', {}, signal);
}

export interface CatalogQueryState<T> {
  /** 最後に受け取った結果（読み込み中も前の結果を出し続ける）。最初の読み込みが終わるまでは null */
  data: T | null;
  /** 今の条件の結果を待っている */
  loading: boolean;
  /** 今の条件で読み込めなかった */
  error: boolean;
  /** 同じ条件で読み直す */
  retry: () => void;
}

/**
 * 条件（`key` が変わるたび）に応じて一覧 API を呼ぶ。条件が変わったら前の呼び出しは取り消す。
 * `fetcher` は `key` が変わったときだけ呼ばれる（毎回の描画で新しい関数を渡してよい）。
 */
export function useCatalogQuery<T>(key: string | null, fetcher: (signal: AbortSignal) => Promise<T>): CatalogQueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [settled, setSettled] = useState<{ key: string; attempt: number; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();
    fetcher(controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setSettled({ key, attempt, error: false });
      },
      () => {
        if (controller.signal.aborted) return;
        setSettled({ key, attempt, error: true });
      },
    );
    return () => controller.abort();
    // fetcher は key から決まる前提（呼び出し側が毎回作り直すため依存に入れない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  const current = settled !== null && settled.key === key && settled.attempt === attempt;
  return {
    data,
    loading: key !== null && !current,
    error: current && settled.error,
    retry: () => setAttempt((n) => n + 1),
  };
}

/** 入力が止まってから `delayMs` 後の値（キーワード検索のデバウンス。探す仕様書 §4.2 の 300ms） */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
