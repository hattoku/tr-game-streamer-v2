import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { CRON_SECRET } from '@/lib/constants';
import { runChannelSweep } from '@/lib/channel-sweep-run';

// 掲載チャンネルの手動の巡回API（管理_Ai運営者 コンテンツ収集機能仕様書 §10.3・§10.11）。
// 確認画面の「巡回を実行」・掲載チャンネル画面の「このチャンネルだけ巡回」から呼ぶ。毎日の巡回は「新着動画の再取得」が兼ねる
// （共通 YouTube定期取得仕様書 §8.6）ので定期実行のジョブは無いが、X-Cron-Secret での呼び出しは残している。
// ボディに explorationChannelId を渡すと、そのチャンネルだけを巡回する。
// （2026-11-17 までのパスは /api/admin/collection/explore。段階3までの「探索」の名残りだったので改名した）

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

  const result = await runChannelSweep({ trigger: isCronRequest ? 'cron' : 'manual', executedBy, explorationChannelId, recordSkip: true });
  if (!result.ok) return NextResponse.json({ error: 'quota_exceeded', remaining: result.remaining }, { status: 429 });
  return NextResponse.json(result.summary);
}
