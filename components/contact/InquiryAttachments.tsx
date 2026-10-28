/**
 * お問い合わせの添付画像の表示（ページ お問い合わせフォーム仕様書 §9.6、管理 お問い合わせ管理仕様書 §4.6）。
 * サムネイルで並べ、クリックでモーダルに拡大表示する。ダウンロードボタンは付けない（2026-10-25 ユーザー決定）。
 * Storage はクライアントから読めず、閲覧 API は Authorization ヘッダーが要るため、<img src> に API の URL を直接は書けない。
 * fetch で取得して Blob URL にして表示する（画面を離れたら破棄する）。
 */
'use client';

import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { inquiryAttachmentFileName, type InquiryAttachmentJson } from '@/lib/inquiry-shared';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/components/ui/cn';

/** 取得先。ユーザー側（お問い合わせ履歴）は本人用、管理画面は管理者用の API */
export type InquiryAttachmentScope = 'user' | 'admin';

const THUMB_HEIGHT = 96;
const THUMB_WIDTH_MAX = 160;

function attachmentUrl(scope: InquiryAttachmentScope, inquiryId: string, attachment: InquiryAttachmentJson): string {
  const base = scope === 'admin' ? '/api/admin/inquiries' : '/api/inquiries';
  return `${base}/${encodeURIComponent(inquiryId)}/attachments/${inquiryAttachmentFileName(attachment)}`;
}

function useAttachmentObjectUrl(url: string): { src?: string; failed: boolean } {
  const [state, setState] = useState<{ url: string; src?: string; failed: boolean }>({ url, failed: false });

  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch(url, { headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url, src: objectUrl, failed: false });
      } catch {
        if (!cancelled) setState({ url, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  // url が変わった直後は前の画像を出さない
  return state.url === url ? state : { failed: false };
}

function AttachmentThumb({ url, attachment, index }: { url: string; attachment: InquiryAttachmentJson; index: number }) {
  const { src, failed } = useAttachmentObjectUrl(url);
  const [open, setOpen] = useState(false);
  const ratio = attachment.width > 0 && attachment.height > 0 ? attachment.width / attachment.height : 4 / 3;
  const width = Math.min(THUMB_WIDTH_MAX, Math.round(THUMB_HEIGHT * ratio));
  const label = `添付画像 ${index + 1}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!src}
        aria-label={`${label}を拡大する`}
        style={{ width, height: THUMB_HEIGHT }}
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border border-surface-border bg-bg-hover',
          src && 'transition-opacity duration-[120ms] hover:opacity-80',
        )}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={label} className="size-full object-cover" />
        ) : (
          <span className="px-2 text-center text-sm text-text-muted">{failed ? '表示できません' : '読み込み中'}</span>
        )}
      </button>
      {src && (
        <Modal open={open} onOpenChange={setOpen} title={label} maxWidthClassName="max-w-[960px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} className="mx-auto max-h-[70dvh] w-auto max-w-full rounded-[6px] object-contain" />
        </Modal>
      )}
    </>
  );
}

export function InquiryAttachments({
  inquiryId,
  attachments,
  scope,
  className,
}: {
  inquiryId: string;
  attachments: InquiryAttachmentJson[];
  scope: InquiryAttachmentScope;
  className?: string;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-2', className)} aria-label="添付画像">
      {attachments.map((a, i) => (
        <li key={a.id} className="min-w-0">
          {a.deleted ? (
            <p
              style={{ height: THUMB_HEIGHT }}
              className="flex max-w-[200px] items-center rounded-[6px] border border-dashed border-surface-border px-3 text-sm text-text-muted"
            >
              保存期間を過ぎたため削除しました
            </p>
          ) : (
            <AttachmentThumb url={attachmentUrl(scope, inquiryId, a)} attachment={a} index={i} />
          )}
        </li>
      ))}
    </ul>
  );
}
