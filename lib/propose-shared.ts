// 統合した提案ページ（/propose）でクライアントとサーバーが共有する型と表示（ページ 提案する 仕様書）。
// firebase-admin を import しないこと（クライアントからも読むため）。

/** 提案ページの側（§3） */
export type ProposeType = 'playlist' | 'channel';

/** 再生リスト側でチャンネルを選ぶときの候補（掲載中のチャンネル。§5.1） */
export interface ProposeChannel {
  youtubeChannelId: string;
  title: string;
  iconUrl: string;
}

/** チャンネルの再生リスト一覧の1件（§5.2） */
export interface ProposePlaylist {
  id: string;
  title: string;
  thumbnailUrl: string;
  videoCount: number;
  listingStatus: string;
  listingReason: string | null;
  /** 運営が手で外したもの（管理者にだけ返る） */
  hiddenByAdmin: boolean;
  /** 巡回で推定した（または付けられている）ゲーム */
  gameId: string | null;
  gameName: string | null;
  /** 審査中の提案がある */
  pending: boolean;
  pendingIsMine: boolean;
}

/** 公開してほしい理由の上限（対象外の再生リストを選んだときだけ。§5.2） */
export const MAX_PROPOSE_REASON_LENGTH = 200;

/** 一覧での分類（§5.2） */
export function proposePlaylistGroup(p: ProposePlaylist): 'listed' | 'unconfirmed' | 'out_of_scope' | 'hidden' {
  if (p.listingStatus === 'listed') return 'listed';
  if (p.hiddenByAdmin) return 'hidden';
  if (p.listingStatus === 'unconfirmed') return 'unconfirmed';
  return 'out_of_scope';
}

/** 対象外になっている理由の短い表示（一般ユーザー向け。§5.2） */
export function outOfScopeLabel(p: Pick<ProposePlaylist, 'listingStatus' | 'listingReason'>): string {
  if (p.listingStatus === 'non_game') return 'ゲーム以外と判定';
  if (p.listingStatus === 'too_short') return '動画が10本未満';
  if (p.listingStatus === 'excluded') return p.listingReason?.startsWith('word:') ? '除外のことばに該当' : '公開の対象外';
  return '公開の対象外';
}
