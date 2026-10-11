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
