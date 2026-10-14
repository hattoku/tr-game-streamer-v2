/**
 * お問い合わせ一覧（/admin/inquiries）。管理 お問い合わせ管理仕様書 §3 準拠。
 *
 * `inquiries` を全件クライアント取得し（並び替え・絞り込み・20件ページングはクライアント側。
 * /admin/workflows と同じ簡易実装方針で複合インデックス不要）、受付日時の降順で並べる。
 * フェーズ7ステップ7-3-1の決定により、日付範囲の絞り込み（§3.2）と 20/50/100件の表示件数切替（§3.5）は
 * 作らない（件数が少ないうちは不要。仕様書 実装注記参照）。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  INQUIRY_CATEGORIES,
  INQUIRY_STATUSES,
  inquiryCategoryLabel,
  inquiryStatusLabel,
  type InquiryCategory,
  type InquiryStatus,
} from '@/lib/inquiry-shared';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Pagination } from '@/components/ui/Pagination';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { CommentIcon } from '@/components/ui/icons';

interface InquiryRow {
  id: string;
  category: string;
  status: string;
  userName: string | null;
  isGuest: boolean;
  email: string;
  body: string;
  submittedAt: number;
}

const PAGE_SIZE = 20;

const CATEGORY_OPTIONS = [{ value: 'all' as const, label: 'すべての種別' }, ...INQUIRY_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))];
const STATUS_OPTIONS = [{ value: 'all' as const, label: 'すべてのステータス' }, ...INQUIRY_STATUSES];

function formatDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('ja-JP');
}

export default function AdminInquiriesPage() {
  const [rows, setRows] = useState<InquiryRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [category, setCategory] = useState<InquiryCategory | 'all'>('all');
  const [status, setStatus] = useState<InquiryStatus | 'all'>('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'inquiries'));
        const list = snap.docs
          .map((d): InquiryRow => {
            const data = d.data();
            return {
              id: d.id,
              category: (data.category as string) ?? 'other',
              status: (data.status as string) ?? 'open',
              userName: (data.userName as string | null) ?? null,
              isGuest: data.isGuest === true,
              email: (data.email as string) ?? '',
              body: (data.body as string) ?? '',
              submittedAt: data.submittedAt?.toMillis?.() ?? 0,
            };
          })
          .sort((a, b) => b.submittedAt - a.submittedAt);
        setRows(list);
      } catch {
        setLoadError(true);
      }
    })();
  }, []);

  // 複数条件は AND（§3.2）。キーワードはお問い合わせ内容・メールアドレスが対象
  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = keyword.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (category === 'all' || r.category === category) &&
        (status === 'all' || r.status === status) &&
        (!q || r.body.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)),
    );
  }, [rows, category, status, keyword]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading>お問い合わせ</SectionHeading>

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
        <EmptyState icon={<CommentIcon />} title="お問い合わせはありません" description="お問い合わせフォームから送信されると、ここに一覧表示されます" />
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
            <SelectMenu
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setPage(1);
              }}
              options={CATEGORY_OPTIONS}
              prefix="種別:"
              aria-label="種別で絞り込み"
              align="start"
              className="w-full md:w-auto"
            />
            <SelectMenu
              value={status}
              onValueChange={(v) => {
                setStatus(v);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              prefix="ステータス:"
              aria-label="ステータスで絞り込み"
              align="start"
              className="w-full md:w-auto"
            />
            <Input
              type="search"
              placeholder="内容・メールアドレスで検索"
              aria-label="キーワード検索"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              className="md:w-[320px]"
            />
          </div>

          <p className="text-md text-text-muted">{filtered.length.toLocaleString()}件</p>

          {filtered.length === 0 ? (
            <p className="py-10 text-center text-base text-text-muted">該当するお問い合わせはありません</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {pageItems.map((r) => (
                <li key={r.id}>
                  <Card interactive flush>
                    <Link href={`/admin/inquiries/${r.id}`} className="flex w-full min-w-0 flex-col gap-1 px-4 py-3 md:px-[18px] md:py-[14px]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Tag emphasis={r.status === 'open'}>{inquiryStatusLabel(r.status)}</Tag>
                          <span className="text-base text-text-primary">{inquiryCategoryLabel(r.category)}</span>
                        </div>
                        <time className="text-sm text-text-muted">{formatDate(r.submittedAt)}</time>
                      </div>
                      <p className="truncate text-md text-text-secondary">{r.body}</p>
                      <p className="truncate text-sm text-text-muted">ユーザー: {r.isGuest ? '—' : (r.userName ?? '(名前未設定)')}</p>
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
  );
}
