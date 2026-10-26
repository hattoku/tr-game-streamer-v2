/**
 * まとめ（collections）のクライアント側の型・定数・取得処理
 * （ページ 再生リスト まとめ機能仕様書、Firestore データモデル設計書 3.14節）。
 * 書き込みはすべて app/api/collections 配下の API Route（Admin SDK）を経由する
 * （1ユーザー10件の上限と、作成者名の非正規化コピーをサーバー側で保証するため）。
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { normalizeWatchStatus, type WatchStatus } from '@/components/ui/Chip';
import {
  COLLECTION_PLAYLISTS_MAX,
  COLLECTIONS_PER_USER_MAX,
  type CollectionJson,
  type CollectionVisibility,
  type SavedCollectionJson,
} from '@/lib/collections-shared';

export * from '@/lib/collections-shared';

export const VISIBILITY_OPTIONS: Array<{ value: CollectionVisibility; label: string; description: string }> = [
  { value: 'private', label: '非公開', description: '自分だけが見られます' },
  { value: 'unlisted', label: '限定公開', description: 'URLを知っている人だけが見られます' },
  { value: 'public', label: '公開', description: '誰でも見られ、検索・一覧にも表示されます' },
];

export interface CollectionData {
  id: string;
  userId: string;
  userDisplayName: string;
  userProfileImageUrl: string | null;
  title: string;
  description: string | null;
  visibility: CollectionVisibility;
  playlistIds: string[];
  showSpoiler: boolean;
  savedCount: number;
  /** 自分のまとめ一覧での表示順（昇順）。手動並び替えの設定順（§4.5） */
  sortOrder: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** まとめに含まれる再生リスト1件分の表示用データ（§5.3・§6.3） */
export interface CollectionPlaylist {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoCount: number;
  gameId: string | null;
  gameName: string;
  score: number | null;
}

/** 作成者が当該再生リストに投稿したレビュー（§5.3。コメント・視聴ステータスのどちらも無ければ null） */
export interface CreatorReview {
  watchStatus: WatchStatus | null;
  comment: string | null;
  hasSpoiler: boolean;
}

function normalizeVisibility(value: unknown): CollectionVisibility {
  return value === 'public' || value === 'unlisted' ? value : 'private';
}

export function toCollectionData(d: { id: string; data(): Record<string, unknown> | undefined }): CollectionData {
  const data = d.data() ?? {};
  return {
    id: d.id,
    userId: (data.userId as string) ?? '',
    userDisplayName: (data.userDisplayName as string) || 'ユーザー',
    userProfileImageUrl: (data.userProfileImageUrl as string | null) ?? null,
    title: (data.title as string) ?? '',
    description: (data.description as string | null) ?? null,
    visibility: normalizeVisibility(data.visibility),
    playlistIds: (data.playlistIds as string[]) ?? [],
    showSpoiler: data.showSpoiler === true,
    savedCount: (data.savedCount as number) ?? 0,
    sortOrder: (data.sortOrder as number) ?? 0,
    createdAt: (data.createdAt as { toDate(): Date } | undefined)?.toDate?.() ?? null,
    updatedAt: (data.updatedAt as { toDate(): Date } | undefined)?.toDate?.() ?? null,
  };
}

/** 自分のまとめ一覧の並び順: sortOrder 昇順、同値は作成日時の降順（§4.5 デフォルトは新しい順） */
export function sortCollections(list: CollectionData[]): CollectionData[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** 新着順（作成日時の降順、まとめ機能仕様書 §6.2） */
export function sortCollectionsByNewest(list: CollectionData[]): CollectionData[] {
  return [...list].sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/**
 * 公開まとめを全件取得し新着順で返す（まとめを探す・TOPの新着のまとめ）。限定公開・非公開は含めない（§6.2）。
 * 公開再生リストと同じく、カタログ規模が小さい前提の全件クライアント取得。`visibility` の等価条件のみで複合index不要。
 */
export async function fetchPublicCollections(): Promise<CollectionData[]> {
  const snap = await getDocs(query(collection(db, 'collections'), where('visibility', '==', 'public')));
  return sortCollectionsByNewest(snap.docs.map(toCollectionData));
}

/**
 * 指定の再生リストを含む公開まとめを新着順で取得する（再生リスト詳細「この再生リストを含むまとめ」、§7）。
 * 等価条件＋array-contains（orderBy なし）は単一フィールドインデックスのマージで処理されるため複合indexは不要（stgで確認済み）。
 */
export async function fetchPublicCollectionsContaining(playlistId: string): Promise<CollectionData[]> {
  const snap = await getDocs(
    query(collection(db, 'collections'), where('visibility', '==', 'public'), where('playlistIds', 'array-contains', playlistId)),
  );
  return sortCollectionsByNewest(snap.docs.map(toCollectionData));
}

/** まとめカード用に、先頭3件の再生リストのサムネイルURLを引く（取得済みの公開再生リストから） */
export function collectionThumbnails(c: CollectionData, thumbnailById: Map<string, string>): string[] {
  return c.playlistIds.slice(0, 3).map((id) => thumbnailById.get(id) ?? '');
}

/**
 * 自分のまとめを全件取得する。`userId` の等価条件のみのため複合indexは不要
 * （非公開を含むため、firestore.rules の isSelf を満たす条件でクエリする必要がある）。
 */
export async function fetchMyCollections(uid: string): Promise<CollectionData[]> {
  const snap = await getDocs(query(collection(db, 'collections'), where('userId', '==', uid)));
  return sortCollections(snap.docs.map(toCollectionData));
}

/**
 * 再生リストIDの並び順のまま表示用データを取得する。非公開化・削除された再生リストは
 * 読み取りできない（firestore.rules）ため黙って除外する。
 */
export async function fetchCollectionPlaylists(playlistIds: string[]): Promise<CollectionPlaylist[]> {
  const results = await Promise.all(
    playlistIds.map(async (id) => {
      try {
        const snap = await getDoc(doc(db, 'playlists', id));
        if (!snap.exists()) return null;
        const data = snap.data();
        return {
          id,
          title: data.title ?? '',
          thumbnailUrl: data.thumbnailUrl ?? '',
          videoCount: data.videoCount ?? 0,
          gameId: data.gameId ?? null,
          gameName: data.gameName ?? '',
          score: data.score ?? null,
        } satisfies CollectionPlaylist;
      } catch {
        return null;
      }
    }),
  );
  return results.filter((p): p is CollectionPlaylist => p != null);
}

/** 作成者のレビューを再生リストごとに取得する（reviews のドキュメントIDは `{uid}_{playlistId}`） */
export async function fetchCreatorReviews(uid: string, playlistIds: string[]): Promise<Map<string, CreatorReview>> {
  const entries = await Promise.all(
    playlistIds.map(async (playlistId) => {
      try {
        const snap = await getDoc(doc(db, 'reviews', `${uid}_${playlistId}`));
        if (!snap.exists()) return null;
        const data = snap.data();
        // 通報で非表示のレビューはコメントを出さない。視聴ステータスは視聴記録なので残す（管理 審査ワークフロー仕様書 §3.1）
        const hidden = data.isHidden === true;
        const review: CreatorReview = {
          watchStatus: normalizeWatchStatus(data.watchStatus),
          comment: hidden ? null : (data.comment as string | null)?.trim() || null,
          hasSpoiler: data.hasSpoiler === true,
        };
        return [playlistId, review] as const;
      } catch {
        return null;
      }
    }),
  );
  return new Map(entries.filter((e): e is readonly [string, CreatorReview] => e != null));
}

/** 「YYYY年M月D日」形式（§5.2・§6.3） */
export function formatCollectionDate(d: Date | null): string {
  if (!d) return '';
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** API のエラーコード → 画面表示用メッセージ */
const API_ERROR_MESSAGE: Record<string, string> = {
  collection_limit: `作成できるまとめは${COLLECTIONS_PER_USER_MAX}件までです`,
  playlist_limit: `1つのまとめに入れられる再生リストは${COLLECTION_PLAYLISTS_MAX}件までです`,
  last_playlist: '再生リストが1件のみのまとめからは外せません',
  not_found: 'このまとめは見つかりませんでした',
  own_collection: '自分のまとめは保存できません',
};

export class CollectionApiError extends Error {
  constructor(public code: string) {
    super(API_ERROR_MESSAGE[code] ?? '保存に失敗しました。時間をおいて再試行してください');
  }
}

/** app/api/collections 配下の API を IDトークン付きで呼ぶ */
export async function callCollectionsApi<T = unknown>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  if (!auth.currentUser) throw new CollectionApiError('not_signed_in');
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new CollectionApiError(json.error ?? `status_${res.status}`);
  return json;
}

/** API Route が返したまとめ（日時はミリ秒）をクライアントの形に戻す */
export function fromCollectionJson(c: CollectionJson): CollectionData {
  return { ...c, createdAt: c.createdAt != null ? new Date(c.createdAt) : null, updatedAt: c.updatedAt != null ? new Date(c.updatedAt) : null };
}

/** 保存したまとめの1件（§8.4）。閲覧できなくなったまとめは collection が null */
export interface SavedCollectionItem {
  collectionId: string;
  collectionTitle: string;
  savedAt: Date;
  collection: CollectionData | null;
}

/**
 * 保存したまとめを保存日時の降順で取得する。非公開化されたまとめは本人でもクライアントから読めないため
 * API（Admin SDK）経由で、閲覧できなくなったものも含めて返してもらう（まとめ機能仕様書 §1）。
 */
export async function fetchSavedCollections(): Promise<SavedCollectionItem[]> {
  const { items } = await callCollectionsApi<{ items: SavedCollectionJson[] }>('/api/collections/saved', 'GET');
  return items.map((i) => ({
    collectionId: i.collectionId,
    collectionTitle: i.collectionTitle,
    savedAt: new Date(i.savedAt),
    collection: i.collection ? fromCollectionJson(i.collection) : null,
  }));
}

/** 保存の状態取得・保存・解除（§8.2）。保存は savedCount の増減を伴うため API 経由 */
export async function fetchIsSaved(collectionId: string): Promise<boolean> {
  const { saved } = await callCollectionsApi<{ saved: boolean }>(`/api/collections/${encodeURIComponent(collectionId)}/save`, 'GET');
  return saved;
}

export async function setCollectionSaved(collectionId: string, saved: boolean): Promise<void> {
  await callCollectionsApi(`/api/collections/${encodeURIComponent(collectionId)}/save`, saved ? 'POST' : 'DELETE');
}
