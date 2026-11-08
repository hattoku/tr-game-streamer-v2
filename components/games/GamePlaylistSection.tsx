/**
 * ゲームタイトル詳細ページ「関連する再生リスト」セクション
 * （ページ ゲームタイトル 詳細仕様書 第4章・第5章）。
 * このゲームに紐づく公開かつ掲載中の再生リストを、チャンネル詳細と共用の PlaylistListSection で一覧表示する
 * （取得・並べ替え・ページ送りはサーバー側。リブランディング段階7）。
 */
'use client';

import { PlaylistListSection, type PlaylistTotals } from '@/components/playlists/PlaylistListSection';

export function GamePlaylistSection({ gameId, onTotals }: { gameId: string; onTotals?: (totals: PlaylistTotals) => void }) {
  // 「再生リストを追加する」導線: 全ユーザー共通で /playlists/new へ（管理者は登録、一般ユーザーは提案。
  // gameIdを引き継いで事前選択する）
  const addHref = `/playlists/new?gameId=${encodeURIComponent(gameId)}`;

  return <PlaylistListSection title="関連する再生リスト" filter={{ gameId }} addHref={addHref} onTotals={onTotals} />;
}
