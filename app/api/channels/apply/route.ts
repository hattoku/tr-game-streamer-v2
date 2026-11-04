import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminAuth } from '@/lib/firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { newWorkflowRecord } from '@/lib/playlist-registration';
import { checkApplyChannel, countTodayApplications, resolveApplyInput } from '@/lib/channel-application-server';
import {
  CHANNEL_APPLICATION_TYPE,
  DAILY_APPLICATION_LIMIT,
  isApplicantType,
  MAX_APPLICATION_REASON_LENGTH,
} from '@/lib/channel-application-shared';

// チャンネル申請の送信（ページ チャンネルを申請する 仕様書 §5・§8、管理 審査ワークフロー仕様書 §15.2）。
// `workflows`（type: channel_application、審査中）を作る。YouTube の情報はサーバー側で取り直して保存する。
// 管理者は申請できない（掲載チャンネル画面から直接登録する）。受け付けない条件は確認API（preview）と同じ判定をここでも行う。
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!input || !isApplicantType(body.applicantType)) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (reason.length > MAX_APPLICATION_REASON_LENGTH) return NextResponse.json({ error: 'reason_too_long' }, { status: 400 });

  const record = await adminAuth.getUser(auth.uid).catch(() => null);
  const role = record?.customClaims?.role;
  if (role === 'owner' || role === 'operator') return NextResponse.json({ error: 'admin_not_allowed' }, { status: 403 });

  const channel = await resolveApplyInput(input);
  if ('error' in channel) {
    return NextResponse.json({ error: channel.error, message: channel.message }, { status: channel.status });
  }
  const check = await checkApplyChannel(channel.youtubeChannelId, auth.uid);
  if (check.state !== 'ok') return NextResponse.json({ error: `channel_${check.state}` }, { status: 409 });
  if ((await countTodayApplications(auth.uid)) >= DAILY_APPLICATION_LIMIT) {
    return NextResponse.json({ error: 'daily_limit' }, { status: 429 });
  }

  await adminDb.collection('workflows').add(
    newWorkflowRecord(CHANNEL_APPLICATION_TYPE, auth.uid, {
      channelUrl: input,
      youtubeChannelId: channel.youtubeChannelId,
      channelTitle: channel.title,
      channelIconUrl: channel.iconUrl,
      subscriberCount: channel.subscriberCount,
      applicantType: body.applicantType,
      reason: reason || null,
    }),
  );
  return NextResponse.json({ channel });
}
