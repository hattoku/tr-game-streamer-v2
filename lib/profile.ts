/**
 * プロフィールページ（ページ 設定 プロフィール仕様書）のクライアント側の取得処理。
 * 他人の users・mylist はクライアントから読めないため、GET /api/users/[userId]/profile（Admin SDK）経由で取る。
 * ログイン中は IDトークンを付け、本人なら公開設定にかかわらず全セクションを返してもらう（§2.1）。
 */
import { auth } from '@/lib/firebase';
import type { ProfileJson } from '@/lib/profile-shared';

export * from '@/lib/profile-shared';

export class ProfileNotFoundError extends Error {}

export async function fetchProfile(userId: string): Promise<ProfileJson> {
  const headers: Record<string, string> = {};
  if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile`, { headers });
  if (res.status === 404) throw new ProfileNotFoundError();
  if (!res.ok) throw new Error(`status_${res.status}`);
  return (await res.json()) as ProfileJson;
}

/** 「YYYY年M月D日」形式（§4.2・§8.4） */
export function formatProfileDate(ms: number | null): string {
  if (ms == null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** プロフィール編集（§9）。表示名を変えるとサーバー側で自分のレビュー・まとめの投稿者名・作成者名も揃える */
export async function updateProfile(userId: string, input: { displayName: string; bio: string }): Promise<{ displayName: string; bio: string | null }> {
  if (!auth.currentUser) throw new Error('not signed in');
  const res = await fetch(`/api/users/${encodeURIComponent(userId)}/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`status_${res.status}`);
  return (await res.json()) as { displayName: string; bio: string | null };
}
