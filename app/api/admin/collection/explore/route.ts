import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { CRON_SECRET } from '@/lib/constants';
import { adminDb } from '@/lib/firebase-admin';
import { checkCollectionQuota } from '@/lib/collection-quota';
import { exploreChannels } from '@/lib/exploration-server';

// 掲載チャンネルの手動の巡回API（管理_Ai運営者 コンテンツ収集機能仕様書 §10.3・§10.11）。
// 確認画面の「巡回を実行」・掲載チャンネル画面の「このチャンネルだけ巡回」から呼ぶ。毎日の巡回は「新着動画の再取得」が兼ねる
// （共通 YouTube定期取得仕様書 §8.6）ので、Cloud Scheduler の週1実行は不要だが、X-Cron-Secret での呼び出しは残している。
// ボディに explorationChannelId を渡すと、そのチャンネルだけを巡回する。

export async function POST(request: NextRequest) {
  const cronHeader = request.headers.get('x-cron-secret');
  const isCronRequest = Boolean(CRON_SECRET) && cronHeader === CRON_SECRET;

  let executedBy: string | null = null;
  if (!isCronRequest) {
    const auth = await requireAdmin(request);
    if ('errorResponse' in auth) return auth.errorResponse;
    executedBy = auth.uid;
  }

  const body = (await request.json().catch(() => ({}))) as { explorationChannelId?: unknown };
  const explorationChannelId = typeof body.explorationChannelId === 'string' ? body.explorationChannelId : undefined;

  // 見込み消費: 1チャンネルあたり最低1ユニット（再生リスト50件ごとに1ユニット。§10.10）
  const activeCount = explorationChannelId
    ? 1
    : (await adminDb.collection('exploration_channels').where('status', '==', 'active').count().get()).data().count;
  const quota = await checkCollectionQuota(activeCount);
  if (!quota.ok) {
    // 定期実行が枠不足で走らなかったことを後から確認できるよう、スキップも実行ログに残す
    await adminDb.collection('collection_batch_logs').add({
      executedAt: new Date(),
      trigger: isCronRequest ? 'cron' : 'manual',
      executedBy,
      kind: 'sweep',
      processedChannels: 0,
      playlistsFetched: 0,
      candidatesFound: 0,
      quotaConsumed: 0,
      errors: [],
      status: 'skipped',
      reason: 'quota_exceeded',
    });
    return NextResponse.json({ error: 'quota_exceeded', remaining: quota.remaining }, { status: 429 });
  }

  const trigger = isCronRequest ? 'cron' : 'manual';
  const summary = await exploreChannels({ trigger, executedBy, explorationChannelId });
  return NextResponse.json(summary);
}
