import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { lastPopularityRunAt } from '../../../../lib/popularity-server';
import { readPopularity, type PopularityCounts } from '../../../../lib/popularity-shared';

// 管理画面の掲載チャンネルに出す、人気の数字（チャンネルごとの人数）と最後に集計した日時
// （管理 AI運営者向け収集候補レビューUI仕様書 §9.2、共通 人気のチャンネル 集計 仕様書 §6）。
// batch_state はクライアントから読めないため、この API で返す。
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const [lastRunAt, channelsSnap] = await Promise.all([
    lastPopularityRunAt(),
    adminDb.collection('channels').select('popularity').get(),
  ]);
  const channels: Record<string, PopularityCounts> = {};
  for (const d of channelsSnap.docs) {
    const value = d.get('popularity');
    if (value != null) channels[d.id] = readPopularity(value);
  }
  return NextResponse.json({ lastRunAt, channels }, { headers: { 'Cache-Control': 'private, no-store' } });
}
