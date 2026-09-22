/**
 * 審査ワークフロー一覧（/admin/workflows）。管理_審査ワークフロー仕様書 §7 準拠。
 *
 * フェーズ6ステップ3の決定により「通報」セクションのみを実装する（「提案」セクションは対象データ
 * （再生リスト登録提案・ゲームタイトル登録/編集提案）自体が一般ユーザー提案フロー未実装のため存在しない。
 * 提案フロー実装時に §7 の2セクション構成へ拡張する）。絞り込み条件（審査種別・ジャンル・提出日）は
 * 対象が「レビューコメント通報」1種類のみのため省略。要確認フラグ列はAI運営者が未実装のため省略。
 *
 * `workflows`はtypeの等価条件のみでクライアント取得し（複合インデックス不要）、ステータスタブ・
 * 提出日時順ソート・20件ページングはクライアント側で行う（/channels等と同じ簡易実装方針）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { reportReasonLabel } from '@/lib/report-reasons';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { AlertIcon } from '@/components/ui/icons';

type WorkflowStatus = 'reviewing_lv1' | 'reviewing_lv2' | 'approved' | 'rejected';

interface ReportRow {
  id: string;
  reason: string | null;
  playlistId: string;
  playlistTitle: string;
  status: WorkflowStatus;
  submittedAt: number;
}

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  reviewing_lv1: '審査中',
  reviewing_lv2: '審査中',
  approved: '承認',
  rejected: '却下',
};

type Filter = 'all' | 'pending' | 'approved' | 'rejected';

const PAGE_SIZE = 20;

function formatDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('ja-JP');
}

export default function AdminWorkflowsPage() {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db, 'workflows'), where('type', '==', 'review_report')));
      const playlistIds = [...new Set(snap.docs.map((d) => d.data().reportData?.playlistId as string).filter(Boolean))];
      const playlistTitles = new Map<string, string>();
      await Promise.all(
        playlistIds.map(async (id) => {
          const playlistSnap = await getDoc(doc(db, 'playlists', id));
          playlistTitles.set(id, (playlistSnap.data()?.title as string) ?? '(削除済みの再生リスト)');
        }),
      );
      const list = snap.docs
        .map((d): ReportRow => {
          const data = d.data();
          const playlistId = (data.reportData?.playlistId as string) ?? '';
          return {
            id: d.id,
            reason: (data.reportData?.reason as string) ?? null,
            playlistId,
            playlistTitle: playlistTitles.get(playlistId) ?? '(削除済みの再生リスト)',
            status: (data.status as WorkflowStatus) ?? 'reviewing_lv1',
            submittedAt: data.submittedAt?.toMillis?.() ?? 0,
          };
        })
        .sort((a, b) => b.submittedAt - a.submittedAt);
      setRows(list);
    })();
  }, []);

  const counts = useMemo(() => {
    if (!rows) return { all: 0, pending: 0, approved: 0, rejected: 0 };
    return {
      all: rows.length,
      pending: rows.filter((r) => r.status === 'reviewing_lv1' || r.status === 'reviewing_lv2').length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === 'all') return rows;
    if (filter === 'pending') return rows.filter((r) => r.status === 'reviewing_lv1' || r.status === 'reviewing_lv2');
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  function changeFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading>審査ワークフロー</SectionHeading>

      <div>
        <p className="mb-3 text-lg font-medium text-text-primary">通報 （{counts.all}件）</p>

        {rows === null ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="flex gap-3">
                <SkeletonText lines={2} className="flex-1" />
              </Card>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<AlertIcon />} title="通報はありません" description="レビューが通報されると、ここに一覧表示されます" />
        ) : (
          <>
            <Tabs value={filter} onValueChange={(v) => changeFilter(v as Filter)}>
              <TabsList aria-label="ステータスで絞り込み" className="mb-4">
                <TabsTrigger value="all" count={counts.all}>
                  すべて
                </TabsTrigger>
                <TabsTrigger value="pending" count={counts.pending}>
                  未処理
                </TabsTrigger>
                <TabsTrigger value="approved" count={counts.approved}>
                  承認
                </TabsTrigger>
                <TabsTrigger value="rejected" count={counts.rejected}>
                  却下
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {filtered.length === 0 ? (
              <p className="py-10 text-center text-base text-text-muted">該当する通報はありません</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {pageItems.map((r) => (
                  <li key={r.id}>
                    <Card interactive flush>
                      <Link href={`/admin/workflows/${r.id}`} className="flex w-full flex-col gap-1 px-4 py-3 md:px-[18px] md:py-[14px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Tag emphasis={r.status === 'reviewing_lv1' || r.status === 'reviewing_lv2'}>{STATUS_LABEL[r.status]}</Tag>
                          <time className="text-sm text-text-muted">{formatDate(r.submittedAt)}</time>
                        </div>
                        <p className="text-base text-text-primary">{reportReasonLabel(r.reason)} — 「{r.playlistTitle}」のレビュー</p>
                      </Link>
                    </Card>
                  </li>
                ))}
              </ul>
            )}

            <Pagination page={page} pageCount={pageCount} onPageChange={setPage} className="mt-4" />
          </>
        )}
      </div>
    </div>
  );
}
