/**
 * お問い合わせスレッドの1メッセージ。ユーザーは左寄せ、運営は右寄せ（管理 お問い合わせ管理仕様書 §4.5）。
 * 管理画面の詳細（/admin/inquiries/[inquiryId]）とユーザー側のスレッド詳細（/contact/history/[inquiryId]）で共用する。
 * 吹き出しの面は専用トークンが無いため、子エリアと同じ控えめな面（bg-hover）と、運営側だけ一段明るい面（bg-selected）を使い、
 * 2色目の刺し色は足さない
 */
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export function formatInquiryDate(ms: number): string {
  if (!ms) return '-';
  return new Date(ms).toLocaleString('ja-JP');
}

export function ThreadMessage({
  name,
  sentAt,
  body,
  fromAdmin,
  attachments,
}: {
  name: string;
  sentAt: number;
  body: string;
  fromAdmin: boolean;
  /** 本文の下に出す添付画像（InquiryAttachments）。ユーザーのメッセージのみ */
  attachments?: ReactNode;
}) {
  return (
    <li className={cn('flex', fromAdmin ? 'justify-end' : 'justify-start')}>
      <div className={cn('flex max-w-[85%] min-w-0 flex-col gap-1 rounded-[8px] px-3 py-2', fromAdmin ? 'bg-bg-selected' : 'bg-bg-hover')}>
        <p className={cn('text-sm text-text-muted', fromAdmin && 'text-right')}>
          <span className="text-text-tertiary">{name}</span> {formatInquiryDate(sentAt)}
        </p>
        <p className="whitespace-pre-wrap break-words text-base text-text-secondary">{body}</p>
        {attachments}
      </div>
    </li>
  );
}
