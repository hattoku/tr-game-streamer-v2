// プロフィール（ページ 設定 プロフィール仕様書）のクライアント・サーバー共通の型。
// GET /api/users/[userId]/profile（Admin SDK）が返す形。日時はミリ秒。
import type { WatchStatus } from '@/components/ui/Chip';
import type { CollectionJson } from '@/lib/collections-shared';

/** マイリスト・レビュー履歴カードに出す再生リスト情報（公開再生リストのみ） */
export interface ProfilePlaylistJson {
  id: string;
  title: string;
  thumbnailUrl: string;
  /** 話数（マイリストカードのサムネイル右下に出す） */
  videoCount: number;
  gameId: string | null;
  gameName: string;
  /** 再生リストスコア（加重平均）。レビュー0件は null（「評価なし」） */
  score: number | null;
}

export interface ProfileMylistItemJson {
  playlist: ProfilePlaylistJson;
  watchStatus: WatchStatus | null;
  addedAt: number | null;
}

export interface ProfileReviewJson {
  id: string;
  playlist: ProfilePlaylistJson;
  starRating: number | null;
  watchStatus: WatchStatus | null;
  comment: string | null;
  hasSpoiler: boolean;
  postedAt: number | null;
  updatedAt: number | null;
}

export interface ProfileJson {
  user: {
    userId: string;
    displayName: string;
    bio: string | null;
    profileImageUrl: string | null;
    accountCreatedAt: number | null;
    isMylistPublic: boolean;
    isReviewHistoryPublic: boolean;
  };
  /** 閲覧者が本人か（本人は公開設定にかかわらず全セクションを表示する、§2.1） */
  isSelf: boolean;
  stats: {
    reviewCount: number;
    helpfulCount: number;
    /** 視聴ステータス内訳。件数0のステータスは含めない（§5.3） */
    watchStatusCounts: Array<{ status: WatchStatus; count: number }>;
  };
  /** よくレビューするジャンル上位3件（§6）。0件なら空配列 */
  genres: Array<{ name: string; count: number }>;
  /** 他人のページで非公開設定のときは null（セクションごと出さない、§2.3） */
  mylist: ProfileMylistItemJson[] | null;
  reviews: ProfileReviewJson[] | null;
  /** 公開まとめ（まとめ機能仕様書 §9.1）。手動並び替えの設定順 */
  collections: CollectionJson[];
  /** まとめカードのサムネイル用（先頭3件の再生リストID → サムネイルURL） */
  collectionThumbnailById: Record<string, string>;
}
