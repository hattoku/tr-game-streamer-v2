/**
 * 管理画面ダッシュボード（/admin）。管理_ダッシュボード仕様書 準拠。
 *
 * フェーズ6ステップ3「管理画面の最小版」の決定（wiki/sources参照）により、仕様書が定義する
 * 5セクション構成（要対応アラート／審査ワークフローサマリー／お問い合わせサマリー／
 * モニタリングサマリー／クイックリンク）のうち、データ源が存在しスコープに含まれる
 * 「通報サマリー」「新着動画再取得（旧・通知ページ下部の管理者用暫定カード）」の2セクションのみに
 * 縮小する。モニタリング・クォータ・不正検知・マスタ管理等はデータ源／機能自体が
 * 未実装のため今回は置かない。オーナー限定表示の出し分けも行わない（operator/owner共通）。
 * お問い合わせサマリーはフェーズ7ステップ7-3-1で「未対応件数」だけを追加した（種別別内訳・24時間超過アラートは無し）。
 * 審査ワークフローのサマリーはフェーズ7ステップ7-4で提案（再生リスト・ゲームタイトル登録提案）の未処理件数も並べた。
 * 2026-11-17（リファクタリング③）から、未処理の件数は一覧・ナビのバッジと同じ数え方（lib/workflow-admin.ts の fetchPendingWorkflowCounts。
 * 通報には詳細ページからの変更の提案を対象ごとに1件として含める）。読み込みは lib/admin-dashboard.ts。
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchInquiryCounts, fetchLastBatchLog, runRefreshNewVideos, type BatchLogSummary } from '@/lib/admin-dashboard';
import { fetchPendingWorkflowCounts } from '@/lib/workflow-admin';
import { AdminApiError } from '@/lib/admin-api';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';

export default function AdminDashboardPage() {
  const { toast } = useToast();

  const [pendingReportCount, setPendingReportCount] = useState<number | null>(null);
  const [pendingProposalCount, setPendingProposalCount] = useState<number | null>(null);
  const [openInquiryCount, setOpenInquiryCount] = useState<number | null>(null);
  const [awaitingReplyCount, setAwaitingReplyCount] = useState<number | null>(null);
  const [lastBatch, setLastBatch] = useState<BatchLogSummary | null | undefined>(undefined);

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);
  // 画面を開いたときの読み込みが、再取得の後の読み込みより遅れて返ってきても古い結果で上書きしないための通し番号
  const lastBatchRequestRef = useRef(0);

  async function loadPendingWorkflowCounts() {
    // 通報（レビューコメント通報と、詳細ページからの変更の提案を対象ごとに1件）と提案。一覧の行の数・ナビのバッジと同じ数え方
    const counts = await fetchPendingWorkflowCounts();
    setPendingReportCount(counts.reports);
    setPendingProposalCount(counts.proposals);
  }

  async function loadOpenInquiryCount() {
    // 「ユーザー返信あり」（ユーザーが返信して運営がまだ返していない）も並べて出す（7-3-2、ユーザー決定）
    const counts = await fetchInquiryCounts();
    setOpenInquiryCount(counts.open);
    setAwaitingReplyCount(counts.awaitingReply);
  }

  async function loadLastBatch() {
    const requestId = ++lastBatchRequestRef.current;
    const log = await fetchLastBatchLog();
    if (requestId !== lastBatchRequestRef.current) return;
    setLastBatch(log);
  }

  useEffect(() => {
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      await Promise.all([loadPendingWorkflowCounts(), loadOpenInquiryCount(), loadLastBatch()]);
    })();
  }, []);

  async function handleRefresh() {
    setRefreshBusy(true);
    setRefreshResult(null);
    try {
      const body = await runRefreshNewVideos();
      setRefreshResult(`完了しました（通知 ${body.notificationsCreated} 件生成、消費 ${body.quotaConsumed} ユニット）`);
      toast({ type: 'success', message: '新着動画の再取得が完了しました' });
      loadLastBatch();
    } catch (e) {
      // API がエラーを返した（AdminApiError）か、通信できなかった
      setRefreshResult('再取得に失敗しました');
      toast({ type: 'error', message: e instanceof AdminApiError ? '再取得に失敗しました' : '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setRefreshBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading>ダッシュボード</SectionHeading>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">審査ワークフロー</p>
          {pendingReportCount === null || pendingProposalCount === null ? (
            <Skeleton className="h-9 w-16" />
          ) : pendingReportCount === 0 && pendingProposalCount === 0 ? (
            <p className="inline-flex items-center gap-2 text-base text-text-secondary">
              <CheckIcon size={16} className="text-text-tertiary" />
              未処理の通報・提案はありません
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-score font-semibold text-text-primary">
                {pendingReportCount.toLocaleString()} <span className="text-md font-normal text-text-muted">件 通報</span>
              </p>
              <p className="text-score font-semibold text-text-primary">
                {pendingProposalCount.toLocaleString()} <span className="text-md font-normal text-text-muted">件 提案</span>
              </p>
            </div>
          )}
          <Link href="/admin/workflows" className="w-fit text-base text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline">
            一覧を見る →
          </Link>
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">お問い合わせ</p>
          {openInquiryCount === null || awaitingReplyCount === null ? (
            <Skeleton className="h-9 w-16" />
          ) : openInquiryCount === 0 && awaitingReplyCount === 0 ? (
            <p className="inline-flex items-center gap-2 text-base text-text-secondary">
              <CheckIcon size={16} className="text-text-tertiary" />
              未対応のお問い合わせはありません
            </p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <p className="text-score font-semibold text-text-primary">
                {openInquiryCount.toLocaleString()} <span className="text-md font-normal text-text-muted">件 未対応</span>
              </p>
              {awaitingReplyCount > 0 && (
                <p className="text-score font-semibold text-text-primary">
                  {awaitingReplyCount.toLocaleString()} <span className="text-md font-normal text-text-muted">件 ユーザー返信あり</span>
                </p>
              )}
            </div>
          )}
          <Link href="/admin/inquiries" className="w-fit text-base text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline">
            一覧を見る →
          </Link>
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">新着動画の再取得</p>
          <p className="text-base text-text-secondary">
            公開中の再生リストの動画数を YouTube で確認し、変わったものだけ動画一覧を取り直します。新着があればマイリスト登録者に通知します。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={handleRefresh} loading={refreshBusy}>
              新着動画を再取得
            </Button>
            {refreshResult && <span className="text-md text-text-muted">{refreshResult}</span>}
          </div>
          <div className="text-md text-text-muted">
            {lastBatch === undefined ? (
              <Skeleton className="h-4 w-40" />
            ) : lastBatch === null ? (
              '実行履歴はまだありません'
            ) : (
              <span className="inline-flex items-center gap-1">
                {lastBatch.status !== 'success' && <AlertIcon size={13} className="text-toast-error" />}
                最終実行: {lastBatch.executedAt ? new Date(lastBatch.executedAt).toLocaleString('ja-JP') : '-'}（
                {lastBatch.status === 'success' ? '成功' : '失敗'}）
              </span>
            )}
          </div>
          {lastBatch && lastBatch.refetchedCount !== undefined && (
            <LastBatchDetails batch={lastBatch} />
          )}
        </Card>
      </div>
    </div>
  );
}

/** 直近の新着取得で何をしたか（管理_ダッシュボード仕様書 §9.2 v1.9） */
function LastBatchDetails({ batch }: { batch: BatchLogSummary }) {
  const details = batch.newVideoDetails ?? [];
  const notFound = batch.notFoundPlaylists ?? [];
  const errors = batch.errorPlaylists ?? [];
  return (
    <div className="flex flex-col gap-3 text-md" data-testid="refresh-last-batch">
      <p className="text-text-secondary">
        公開 {batch.processedCount ?? 0} 件を確認、動画数が変わった {batch.refetchedCount ?? 0} 件を取り直し、新着 {batch.newVideoCount ?? 0} 本
        {!!batch.deferredCount && `。後回し ${batch.deferredCount} 件（次回に取り直し）`}
      </p>
      {batch.quotaExceeded && (
        <p className="inline-flex items-center gap-1 text-text-secondary">
          <AlertIcon size={13} className="text-toast-error" />
          YouTube API の1日のクォータが尽きたため途中で止めました。残りは次回に確認します
        </p>
      )}
      <div className="flex flex-col gap-1">
        <p className="font-medium text-text-primary">新着のあった再生リスト</p>
        {details.length === 0 ? (
          <p className="text-text-muted">新着はありません</p>
        ) : (
          <ul className="flex flex-col gap-1" aria-label="新着のあった再生リスト">
            {details.map((d) => (
              <li key={d.playlistId} className="flex items-baseline justify-between gap-3">
                <Link href={`/playlists/${d.playlistId}`} className="min-w-0 truncate text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
                  {d.title}
                </Link>
                <span className="shrink-0 font-medium text-text-primary">+{d.newVideos}本</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {notFound.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-text-primary">YouTubeで見つからない再生リスト（削除・非公開の可能性）</p>
          <ul className="flex flex-col gap-1" aria-label="YouTubeで見つからない再生リスト">
            {notFound.map((p) => (
              <li key={p.playlistId} className="min-w-0 truncate">
                <Link href={`/playlists/${p.playlistId}`} className="text-text-secondary underline-offset-4 hover:text-text-primary hover:underline">
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {errors.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="inline-flex items-center gap-1 font-medium text-text-primary">
            <AlertIcon size={13} className="text-toast-error" />
            確認・取り直しに失敗した再生リスト
          </p>
          <ul className="flex flex-col gap-1" aria-label="確認・取り直しに失敗した再生リスト">
            {errors.map((p) => (
              <li key={p.playlistId} className="min-w-0 break-words text-text-secondary">
                {p.title}（{p.message}）
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
