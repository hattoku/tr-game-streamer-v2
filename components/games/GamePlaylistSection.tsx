/**
 * ゲームタイトル詳細ページ「関連する再生リスト」セクション
 * （ページ ゲームタイトル 詳細仕様書 第4章・第5章）。
 * このゲームに紐づく公開再生リストを取得し、一覧UI（ソート・ページネーション・空状態）は
 * チャンネル詳細と共用の PlaylistListSection に委ねる。
 */
'use client';

import { useEffect, useState } from 'react';
import { fetchPlaylistsByGame, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { PlaylistListSection } from '@/components/playlists/PlaylistListSection';

export function GamePlaylistSection({ gameId }: { gameId: string }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);

  useEffect(() => {
    fetchPlaylistsByGame(gameId).then(setPlaylists);
  }, [gameId]);

  // 「再生リストを追加する」導線: 全ユーザー共通で /playlists/new へ（管理者は登録、一般ユーザーは提案。
  // gameIdを引き継いで事前選択する）
  const addHref = `/playlists/new?gameId=${encodeURIComponent(gameId)}`;

  return <PlaylistListSection title="関連する再生リスト" playlists={playlists} addHref={addHref} />;
}
