import type { NextRequest } from 'next/server';
import { catalogResponse, searchGames } from '../../../../lib/catalog-server';
import { GAME_SORTS, parseEnum, parseIdList, parseKeyword, parsePage } from '../../../../lib/catalog-shared';

// ゲームタイトルから探すの一覧を1ページ分返す。件数は掲載中の再生リストだけで数える。ログイン不要。
// 共通 一覧のサーバー側検索 仕様書 §3.3。
// ?q=キーワード &genres=ジャンルID,…（どれか） &tags=タグID,…（すべて含む） &sort=playlistCount|title|videoCount &page=1
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return catalogResponse(() =>
    searchGames({
      keyword: parseKeyword(sp.get('q')),
      genreIds: parseIdList(sp.get('genres')),
      tagIds: parseIdList(sp.get('tags')),
      sort: parseEnum(sp.get('sort'), GAME_SORTS, 'playlistCount'),
      page: parsePage(sp.get('page')),
    }),
  );
}
