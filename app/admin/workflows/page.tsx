/**
 * 審査ワークフロー一覧（/admin/workflows）。管理 審査ワークフロー仕様書 §5.1。
 *
 * 「通報」「提案」の2セクション構成（通報を上に置く）。各セクションがステータスタブと
 * ページングを独立して持つ。通報はレビューコメント通報と詳細ページからの変更の提案（対象ごとに1行）、提案は
 * 再生リスト登録提案・ゲームタイトル登録提案・チャンネル申請。絞り込み条件（審査種別・ジャンル・提出日）と
 * 要確認フラグ列は作らない（仕様書 §7）。
 *
 * 読み込みは lib/workflow-admin.ts（type の等価条件だけで読み、ステータスタブ・提出日時順・20件ページングは画面側）。
 */
'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { fetchProposalRows, fetchReportRows, type WorkflowRow } from '@/lib/workflow-admin';
import { isPendingStatus as isPending, workflowStatusLabel } from '@/lib/workflow-shared';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { AlertIcon, InventoryIcon } from '@/components/ui/icons';
import { workflowStatusTone } from '@/lib/label-tone-shared';

type Filter = 'all' | 'pending' | 'approved' | 'rejected';

const PAGE_SIZE = 20;

function formatDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('ja-JP');
}

export default function AdminWorkflowsPage() {
  const [reportRows, setReportRows] = useState<WorkflowRow[] | null>(null);
  const [proposalRows, setProposalRows] = useState<WorkflowRow[] | null>(null);

  useEffect(() => {
    fetchReportRows().then(setReportRows);
    fetchProposalRows().then(setProposalRows);
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading>審査ワークフロー</SectionHeading>
      <WorkflowSection
        heading="通報"
        rows={reportRows}
        emptyIcon={<AlertIcon />}
        emptyTitle="通報はありません"
        emptyDescription="レビューの通報や、詳細ページからの変更の提案があると、ここに一覧表示されます"
        noMatchText="該当する通報はありません"
      />
      <WorkflowSection
        heading="提案"
        rows={proposalRows}
        emptyIcon={<InventoryIcon />}
        emptyTitle="提案はありません"
        emptyDescription="一般ユーザーが再生リストやゲームタイトルの登録の提案、チャンネルの申請をすると、ここに一覧表示されます"
        noMatchText="該当する提案はありません"
      />
    </div>
  );
}

function WorkflowSection({
  heading,
  rows,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  noMatchText,
}: {
  heading: string;
  rows: WorkflowRow[] | null;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  noMatchText: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);

  const counts = useMemo(() => {
    if (!rows) return { all: 0, pending: 0, approved: 0, rejected: 0 };
    return {
      all: rows.length,
      pending: rows.filter((r) => isPending(r.status)).length,
      approved: rows.filter((r) => r.status === 'approved').length,
      rejected: rows.filter((r) => r.status === 'rejected').length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === 'all') return rows;
    if (filter === 'pending') return rows.filter((r) => isPending(r.status));
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  function changeFilter(next: Filter) {
    setFilter(next);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section>
      <p className="mb-3 text-lg font-medium text-text-primary">
        {heading} （{counts.all}件）
      </p>

      {rows === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="flex gap-3">
              <SkeletonText lines={2} className="flex-1" />
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <>
          <Tabs value={filter} onValueChange={(v) => changeFilter(v as Filter)}>
            <TabsList aria-label={`${heading}をステータスで絞り込み`} className="mb-4">
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
            <p className="py-10 text-center text-base text-text-muted">{noMatchText}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pageItems.map((r) => (
                <li key={r.id}>
                  <Card interactive flush>
                    <Link href={`/admin/workflows/${r.id}`} className="flex w-full flex-col gap-1 px-4 py-3 md:px-[18px] md:py-[14px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Tag tone={workflowStatusTone(r.status)}>{workflowStatusLabel(r.status)}</Tag>
                        <time className="text-sm text-text-muted">{formatDate(r.submittedAt)}</time>
                      </div>
                      <p className="text-base text-text-primary">{r.summary}</p>
                    </Link>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <Pagination page={page} pageCount={pageCount} onPageChange={setPage} className="mt-4" />
        </>
      )}
    </section>
  );
}
