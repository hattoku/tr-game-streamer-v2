/**
 * 審査ワークフロー一覧（/admin/workflows）。管理_審査ワークフロー仕様書 §7 準拠。
 *
 * §7.1 どおり「通報」「提案」の2セクション構成（通報を上に置く）。各セクションがステータスタブと
 * ページングを独立して持つ。通報はレビューコメント通報のみ（フェーズ6ステップ3）、提案は
 * 再生リスト登録提案・ゲームタイトル登録提案（フェーズ7ステップ7-4。ゲームタイトル編集提案は投稿経路が無い）。
 * 絞り込み条件（審査種別・ジャンル・提出日）は件数が少ないうちは不要として省略。要確認フラグ列は
 * AI運営者が未実装のため省略。
 *
 * `workflows`はtypeの等価条件（提案は in）のみでクライアント取得し（複合インデックス不要）、ステータスタブ・
 * 提出日時順ソート・20件ページングはクライアント側で行う（/channels等と同じ簡易実装方針）。
 */
'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { reportReasonLabel } from '@/lib/report-reasons';
import { GAME_PROPOSAL_TYPE, PROPOSAL_TYPE_LABEL, PROPOSAL_TYPES } from '@/lib/proposal-shared';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { AlertIcon, InventoryIcon } from '@/components/ui/icons';

type WorkflowStatus = 'reviewing_lv1' | 'reviewing_lv2' | 'approved' | 'rejected';

interface WorkflowRow {
  id: string;
  /** 一覧の1行に出す説明 */
  summary: string;
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

function isPending(status: WorkflowStatus): boolean {
  return status === 'reviewing_lv1' || status === 'reviewing_lv2';
}

async function fetchReportRows(): Promise<WorkflowRow[]> {
  const snap = await getDocs(query(collection(db, 'workflows'), where('type', '==', 'review_report')));
  const playlistIds = [...new Set(snap.docs.map((d) => d.data().reportData?.playlistId as string).filter(Boolean))];
  const playlistTitles = new Map<string, string>();
  await Promise.all(
    playlistIds.map(async (id) => {
      const playlistSnap = await getDoc(doc(db, 'playlists', id));
      playlistTitles.set(id, (playlistSnap.data()?.title as string) ?? '(削除済みの再生リスト)');
    }),
  );
  return snap.docs.map((d): WorkflowRow => {
    const data = d.data();
    const playlistId = (data.reportData?.playlistId as string) ?? '';
    const playlistTitle = playlistTitles.get(playlistId) ?? '(削除済みの再生リスト)';
    return {
      id: d.id,
      summary: `${reportReasonLabel((data.reportData?.reason as string) ?? null)} — 「${playlistTitle}」のレビュー`,
      status: (data.status as WorkflowStatus) ?? 'reviewing_lv1',
      submittedAt: data.submittedAt?.toMillis?.() ?? 0,
    };
  });
}

async function fetchProposalRows(): Promise<WorkflowRow[]> {
  const snap = await getDocs(query(collection(db, 'workflows'), where('type', 'in', [...PROPOSAL_TYPES])));
  return snap.docs.map((d): WorkflowRow => {
    const data = d.data();
    const type = data.type as string;
    const name = type === GAME_PROPOSAL_TYPE ? (data.proposalData?.gameTitle as string) : (data.proposalData?.title as string);
    return {
      id: d.id,
      summary: `${PROPOSAL_TYPE_LABEL[type] ?? type} — 「${name ?? ''}」`,
      status: (data.status as WorkflowStatus) ?? 'reviewing_lv1',
      submittedAt: data.submittedAt?.toMillis?.() ?? 0,
    };
  });
}

export default function AdminWorkflowsPage() {
  const [reportRows, setReportRows] = useState<WorkflowRow[] | null>(null);
  const [proposalRows, setProposalRows] = useState<WorkflowRow[] | null>(null);

  useEffect(() => {
    const byNewest = (rows: WorkflowRow[]) => rows.sort((a, b) => b.submittedAt - a.submittedAt);
    fetchReportRows().then((rows) => setReportRows(byNewest(rows)));
    fetchProposalRows().then((rows) => setProposalRows(byNewest(rows)));
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading>審査ワークフロー</SectionHeading>
      <WorkflowSection
        heading="通報"
        rows={reportRows}
        emptyIcon={<AlertIcon />}
        emptyTitle="通報はありません"
        emptyDescription="レビューが通報されると、ここに一覧表示されます"
        noMatchText="該当する通報はありません"
      />
      <WorkflowSection
        heading="提案"
        rows={proposalRows}
        emptyIcon={<InventoryIcon />}
        emptyTitle="提案はありません"
        emptyDescription="一般ユーザーが再生リストやゲームタイトルの登録を提案すると、ここに一覧表示されます"
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
                        <Tag emphasis={isPending(r.status)}>{STATUS_LABEL[r.status]}</Tag>
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
