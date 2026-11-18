/**
 * 運営からのお知らせの表示部品（管理 お知らせ管理仕様書 v2.0 §7）。利用者側の画面と、管理画面のプレビュー（§6.4）で同じものを使う。
 * - ImportantLabel: 「重要」の小さなラベル
 * - NoticeRow: TOP の欄・お知らせ一覧の1行（日付＋タイトル、§7.2・§7.3）
 * - ImportantNoticeCard: TOP の一番上の重要なお知らせの枠（§7.1）
 * - NoticeArticle: お知らせ詳細の中身（日付・タイトル・本文・添付、§7.4）
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/cn';
import { AlertIcon, ChevronRightIcon, ExternalLinkIcon, XIcon } from '@/components/ui/icons';
import { formatNoticeDate, isExternalNoticeLink, type PublicNotice } from '@/lib/notice-shared';

export function ImportantLabel({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-[4px] bg-notice-important px-[6px] py-[1px] text-sm font-semibold leading-[1.5] text-notice-important-on',
        className,
      )}
    >
      重要
    </span>
  );
}

/** プレビューでは押しても移らないよう、href を渡さないと div で描く */
export function NoticeRow({ notice, href }: { notice: Pick<PublicNotice, 'title' | 'important' | 'publishedAt'>; href?: string }) {
  const inner = (
    <>
      <time className="shrink-0 text-md tabular-nums text-text-muted" dateTime={notice.publishedAt ? new Date(notice.publishedAt).toISOString() : undefined}>
        {formatNoticeDate(notice.publishedAt)}
      </time>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {notice.important && <ImportantLabel />}
        <span className="min-w-0 truncate text-base text-text-primary">{notice.title}</span>
      </span>
      <ChevronRightIcon size={14} className="shrink-0 text-text-faint" />
    </>
  );
  const className = 'flex items-center gap-3 px-4 py-3 md:gap-4 md:px-[18px]';
  return href ? (
    <Link href={href} className={cn(className, 'transition-colors duration-[120ms] hover:bg-bg-hover')}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/** お知らせの行を並べる枠（区切り線つき） */
export function NoticeRowList({ children, className, ...rest }: { children: ReactNode; className?: string; 'data-testid'?: string }) {
  return (
    <ul className={cn('divide-y divide-border-divider overflow-hidden rounded-[12px] border border-border-card bg-gradient-card', className)} {...rest}>
      {children}
    </ul>
  );
}

export function ImportantNoticeCard({
  notice,
  href,
  onDismiss,
}: {
  notice: Pick<PublicNotice, 'title' | 'body'>;
  href?: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="relative flex gap-3 rounded-[12px] border border-notice-important-border bg-notice-important-bg px-4 py-3 md:px-5 md:py-4"
      data-testid="important-notice"
    >
      <AlertIcon size={18} className="mt-[2px] shrink-0 text-notice-important" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pr-6">
        <div className="flex min-w-0 items-center gap-2">
          <ImportantLabel />
          <p className="min-w-0 truncate text-lg font-medium text-text-primary">{notice.title}</p>
        </div>
        {notice.body && <p className="line-clamp-2 whitespace-pre-line text-md leading-relaxed text-text-secondary">{notice.body}</p>}
        {href ? (
          <Link href={href} className="mt-1 inline-flex w-fit items-center gap-1 text-md font-medium text-notice-important-text hover:underline">
            詳しく見る
            <ChevronRightIcon size={14} />
          </Link>
        ) : (
          <span className="mt-1 inline-flex w-fit items-center gap-1 text-md font-medium text-notice-important-text">
            詳しく見る
            <ChevronRightIcon size={14} />
          </span>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="この重要なお知らせを閉じる"
          className="absolute right-2 top-2 rounded-[6px] p-[6px] text-text-muted transition-colors duration-[120ms] hover:bg-bg-hover hover:text-text-primary"
        >
          <XIcon size={16} />
        </button>
      )}
    </div>
  );
}

/** お知らせ詳細の中身。`interactive=false`（管理画面のプレビュー）ではリンク・動画を押しても移らない */
export function NoticeArticle({ notice, interactive = true }: { notice: PublicNotice; interactive?: boolean }) {
  const external = notice.linkUrl ? isExternalNoticeLink(notice.linkUrl) : false;
  const linkProps = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  const linkButtonClass =
    'inline-flex w-fit items-center gap-2 rounded-[8px] border border-border-control bg-gradient-secondary px-[14px] py-2 text-base font-medium text-text-btn shadow-control inset-shadow-highlight transition-colors duration-[120ms] hover:bg-gradient-secondary-hover';

  const linkButton = notice.linkUrl && (
    interactive ? (
      external ? (
        <a href={notice.linkUrl} className={linkButtonClass} {...linkProps}>
          {notice.linkLabel || 'リンクを開く'}
          <ExternalLinkIcon size={14} />
        </a>
      ) : (
        <Link href={notice.linkUrl} className={linkButtonClass}>
          {notice.linkLabel || 'リンクを開く'}
          <ChevronRightIcon size={14} />
        </Link>
      )
    ) : (
      <span className={linkButtonClass}>
        {notice.linkLabel || 'リンクを開く'}
        {external ? <ExternalLinkIcon size={14} /> : <ChevronRightIcon size={14} />}
      </span>
    )
  );

  return (
    <article className="flex flex-col gap-4" data-testid="notice-article">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <time className="text-md tabular-nums text-text-muted">{formatNoticeDate(notice.publishedAt)}</time>
          {notice.important && <ImportantLabel />}
        </div>
        <h1 className="text-2xl font-medium leading-snug text-text-primary">{notice.title}</h1>
      </header>
      <div className="whitespace-pre-wrap break-words text-base leading-[1.9] text-text-secondary">{notice.body}</div>

      {notice.attachmentType === 'image_link' && notice.imageUrl && (
        <div className="max-w-[640px]">
          {interactive && notice.linkUrl ? (
            external ? (
              <a href={notice.linkUrl} {...linkProps} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- 配信 API の画像をそのまま出す */}
                <img src={notice.imageUrl} alt={notice.linkLabel ?? ''} className="h-auto w-full rounded-[10px] border border-border-card" />
              </a>
            ) : (
              <Link href={notice.linkUrl} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element -- 配信 API の画像をそのまま出す */}
                <img src={notice.imageUrl} alt={notice.linkLabel ?? ''} className="h-auto w-full rounded-[10px] border border-border-card" />
              </Link>
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- 配信 API の画像をそのまま出す
            <img src={notice.imageUrl} alt={notice.linkLabel ?? ''} className="h-auto w-full rounded-[10px] border border-border-card" />
          )}
        </div>
      )}
      {(notice.attachmentType === 'link' || notice.attachmentType === 'image_link') && linkButton}

      {notice.attachmentType === 'youtube' && notice.youtubeVideoId && (
        <div className="relative aspect-video w-full max-w-[720px] overflow-hidden rounded-[10px] border border-border-card bg-bg-player">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${notice.youtubeVideoId}`}
            title="YouTube 動画"
            className={cn('absolute inset-0 size-full', !interactive && 'pointer-events-none')}
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            allowFullScreen
          />
        </div>
      )}
    </article>
  );
}
