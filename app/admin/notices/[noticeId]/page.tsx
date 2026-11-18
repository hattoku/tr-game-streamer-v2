/**
 * お知らせの編集（/admin/notices/[noticeId]、管理 お知らせ管理仕様書 v2.0 §5・§6.3）。
 */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { NoticeEditor } from '@/components/admin/notices/NoticeEditor';
import { fetchAdminNotice, type AdminNoticeDetail } from '@/lib/notice-admin';

export default function AdminNoticeEditPage() {
  const { noticeId } = useParams<{ noticeId: string }>();
  const [state, setState] = useState<{ id: string; notice: AdminNoticeDetail | null; error: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    fetchAdminNotice(noticeId).then(
      (notice) => {
        if (active) setState({ id: noticeId, notice, error: false });
      },
      () => {
        if (active) setState({ id: noticeId, notice: null, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [noticeId]);

  const current = state?.id === noticeId ? state : null;

  return (
    <div className="flex flex-col gap-4">
      <LinkButton href="/admin/notices" variant="ghost" size="sm" className="w-fit">
        <ChevronLeftIcon size={14} />
        お知らせ一覧へ
      </LinkButton>
      <SectionHeading>お知らせを編集する</SectionHeading>
      {!current ? (
        <Card aria-busy="true">
          <SkeletonText lines={6} />
        </Card>
      ) : current.error ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : !current.notice ? (
        <p className="py-10 text-center text-base text-text-muted">このお知らせは見つかりませんでした（削除された可能性があります）</p>
      ) : (
        <NoticeEditor key={current.notice.id} initial={current.notice} />
      )}
    </div>
  );
}
