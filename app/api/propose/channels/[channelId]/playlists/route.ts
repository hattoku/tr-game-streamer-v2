import { NextRequest, NextResponse } from 'next/server';
import { requireUserWithRole } from '@/lib/api-auth';
import { channelPlaylistsForPropose, getProposeChannel } from '@/lib/propose-server';

// 提案ページの再生リスト側の一覧（ページ 提案する 仕様書 §5.2・§10）。ログイン必須。
// 掲載中のチャンネルだけ。運営が手で外した再生リストは管理者にだけ返す。
export async function GET(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const auth = await requireUserWithRole(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { channelId } = await params;
  const channel = await getProposeChannel(channelId);
  if (!channel) return NextResponse.json({ error: 'channel_not_listed' }, { status: 404 });
  const playlists = await channelPlaylistsForPropose({ youtubeChannelId: channelId, uid: auth.uid, isAdmin: auth.isAdmin });
  return NextResponse.json({ channel, playlists });
}
