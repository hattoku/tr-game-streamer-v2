/**
 * 管理画面ダッシュボード（/admin）。管理_ダッシュボード仕様書 準拠。
 *
 * フェーズ6ステップ3「管理画面の最小版」の決定（wiki/sources参照）により、仕様書が定義する
 * 5セクション構成（要対応アラート／審査ワークフローサマリー／お問い合わせサマリー／
 * モニタリングサマリー／クイックリンク）のうち、データ源が存在しスコープに含まれる
 * 「通報サマリー」「新着動画再取得（旧・通知ページ下部の管理者用暫定カード）」の2セクションのみに
 * 縮小する。お問い合わせ・モニタリング・クォータ・不正検知・マスタ管理等はデータ源／機能自体が
 * 未実装のため今回は置かない。オーナー限定表示の出し分けも行わない（operator/owner共通）。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, orderBy, limit, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';

interface BatchLogSummary {
  status: string;
  executedAt: number;
}

export default function AdminDashboardPage() {
  const { toast } = useToast();

  const [pendingReportCount, setPendingReportCount] = useState<number | null>(null);
  const [lastBatch, setLastBatch] = useState<BatchLogSummary | null | undefined>(undefined);

  const [refreshBusy, setRefreshBusy] = useState(false);
  const [refreshResult, setRefreshResult] = useState<string | null>(null);

  async function loadPendingReportCount() {
    const snap = await getDocs(
      query(collection(db, 'workflows'), where('type', '==', 'review_report'), where('status', '==', 'reviewing_lv1')),
    );
    setPendingReportCount(snap.size);
  }

  async function loadLastBatch() {
    // functionNameでの絞り込みは行わず直近1件のみ見る（orderByと別フィールドのequalityを
    // 組み合わせると複合インデックスが必要になるため。現状batch_logsへの書き込みはvideo_updateのみ）
    const snap = await getDocs(query(collection(db, 'batch_logs'), orderBy('executedAt', 'desc'), limit(1)));
    const doc = snap.docs[0];
    setLastBatch(
      doc
        ? { status: (doc.data().status as string) ?? 'unknown', executedAt: doc.data().executedAt?.toMillis?.() ?? 0 }
        : null,
    );
  }

  useEffect(() => {
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      await Promise.all([loadPendingReportCount(), loadLastBatch()]);
    })();
  }, []);

  async function handleRefresh() {
    setRefreshBusy(true);
    setRefreshResult(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/refresh-new-videos', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
      const body = await res.json();
      if (!res.ok) {
        setRefreshResult('再取得に失敗しました');
        toast({ type: 'error', message: '再取得に失敗しました' });
        return;
      }
      setRefreshResult(
        `確認済み ${body.playlistsChecked} 件中 ${body.playlistsWithNewVideos} 件に新着（動画 ${body.totalNewVideos} 本、通知 ${body.notificationsCreated} 件生成）`,
      );
      toast({ type: 'success', message: '新着動画の再取得が完了しました' });
      loadLastBatch();
    } catch {
      setRefreshResult('再取得に失敗しました');
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setRefreshBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading>ダッシュボード</SectionHeading>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">審査ワークフロー（通報）</p>
          {pendingReportCount === null ? (
            <Skeleton className="h-9 w-16" />
          ) : pendingReportCount === 0 ? (
            <p className="inline-flex items-center gap-2 text-base text-text-secondary">
              <CheckIcon size={16} className="text-text-tertiary" />
              未処理の通報はありません
            </p>
          ) : (
            <p className="text-score font-semibold text-text-primary">
              {pendingReportCount.toLocaleString()} <span className="text-md font-normal text-text-muted">件 未処理</span>
            </p>
          )}
          <Link href="/admin/workflows" className="w-fit text-base text-text-tertiary underline-offset-4 hover:text-text-primary hover:underline">
            一覧を見る →
          </Link>
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">新着動画の再取得</p>
          <p className="text-base text-text-secondary">
            マイリスト登録のある公開再生リストを YouTube から再取得し、新着動画があれば登録ユーザーに通知を生成します。
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
        </Card>
      </div>
    </div>
  );
}
