/**
 * TOP の一番下の「運営からのお知らせ」欄（管理 お知らせ管理仕様書 v2.0 §7.2、ページ top 仕様書 §8A）。
 * 公開中の最新3件を「日付＋タイトル」の行で出し、見出しの右に「すべて見る」→ /notices。
 * 公開中が0件・読み込みに失敗したときはセクションごと出さない。
 */
'use client';

import { useEffect, useState } from 'react';
import { SectionHeaderRow } from '@/components/top/SectionHeaderRow';
import { NoticeRow, NoticeRowList } from '@/components/notices/NoticeParts';
import { fetchNotices } from '@/lib/notices';
import { NOTICE_TOP_COUNT, type PublicNotice } from '@/lib/notice-shared';

export function NoticesSection() {
  const [notices, setNotices] = useState<PublicNotice[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchNotices(NOTICE_TOP_COUNT)
      .then((r) => r.notices)
      .catch(() => [] as PublicNotice[])
      .then((list) => {
        if (active) setNotices(list);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!notices || notices.length === 0) return null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="top-notices-heading">
      <SectionHeaderRow title="運営からのお知らせ" viewAllHref="/notices" headingId="top-notices-heading" />
      <NoticeRowList data-testid="top-notices">
        {notices.map((n) => (
          <li key={n.id}>
            <NoticeRow notice={n} href={`/notices/${n.id}`} />
          </li>
        ))}
      </NoticeRowList>
    </section>
  );
}
