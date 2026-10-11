/**
 * まとめ（collections）のクライアント側の型・定数・取得処理
 * （ページ 再生リスト まとめ機能仕様書、Firestore データモデル設計書 3.14節）。
 * 書き込みはすべて app/api/collections 配下の API Route（Admin SDK）を経由する
 * （1ユーザー10件の上限と、作成者名の非正規化コピーをサーバー側で保証するため）。
 */
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { normalizeWatchStatus, type WatchStatus } from '@/components/ui/Chip';
import { COLLECTION_PLAYLISTS_MAX, COLLECTIONS_PER_USER_MAX, type CollectionVisibility } from '@/lib/collections-shared';

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
        const review: CreatorReview = {
          watchStatus: normalizeWatchStatus(data.watchStatus),
          comment: (data.comment as string | null)?.trim() || null,
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
};

export class CollectionApiError extends Error {
  constructor(public code: string) {
    super(API_ERROR_MESSAGE[code] ?? '保存に失敗しました。時間をおいて再試行してください');
  }
}

/** app/api/collections 配下の API を IDトークン付きで呼ぶ */
export async function callCollectionsApi<T = unknown>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
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
