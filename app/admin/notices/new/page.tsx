/**
 * お知らせの新規作成（/admin/notices/new、管理 お知らせ管理仕様書 v2.0 §6.3）。
 * 最初の「下書き保存」「公開する」で下書きを作り、URL を /admin/notices/[noticeId] に替える。
 */
'use client';

import { SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { NoticeEditor } from '@/components/admin/notices/NoticeEditor';

export default function AdminNoticeNewPage() {
  return (
    <div className="flex flex-col gap-4">
      <LinkButton href="/admin/notices" variant="ghost" size="sm" className="w-fit">
        <ChevronLeftIcon size={14} />
        お知らせ一覧へ
      </LinkButton>
      <SectionHeading>お知らせを作る</SectionHeading>
      <NoticeEditor initial={null} />
    </div>
  );
}
