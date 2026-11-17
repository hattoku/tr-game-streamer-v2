// 運営からのお知らせを利用者側の画面から読む（クライアント専用）。管理 お知らせ管理仕様書 v2.0 §7・§8。
// notices は Firestore ルールで管理者しか読めないため、API（/api/notices/*）から公開中のものだけを受け取る。
import type { PublicNotice } from './notice-shared';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw Object.assign(new Error(`notices api ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

/** 公開中を公開日の新しい順に。`before` は前のページの最後の公開日 */
export function fetchNotices(limit: number, before: number | null = null): Promise<{ notices: PublicNotice[]; hasMore: boolean }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before !== null) params.set('before', String(before));
  return getJson(`/api/notices?${params.toString()}`);
}

export async function fetchImportantNotices(): Promise<PublicNotice[]> {
  return (await getJson<{ notices: PublicNotice[] }>('/api/notices/important')).notices;
}

/** 公開中の1件。非公開・存在しないものは null */
export async function fetchNotice(id: string): Promise<PublicNotice | null> {
  try {
    return (await getJson<{ notice: PublicNotice }>(`/api/notices/${encodeURIComponent(id)}`)).notice;
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}
