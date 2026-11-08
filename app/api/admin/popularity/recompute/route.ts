import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/api-auth';
import { CRON_SECRET } from '../../../../../lib/constants';
import { adminDb } from '../../../../../lib/firebase-admin';
import { recomputeChannelPopularity } from '../../../../../lib/popularity-server';

// 人気のチャンネルの集計（リブランディング段階5、共通 人気のチャンネル 集計 仕様書 §3）。
// Cloud Scheduler から毎日 4:00（日本時間）に呼ぶほか、管理画面の掲載チャンネルの「人気の数字を今すぐ集計する」からも呼ぶ。
// Cloud Scheduler からの呼び出しは X-Cron-Secret が CRON_SECRET と一致すれば管理者のログインを求めない
// （新着動画の取得 app/api/admin/refresh-new-videos と同じ方式）。

export async function POST(request: NextRequest) {
  const cronHeader = request.headers.get('x-cron-secret');
  const isCronRequest = Boolean(CRON_SECRET) && cronHeader === CRON_SECRET;
  if (!isCronRequest) {
    const auth = await requireAdmin(request);
    if ('errorResponse' in auth) return auth.errorResponse;
  }

  const executedAt = new Date();
  try {
    const summary = await recomputeChannelPopularity(executedAt);
    await adminDb.collection('batch_logs').add({
      functionName: 'channel_popularity',
      executedAt,
      status: 'success',
      processedCount: summary.processedCount,
      updatedChannelCount: summary.updatedChannelCount,
      newViewerCount: summary.newViewerCount,
      quotaConsumed: 0,
    });
    return NextResponse.json(summary);
  } catch (e) {
    console.error('[popularity] 人気の集計に失敗しました', e);
    await adminDb
      .collection('batch_logs')
      .add({
        functionName: 'channel_popularity',
        executedAt,
        status: 'error',
        processedCount: 0,
        errorMessage: e instanceof Error ? e.message : 'unknown_error',
        quotaConsumed: 0,
      })
      .catch(() => {});
    return NextResponse.json({ error: 'batch_failed' }, { status: 500 });
  }
}
