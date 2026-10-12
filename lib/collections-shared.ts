// まとめ（collections）のクライアント・サーバー共通の定数と型（まとめ機能仕様書 §3.2〜3.4）。
// lib/collections.ts（クライアント SDK を使う）と lib/collections-server.ts（Admin SDK）の両方から使うため分けている。

export const COLLECTION_TITLE_MAX = 50;
export const COLLECTION_DESCRIPTION_MAX = 500;
export const COLLECTION_PLAYLISTS_MAX = 10;
export const COLLECTIONS_PER_USER_MAX = 10;

export type CollectionVisibility = 'private' | 'unlisted' | 'public';

export const VISIBILITY_LABEL: Record<CollectionVisibility, string> = {
  private: '非公開',
  unlisted: '限定公開',
  public: '公開',
};

/** API Route（Admin SDK）からクライアントへ返すまとめの形。日時はミリ秒 */
export interface CollectionJson {
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
  sortOrder: number;
  createdAt: number | null;
  updatedAt: number | null;
}

/** 保存したまとめ一覧（GET /api/collections/saved）の1件。閲覧できなくなったまとめは collection が null */
export interface SavedCollectionJson {
  collectionId: string;
  /** 保存時点のタイトル（閲覧できなくなった場合の案内に使う） */
  collectionTitle: string;
  savedAt: number;
  collection: CollectionJson | null;
}
