/**
 * お問い合わせ履歴（/contact/history）。ページ お問い合わせ履歴 仕様書 §3・§1.1。
 * 自分がログイン中に送ったお問い合わせを受付日時の降順で並べる。取得は本人専用の GET /api/inquiries
 * （対応メモを渡さないため Firestore を直接読まない）。未読インジケーターは運営の返信が最後に開いた後にあるもの。
 * 表示はテーブルではなくカードのリスト（管理画面の /admin/inquiries と揃えた）。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyInquiries } from '@/lib/inquiries';
import { inquiryCategoryLabel, inquiryStatusLabel, type UserInquirySummaryJson } from '@/lib/inquiry-shared';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { UnreadDot } from '@/components/ui/Badge';
import { CommentIcon } from '@/components/ui/icons';
import { formatInquiryDate } from '@/components/contact/ThreadMessage';

export default function ContactHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<UserInquirySummaryJson[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setItems(await fetchMyInquiries());
      } catch {
        setLoadError(true);
      }
    })();
  }, [user]);

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <SectionHeading>お問い合わせ履歴</SectionHeading>

      {loadError ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : items === null ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <SkeletonText lines={2} />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<CommentIcon />}
          title="お問い合わせはまだありません"
          description="ログイン中にお問い合わせフォームから送ると、ここでやり取りを確認できます"
          action={
            <LinkButton href="/contact" variant="secondary">
              お問い合わせフォームへ
            </LinkButton>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((r) => (
            <li key={r.id}>
              <Card interactive flush>
                <Link href={`/contact/history/${r.id}`} className="flex w-full items-start gap-3 px-4 py-3 md:px-[18px] md:py-[14px]">
                  <span className="flex w-[7px] shrink-0 justify-center pt-[9px]">{r.hasUnread && <UnreadDot />}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex min-w-0 flex-wrap items-center gap-2">
                        <Tag emphasis={r.status !== 'resolved'}>{inquiryStatusLabel(r.status)}</Tag>
                        <span className="text-base text-text-primary">{inquiryCategoryLabel(r.category)}</span>
                      </span>
                      <time className="text-sm text-text-muted">{formatInquiryDate(r.submittedAt)}</time>
                    </span>
                    <span className="truncate text-md text-text-secondary">{r.body}</span>
                    {r.hasUnread && <span className="text-sm text-text-tertiary">運営から新しい返信があります</span>}
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
