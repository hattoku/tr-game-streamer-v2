// 管理画面ダッシュボード（/admin）とナビのバッジの読み込み（クライアント専用）。管理_ダッシュボード仕様書。
// 管理画面の読み込みの決まりは lib/admin-api.ts の冒頭。審査ワークフローの件数は lib/workflow-admin.ts の fetchPendingWorkflowCounts。
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { requestAdminApi } from './admin-api';

/** お問い合わせの未対応件数と、ユーザーが返信して運営がまだ返していない件数 */
export async function fetchInquiryCounts(): Promise<{ open: number; awaitingReply: number }> {
  const [openSnap, awaitingSnap] = await Promise.all([
    getDocs(query(collection(db, 'inquiries'), where('status', '==', 'open'))),
    getDocs(query(collection(db, 'inquiries'), where('awaitingAdminReply', '==', true))),
  ]);
  return { open: openSnap.size, awaitingReply: awaitingSnap.size };
}

interface PlaylistRef {
  playlistId: string;
  title: string;
}

/** 直近の「新着動画の再取得」のログ（`batch_logs`） */
export interface BatchLogSummary {
  status: string;
  executedAt: number;
  /** 以下は差分取得（共通 YouTube定期取得仕様書 §7）以降のログにだけある */
  processedCount?: number;
  refetchedCount?: number;
  newVideoCount?: number;
  deferredCount?: number;
  quotaExceeded?: boolean;
  newVideoDetails?: Array<PlaylistRef & { newVideos: number }>;
  notFoundPlaylists?: PlaylistRef[];
  errorPlaylists?: Array<PlaylistRef & { message: string }>;
}

/**
 * 直近1件のログ（無ければ null）。functionName での絞り込みは行わない（orderBy と別フィールドの等価条件を
 * 組み合わせると複合インデックスが必要になるため。batch_logs への書き込みは新着動画の再取得だけ）
 */
export async function fetchLastBatchLog(): Promise<BatchLogSummary | null> {
  const snap = await getDocs(query(collection(db, 'batch_logs'), orderBy('executedAt', 'desc'), limit(1)));
  const doc = snap.docs[0];
  if (!doc) return null;
  const d = doc.data();
  return {
    status: (d.status as string) ?? 'unknown',
    executedAt: d.executedAt?.toMillis?.() ?? 0,
    processedCount: d.processedCount,
    refetchedCount: d.refetchedCount,
    newVideoCount: d.newVideoCount,
    deferredCount: d.deferredCount,
    quotaExceeded: d.quotaExceeded,
    newVideoDetails: d.newVideoDetails,
    notFoundPlaylists: d.notFoundPlaylists,
    errorPlaylists: d.errorPlaylists,
  };
}

/** 新着動画の再取得をいま実行する（POST /api/admin/refresh-new-videos）。失敗は AdminApiError */
export function runRefreshNewVideos(): Promise<{ notificationsCreated?: number; quotaConsumed?: number }> {
  return requestAdminApi('/api/admin/refresh-new-videos', { method: 'POST' });
}
