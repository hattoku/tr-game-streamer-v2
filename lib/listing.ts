// 再生リストの掲載状態（`playlists.listingStatus`）。
// Firestore データモデル設計書 §3.2、コンテンツ収集機能仕様書 §10.4・§10.7（リブランディング段階3）。
// 検索面（再生リストを探す・TOP・ゲーム・チャンネル・タグ）に出すのは「公開かつ listed」だけ。

export const LISTING_STATUSES = ['listed', 'unconfirmed', 'non_game', 'excluded', 'too_short', 'channel_off'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** 検索面に出す掲載状態 */
export const LISTED: ListingStatus = 'listed';

/** 掲載状態を決めた者 */
export type ListingSetBy = 'auto' | 'admin';

/** 入った経路（`playlists.source`）。`collection_candidate` は段階3までの収集候補の承認で入ったもの（もう新しくは付かない。移行で付けた値を読むため残す） */
export type PlaylistSource = 'channel_sweep' | 'user_proposal' | 'admin' | 'collection_candidate';

/**
 * 件数（`games.playlistCount` など）に数える再生リストか。
 * 移行前のドキュメント（listingStatus なし）は掲載中として扱う（移行スクリプトを本番に適用してから反映するため、
 * 通常は現れない。数え間違いを避けるための保険）。
 */
export function countsAsListed(data: { listingStatus?: string | null }): boolean {
  return (data.listingStatus ?? LISTED) === LISTED;
}
