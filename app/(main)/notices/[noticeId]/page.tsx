/**
 * お知らせ詳細（/notices/[noticeId]、管理 お知らせ管理仕様書 v2.0 §7.4）。ログイン不要。
 * 日付・（重要なら）「重要」・タイトル・本文・添付（リンク／画像付きリンク／YouTube 埋め込み）。
 * 非公開・存在しないものは「このお知らせは公開を終了しました」（ベルの通知から開いた人向け）。
 */
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText, Skeleton } from '@/components/ui/Skeleton';
import { ChevronLeftIcon, InfoIcon } from '@/components/ui/icons';
import { NoticeArticle } from '@/components/notices/NoticeParts';
import { fetchNotice } from '@/lib/notices';
import type { PublicNotice } from '@/lib/notice-shared';

export default function NoticeDetailPage() {
  const { noticeId } = useParams<{ noticeId: string }>();
  // undefined: 読み込み中、null: 見つからない（非公開・削除）
  const [state, setState] = useState<{ id: string; notice: PublicNotice | null; error: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    fetchNotice(noticeId).then(
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
  const title = current?.notice?.title;
  useEffect(() => {
    if (title) document.title = `${title} | プレミテ`;
  }, [title]);

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      {!current ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="読み込み中">
          <Skeleton className="h-4 w-[120px]" />
          <Skeleton className="h-8 w-3/4" />
          <SkeletonText lines={4} />
        </div>
      ) : current.error ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : !current.notice ? (
        <EmptyState
          icon={<InfoIcon />}
          title="このお知らせは公開を終了しました"
          action={
            <LinkButton href="/notices" variant="secondary">
              お知らせ一覧へ
            </LinkButton>
          }
        />
      ) : (
        <NoticeArticle notice={current.notice} />
      )}
      {current?.notice && (
        <div className="border-t border-border-divider pt-4">
          <LinkButton href="/notices" variant="ghost" size="sm">
            <ChevronLeftIcon size={14} />
            お知らせ一覧へ戻る
          </LinkButton>
        </div>
      )}
    </div>
  );
}
