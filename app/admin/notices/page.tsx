/**
 * お知らせ一覧（/admin/notices、管理 お知らせ管理仕様書 v2.0 §6.2）。過去分も含めた履歴をここで管理する。
 * `notices` を全件クライアント取得し（lib/notice-admin.ts）、更新日の新しい順に20件ずつ。状態のタブで絞り込む。
 * お問い合わせ一覧と同じく、PC・スマートフォンとも1件1カードで並べる（管理画面の一覧の作りに揃える）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Tag } from '@/components/ui/Tag';
import { BellIcon, InfoIcon, PlusIcon } from '@/components/ui/icons';
import { ImportantLabel } from '@/components/notices/NoticeParts';
import { fetchAdminNoticeRows, fetchUserDisplayNames, type AdminNoticeRow } from '@/lib/notice-admin';
import { NOTICE_STATUSES, formatNoticeDate, isImportantActive, noticeStatusLabel, type NoticeStatus } from '@/lib/notice-shared';

const PAGE_SIZE = 20;
type Filter = 'all' | NoticeStatus;

export default function AdminNoticesPage() {
  const [rows, setRows] = useState<AdminNoticeRow[] | null>(null);
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchAdminNoticeRows();
        setRows(list);
        setNames(await fetchUserDisplayNames(list.map((r) => r.updatedBy)));
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  const counts = useMemo(() => {
    const list = rows ?? [];
    return {
      all: list.length,
      draft: list.filter((r) => r.status === 'draft').length,
      published: list.filter((r) => r.status === 'published').length,
      unpublished: list.filter((r) => r.status === 'unpublished').length,
    };
  }, [rows]);

  const filtered = useMemo(() => (rows ?? []).filter((r) => filter === 'all' || r.status === filter), [rows, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>お知らせ</SectionHeading>
        <LinkButton href="/admin/notices/new" variant="primary">
          <PlusIcon size={16} />
          新規作成
        </LinkButton>
      </div>

      {loadError ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : rows === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <SkeletonText lines={2} />
            </Card>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<InfoIcon />} title="お知らせはまだありません" description="「新規作成」から、TOPやベルに出すお知らせを作れます" />
      ) : (
        <>
          <Tabs
            value={filter}
            onValueChange={(v) => {
              setFilter(v as Filter);
              setPage(1);
            }}
          >
            <TabsList aria-label="状態で絞り込み" scrollable>
              <TabsTrigger value="all" count={counts.all}>
                すべて
              </TabsTrigger>
              {NOTICE_STATUSES.map((s) => (
                <TabsTrigger key={s.value} value={s.value} count={counts[s.value]}>
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-base text-text-muted">該当するお知らせはありません</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="admin-notice-list">
              {pageItems.map((r) => {
                const importantNow = isImportantActive(r, now);
                return (
                  <li key={r.id}>
                    <Card interactive flush>
                      <Link href={`/admin/notices/${r.id}`} className="flex w-full min-w-0 flex-col gap-1 px-4 py-3 md:px-[18px] md:py-[14px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <Tag emphasis={r.status === 'published'}>{noticeStatusLabel(r.status)}</Tag>
                            {r.notifyBell && (
                              <span className="inline-flex items-center gap-1 text-sm text-text-tertiary" title="ベルで通知">
                                <BellIcon size={14} />
                                {r.bellSentCount !== null ? `${r.bellSentCount.toLocaleString()}人` : 'ベル'}
                              </span>
                            )}
                            {r.important && (importantNow ? <ImportantLabel /> : <span className="text-sm text-text-muted">重要（終了）</span>)}
                          </div>
                          <span className="text-sm text-text-muted">公開日 {r.publishedAt !== null ? formatNoticeDate(r.publishedAt) : '—'}</span>
                        </div>
                        <p className="truncate text-base text-text-primary">{r.title || '（タイトル未入力）'}</p>
                        <p className="truncate text-sm text-text-muted">
                          更新 {formatNoticeDate(r.updatedAt)}
                          {names.get(r.updatedBy) ? `（${names.get(r.updatedBy)}）` : ''}
                        </p>
                      </Link>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} className="mt-4" />
        </>
      )}
    </div>
  );
}
