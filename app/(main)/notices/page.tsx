/**
 * お知らせ一覧（/notices、管理 お知らせ管理仕様書 v2.0 §7.3）。ログイン不要。
 * 公開中を公開日の新しい順に20件ずつ。下の「もっと見る」で続きを読む。
 */
'use client';

import { useEffect, useState } from 'react';
import { SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { InfoIcon } from '@/components/ui/icons';
import { NoticeRow, NoticeRowList } from '@/components/notices/NoticeParts';
import { fetchNotices } from '@/lib/notices';
import { NOTICE_PAGE_SIZE, type PublicNotice } from '@/lib/notice-shared';

export default function NoticesPage() {
  const [notices, setNotices] = useState<PublicNotice[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    fetchNotices(NOTICE_PAGE_SIZE).then(
      (r) => {
        if (!active) return;
        setNotices(r.notices);
        setHasMore(r.hasMore);
      },
      () => {
        if (active) setLoadError(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  async function loadMore() {
    if (!notices || notices.length === 0) return;
    setLoadingMore(true);
    try {
      const r = await fetchNotices(NOTICE_PAGE_SIZE, notices[notices.length - 1].publishedAt);
      setNotices((prev) => {
        const seen = new Set((prev ?? []).map((n) => n.id));
        return [...(prev ?? []), ...r.notices.filter((n) => !seen.has(n.id))];
      });
      setHasMore(r.hasMore);
    } catch {
      setLoadError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-5">
      <SectionHeading>運営からのお知らせ</SectionHeading>
      {loadError && !notices ? (
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      ) : notices === null ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="読み込み中">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-[8px]" />
          ))}
        </div>
      ) : notices.length === 0 ? (
        <EmptyState icon={<InfoIcon />} title="お知らせはまだありません" />
      ) : (
        <>
          <NoticeRowList data-testid="notice-list">
            {notices.map((n) => (
              <li key={n.id}>
                <NoticeRow notice={n} href={`/notices/${n.id}`} />
              </li>
            ))}
          </NoticeRowList>
          {hasMore && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={loadMore} loading={loadingMore}>
                もっと見る
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
