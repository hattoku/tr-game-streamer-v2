/**
 * お知らせ編集画面のプレビュー（管理 お知らせ管理仕様書 v2.0 §6.4）。タブ「TOPでの見え方」「メールでの見え方」で切り替え、
 * 入力に合わせてその場で変わる。
 * - TOP: ①TOP の運営からのお知らせ欄の1行、②「重要」ON なら重要エリアの枠、③お知らせ詳細。利用者側と同じ部品（components/notices/NoticeParts.tsx）
 * - メール: 件名・差出人と、後日のメール送信で使う文面（lib/notice-email.ts）。送信はまだできない（決定1）
 */
'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { ImportantNoticeCard, NoticeArticle, NoticeRow, NoticeRowList } from '@/components/notices/NoticeParts';
import { InfoIcon } from '@/components/ui/icons';
import { renderNoticeEmail, NOTICE_EMAIL_SENDER_NAME } from '@/lib/notice-email';
import { isImportantActive, noticeImageUrl, parseYoutubeVideoId, type NoticeInput, type PublicNotice } from '@/lib/notice-shared';

interface NoticePreviewProps {
  id: string | null;
  input: NoticeInput;
  /** 公開日（下書きは null。今日の日付で見せる） */
  publishedAt: number | null;
}

const noopSubscribe = () => () => {};

function PreviewLabel({ children }: { children: string }) {
  return <p className="text-sm font-medium text-text-muted">{children}</p>;
}

export function NoticePreview({ id, input, publishedAt }: NoticePreviewProps) {
  const [tab, setTab] = useState<'top' | 'email'>('top');
  // 日付は「公開したらこの日付」になるよう、下書きは開いた時点の日時で見せる
  const [openedAt] = useState(() => Date.now());
  // 日付・時刻はサーバー描画とずれる（タイムゾーン・時刻）ので、プレビューはブラウザで描いてから出す
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const notice: PublicNotice = useMemo(() => {
    const hasLink = input.attachmentType === 'link' || input.attachmentType === 'image_link';
    return {
      id: id ?? 'preview',
      title: input.title.trim() || '（タイトル未入力）',
      body: input.body.trim(),
      attachmentType: input.attachmentType,
      linkLabel: hasLink ? input.linkLabel.trim() || null : null,
      linkUrl: hasLink ? input.linkUrl.trim() || null : null,
      imageUrl: input.attachmentType === 'image_link' && input.imageFileName ? noticeImageUrl(input.imageFileName) : null,
      youtubeVideoId: input.attachmentType === 'youtube' ? parseYoutubeVideoId(input.youtubeUrl) : null,
      important: isImportantActive({ important: input.important, importantUntil: input.importantUntil }, openedAt),
      publishedAt: publishedAt ?? openedAt,
    };
  }, [id, input, publishedAt, openedAt]);

  const email = useMemo(
    () =>
      renderNoticeEmail(
        {
          id,
          title: input.title,
          body: input.body,
          attachmentType: input.attachmentType,
          linkLabel: input.linkLabel,
          linkUrl: input.linkUrl,
          imageFileName: input.imageFileName,
          youtubeVideoId: input.attachmentType === 'youtube' ? parseYoutubeVideoId(input.youtubeUrl) : null,
          publishedAt: publishedAt ?? openedAt,
        },
        { siteOrigin: typeof window === 'undefined' ? '' : window.location.origin },
      ),
    [id, input, publishedAt, openedAt],
  );

  if (!hydrated) return null;

  return (
    <section aria-label="プレビュー" className="flex flex-col gap-4" data-testid="notice-preview">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'top' | 'email')}>
        <TabsList aria-label="プレビューの切り替え">
          <TabsTrigger value="top">TOPでの見え方</TabsTrigger>
          <TabsTrigger value="email">メールでの見え方</TabsTrigger>
        </TabsList>

        <TabsContent value="top" className="mt-4 flex flex-col gap-5">
          {notice.important && (
            <div className="flex flex-col gap-2">
              <PreviewLabel>TOP の一番上（重要なお知らせ）</PreviewLabel>
              <ImportantNoticeCard notice={notice} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <PreviewLabel>TOP の一番下「運営からのお知らせ」の1行</PreviewLabel>
            <NoticeRowList>
              <li>
                <NoticeRow notice={notice} />
              </li>
            </NoticeRowList>
          </div>
          <div className="flex flex-col gap-2">
            <PreviewLabel>お知らせ詳細ページ</PreviewLabel>
            <div className="rounded-[12px] border border-border-card bg-bg-base p-4 md:p-5">
              <NoticeArticle notice={notice} interactive={false} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="email" className="mt-4 flex flex-col gap-3">
          <p className="flex items-start gap-2 rounded-[8px] border border-border-card bg-bg-hover px-3 py-2 text-md text-text-secondary">
            <InfoIcon size={16} className="mt-[2px] shrink-0 text-text-muted" />
            メール送信は準備中です。見え方の確認だけできます。
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-md">
            <dt className="text-text-muted">件名</dt>
            <dd className="min-w-0 break-words text-text-primary" data-testid="email-preview-subject">
              {email.subject}
            </dd>
            <dt className="text-text-muted">差出人</dt>
            <dd className="text-text-primary">{NOTICE_EMAIL_SENDER_NAME}</dd>
          </dl>
          {/* メールの HTML はページの CSS・script と混ざらないよう iframe に閉じる（script は動かさない） */}
          <iframe
            title="メールの本文のプレビュー"
            srcDoc={email.html}
            sandbox=""
            className="h-[640px] w-full rounded-[10px] border border-border-card bg-[#0f0f0f]"
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}
