import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { checkApplyChannel, countTodayApplications, resolveApplyInput } from '@/lib/channel-application-server';
import { DAILY_APPLICATION_LIMIT } from '@/lib/channel-application-shared';

// 「チャンネルを申請する」の入力欄のチャンネル確認（書き込みなし。ページ チャンネルを申請する 仕様書 §4・§8）。
// 入力（URL・@ハンドル・UC…・再生リストURL）から YouTube のチャンネルを特定し、申請を受け付けられる状態かを返す。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { input } = await request.json().catch(() => ({}));
  if (typeof input !== 'string') return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const channel = await resolveApplyInput(input);
  if ('error' in channel) {
    return NextResponse.json({ error: channel.error, message: channel.message }, { status: channel.status });
  }
  const [check, todayCount] = await Promise.all([checkApplyChannel(channel.youtubeChannelId, auth.uid), countTodayApplications(auth.uid)]);
  return NextResponse.json({
    channel,
    state: check.state,
    pendingIsMine: check.pendingIsMine,
    channelPageId: check.channelPageId,
    limitReached: todayCount >= DAILY_APPLICATION_LIMIT,
  });
}
