import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/api-auth';
import { CRON_SECRET } from '../../../../lib/constants';
import { adminDb } from '../../../../lib/firebase-admin';
import { refreshNewVideos, toBatchLogFields } from '../../../../lib/new-videos-refresh';
import { getQuotaConsumed, resetQuotaCounter } from '../../../../lib/youtube';

// 新着動画の再取得API（動画更新バッチ）。管理画面の手動ボタンに加え、Cloud Schedulerからの日次自動実行
// （フェーズ4.5ステップ4）でも使う。
// 本来は動画更新バッチ（RSS優先・API フォールバック、Cloud Functions + Cloud Scheduler）
// が担う処理だが、Cloud Functions基盤を導入せず、この API Route で代替している
// （ユーザー確認済み、wiki/sources/2026-09-10-phase2-plan.md参照）。
//
// 2026-11-01: 全公開再生リストを毎日全ページ取り直す方式をやめ、playlists.list で動画数をまとめて確認し、
// 変わった再生リストだけ取り直す差分方式にした（共通 YouTube定期取得仕様書 §7。本体は lib/new-videos-refresh.ts）。
// 新着があった再生リストをマイリスト登録しているユーザー全員に notifications を生成する
// （ユーザー通知機能仕様書の「シリーズ新着通知」）。
//
// Cloud Schedulerからの呼び出しはX-Cron-SecretヘッダーがCRON_SECRETと一致すれば
// requireAdminをスキップする（/apiはproxy.tsのCookieゲート対象外のため、Cloud Run URLを
// 直接叩ける。CRON_SECRET自体はYOUTUBE_API_KEYと同じくdeploy.sh/deploy.ps1が
// .env.localから読み取って注入する）。
export async function POST(request: NextRequest) {
  const cronHeader = request.headers.get('x-cron-secret');
  const isCronRequest = Boolean(CRON_SECRET) && cronHeader === CRON_SECRET;

  if (!isCronRequest) {
    const auth = await requireAdmin(request);
    if ('errorResponse' in auth) return auth.errorResponse;
  }

  const executedAt = new Date();
  resetQuotaCounter();

  let summary;
  try {
    summary = await refreshNewVideos();
  } catch (e) {
    await adminDb.collection('batch_logs').add({
      functionName: 'video_update',
      executedAt,
      processedCount: 0,
      newVideoCount: 0,
      status: 'error',
      errorMessage: e instanceof Error ? e.message : 'unknown_error',
      quotaConsumed: getQuotaConsumed(),
    });
    return NextResponse.json({ error: 'batch_failed' }, { status: 500 });
  }

  await adminDb.collection('batch_logs').add({
    functionName: 'video_update',
    executedAt,
    // 動画数の確認が1件もできなかった（キーの不備など）・クォータが途中で尽きたときは失敗とする
    status: summary.quotaExceeded || (summary.playlistsChecked === 0 && summary.errors.length > 0) ? 'error' : 'success',
    ...(summary.quotaExceeded ? { errorMessage: 'YouTube API の1日のクォータが尽きたため中断しました' } : {}),
    ...toBatchLogFields(summary),
  });

  return NextResponse.json(summary);
}
