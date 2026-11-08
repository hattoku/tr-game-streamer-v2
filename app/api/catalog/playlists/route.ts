import type { NextRequest } from 'next/server';
import { catalogResponse, searchPlaylists } from '../../../../lib/catalog-server';
import { parseEnum, parseIdList, parseKeyword, parsePage, PLAYLIST_SORTS } from '../../../../lib/catalog-shared';

// 再生リストの一覧（再生リストを探す・ゲームタイトル詳細・チャンネル詳細）。公開かつ掲載中だけを1ページ分返す。
// ログイン不要（検索面は未ログインでも見られる）。共通 一覧のサーバー側検索 仕様書 §3.1。
// ?q=キーワード &tags=タグID,タグID（すべて含む） &sort=score|mylist|newest &page=1 &gameId= &channelId=
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return catalogResponse(() =>
    searchPlaylists({
      keyword: parseKeyword(sp.get('q')),
      tagIds: parseIdList(sp.get('tags')),
      sort: parseEnum(sp.get('sort'), PLAYLIST_SORTS, 'score'),
      page: parsePage(sp.get('page')),
      gameId: sp.get('gameId') || null,
      channelId: sp.get('channelId') || null,
    }),
  );
}
