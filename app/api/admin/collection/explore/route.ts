import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { CRON_SECRET } from '@/lib/constants';
import { adminDb } from '@/lib/firebase-admin';
import { checkCollectionQuota } from '@/lib/collection-quota';
import { exploreChannels } from '@/lib/exploration-server';

// チャンネル起点の再生リスト探索API（管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3.2）。
// 管理画面「収集候補」の「探索を実行」ボタンと、Cloud Scheduler の週1実行の両方から呼ぶ。
// 新着動画の再取得（/api/admin/refresh-new-videos）と同じく、X-Cron-Secret ヘッダーが CRON_SECRET と
// 一致すれば requireAdmin をスキップする（Cloud Functions 基盤は導入せず Cloud Run の API Route で代替。§2.1）。
// ボディに explorationChannelId を渡すと、そのチャンネルだけを探索する（探索対象チャンネル画面の個別実行）。
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

  // 見込み消費: 1チャンネルあたり最低1ユニット（再生リスト50件ごとに1ユニット。§6）
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
      processedChannels: 0,
      playlistsFetched: 0,
      candidatesFound: 0,
      skippedByFilter: 0,
      skippedExisting: 0,
      quotaConsumed: 0,
      errors: [],
      status: 'skipped',
      reason: 'quota_exceeded',
    });
    return NextResponse.json({ error: 'quota_exceeded', remaining: quota.remaining }, { status: 429 });
  }

  const summary = await exploreChannels({ trigger: isCronRequest ? 'cron' : 'manual', executedBy, explorationChannelId });
  return NextResponse.json(summary);
}
