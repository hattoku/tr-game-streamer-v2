import { adminDb } from '@/lib/firebase-admin';
import {
  COLLECTION_DESCRIPTION_MAX,
  COLLECTION_PLAYLISTS_MAX,
  COLLECTION_TITLE_MAX,
  type CollectionJson,
  type CollectionVisibility,
} from '@/lib/collections-shared';

// まとめ API（app/api/collections 配下）で共有する入力検証（まとめ機能仕様書 §3.2・§4.4）。
// サーバー専用（firebase-admin を使うため API Route からのみ import すること）。

const VISIBILITIES = new Set<CollectionVisibility>(['private', 'unlisted', 'public']);

/** リクエストボディをオブジェクトとして読む。壊れたJSON・オブジェクト以外は null（呼び出し側で 400 にする） */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export interface CollectionFields {
  title: string;
  description: string | null;
  visibility: CollectionVisibility;
  showSpoiler: boolean;
  playlistIds: string[];
}

/** フォームの全項目を検証する。不正ならエラーコードを返す */
export async function parseCollectionFields(body: Record<string, unknown>): Promise<CollectionFields | { error: string }> {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > COLLECTION_TITLE_MAX) return { error: 'invalid_title' };

  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (description.length > COLLECTION_DESCRIPTION_MAX) return { error: 'invalid_description' };

  const visibility = body.visibility as CollectionVisibility;
  if (!VISIBILITIES.has(visibility)) return { error: 'invalid_visibility' };

  if (!Array.isArray(body.playlistIds) || body.playlistIds.some((id) => typeof id !== 'string' || !id)) {
    return { error: 'invalid_playlists' };
  }
  const playlistIds = [...new Set(body.playlistIds as string[])];
  if (playlistIds.length === 0) return { error: 'invalid_playlists' };
  if (playlistIds.length > COLLECTION_PLAYLISTS_MAX) return { error: 'playlist_limit' };
  if (!(await arePublicPlaylists(playlistIds))) return { error: 'playlist_not_found' };

  return { title, description: description || null, visibility, showSpoiler: body.showSpoiler === true, playlistIds };
}

/** すべて存在する公開再生リストか */
export async function arePublicPlaylists(playlistIds: string[]): Promise<boolean> {
  const snaps = await adminDb.getAll(...playlistIds.map((id) => adminDb.collection('playlists').doc(id)));
  return snaps.every((s) => s.exists && s.data()?.isPublic === true);
}

/** 作成者名・アイコンの非正規化コピー（reviews の userDisplayName と同じ扱い。作成時・フォーム保存時点のスナップショット） */
export async function fetchCreatorSnapshot(uid: string): Promise<{ userDisplayName: string; userProfileImageUrl: string | null }> {
  const userData = (await adminDb.collection('users').doc(uid).get()).data();
  return {
    userDisplayName: (userData?.displayName as string | undefined) || 'ユーザー',
    userProfileImageUrl: (userData?.profileImageUrl as string | undefined) ?? null,
  };
}

/** Firestore（Admin SDK）のまとめドキュメントを API レスポンス用の形にする */
export function toCollectionJson(id: string, data: FirebaseFirestore.DocumentData): CollectionJson {
  const millis = (v: unknown) => (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;
  return {
    id,
    userId: data.userId ?? '',
    userDisplayName: data.userDisplayName || 'ユーザー',
    userProfileImageUrl: data.userProfileImageUrl ?? null,
    title: data.title ?? '',
    description: data.description ?? null,
    visibility: data.visibility === 'public' || data.visibility === 'unlisted' ? data.visibility : 'private',
    playlistIds: data.playlistIds ?? [],
    showSpoiler: data.showSpoiler === true,
    savedCount: data.savedCount ?? 0,
    sortOrder: data.sortOrder ?? 0,
    createdAt: millis(data.createdAt),
    updatedAt: millis(data.updatedAt),
  };
}

/** 保存記録のドキュメントID（mylist・reviews と同じ `{uid}_{対象ID}` 形式） */
export function savedCollectionDocId(uid: string, collectionId: string): string {
  return `${uid}_${collectionId}`;
}
