import type { NextRequest } from 'next/server';
import { catalogResponse, searchChannels } from '../../../../lib/catalog-server';
import { CHANNEL_SORTS, parseEnum, parseKeyword, parsePage } from '../../../../lib/catalog-shared';

// チャンネル名から探すの一覧。掲載中の再生リストがあるチャンネルだけを1ページ分返す。ログイン不要。既定は人気順（段階5）。
// 共通 一覧のサーバー側検索 仕様書 §3.2。?q=キーワード &sort=popular|playlistCount|name|videoCount &page=1
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  return catalogResponse(request, () =>
    searchChannels({
      keyword: parseKeyword(sp.get('q')),
      sort: parseEnum(sp.get('sort'), CHANNEL_SORTS, 'popular'),
      page: parsePage(sp.get('page')),
    }),
  );
}
