import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { fetchChannelPlaylistsFirstPage, YouTubeApiError } from '@/lib/youtube';
import { CHANNEL_APPLICATION_TYPE } from '@/lib/channel-application-shared';
import { getListingChannel } from '@/lib/channel-application-server';

// チャンネル申請の審査詳細に出す情報（管理 審査ワークフロー仕様書 §15.2）。
// 申請のチャンネルの再生リスト（最大20件、YouTube から都度取得。保存しない）と、掲載チャンネルとしての今の状態を返す。
export async function GET(request: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { workflowId } = await params;
  const data = (await adminDb.collection('workflows').doc(workflowId).get()).data();
  if (!data || data.type !== CHANNEL_APPLICATION_TYPE) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const youtubeChannelId = data.proposalData?.youtubeChannelId as string | undefined;
  if (!youtubeChannelId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { status } = await getListingChannel(youtubeChannelId);
  try {
    const { playlists, totalResults } = await fetchChannelPlaylistsFirstPage(youtubeChannelId, 20);
    return NextResponse.json({
      listingStatus: status,
      totalResults,
      playlists: playlists.map((p) => ({
        youtubePlaylistId: p.youtubePlaylistId,
        title: p.title,
        thumbnailUrl: p.thumbnailUrl,
        itemCount: p.itemCount,
        isPublic: p.isPublic,
      })),
    });
  } catch (e) {
    const message = e instanceof YouTubeApiError ? e.message : 'youtube_api_error';
    return NextResponse.json({ listingStatus: status, error: 'youtube_api_error', message }, { status: 502 });
  }
}
