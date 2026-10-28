/**
 * お問い合わせスレッド詳細（/contact/history/[inquiryId]）。ページ お問い合わせ履歴 仕様書 §4・§5・§1.1。
 * 取得・送信・再オープンはすべて本人専用の API（対応メモを渡さないため Firestore を直接読まない）。
 * 開いた時点でサーバー側が既読にする。リアルタイム更新はせず、自分の操作の後に取り直す。
 * スレッドの先頭にはお問い合わせ内容（body）を自分の最初のメッセージとして表示する（管理画面と同じ）。
 * 返信には画像を添付でき、添付画像は本文の下にサムネイルで出す（フォーム仕様書 §9、2026-10-27）。
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { InquiryApiError, fetchMyInquiry, postInquiryAction } from '@/lib/inquiries';
import {
  INQUIRY_ATTACHMENT_ERRORS,
  INQUIRY_REPLY_MAX,
  inquiryCategoryLabel,
  inquiryStatusLabel,
  isInquiryAttachmentErrorCode,
  type UserInquiryDetailJson,
} from '@/lib/inquiry-shared';
import { Card, CardDivider, SectionHeading } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { Field, Textarea } from '@/components/ui/Input';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { useToast } from '@/components/ui/Toast';
import { ChevronLeftIcon, ExternalLinkIcon } from '@/components/ui/icons';
import { ThreadMessage, formatInquiryDate } from '@/components/contact/ThreadMessage';
import { InquiryAttachments } from '@/components/contact/InquiryAttachments';
import { AttachmentPicker, type PickedImage } from '@/components/contact/AttachmentPicker';

export default function ContactThreadPage() {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [inquiry, setInquiry] = useState<UserInquiryDetailJson | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reply, setReply] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [imageError, setImageError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const load = useCallback(async () => {
    try {
      setInquiry(await fetchMyInquiry(inquiryId));
    } catch (e) {
      if (e instanceof InquiryApiError && e.code === 'not_found') setMissing(true);
      else setLoadError(true);
    }
  }, [inquiryId]);

  useEffect(() => {
    if (!user || !inquiryId) return;
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      await load();
    })();
  }, [user, inquiryId, load]);

  if (missing) notFound();

  async function sendReply() {
    const text = reply.trim();
    if (!text || text.length > INQUIRY_REPLY_MAX || sending) return;
    setSending(true);
    try {
      await postInquiryAction(
        inquiryId,
        { action: 'reply', body: text },
        images.map((i) => i.file),
      );
      setReply('');
      setImages([]);
      toast({ type: 'success', message: 'メッセージを送信しました' });
      await load();
    } catch (e) {
      if (e instanceof InquiryApiError && isInquiryAttachmentErrorCode(e.code)) {
        const message = INQUIRY_ATTACHMENT_ERRORS[e.code];
        setImageError(message);
        toast({ type: 'error', message });
        return;
      }
      const closed = e instanceof InquiryApiError && e.code === 'closed';
      toast({ type: 'error', message: closed ? 'このスレッドはクローズされています' : '送信に失敗しました。時間をおいて再試行してください' });
      if (closed) await load();
    } finally {
      setSending(false);
    }
  }

  async function reopen() {
    if (reopening) return;
    setReopening(true);
    try {
      await postInquiryAction(inquiryId, { action: 'reopen' });
      toast({ type: 'success', message: 'スレッドを再オープンしました' });
      await load();
    } catch {
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
    } finally {
      setReopening(false);
    }
  }

  const backLink = (
    <LinkButton href="/contact/history" variant="ghost" size="sm" className="mb-3 -ml-2 self-start">
      <ChevronLeftIcon size={14} />
      お問い合わせ一覧へ戻る
    </LinkButton>
  );

  if (loadError) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        {backLink}
        <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>
      </div>
    );
  }

  if (!inquiry) {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col">
        {backLink}
        <Card>
          <SkeletonText lines={4} />
        </Card>
      </div>
    );
  }

  const isClosed = inquiry.status === 'resolved';
  const replyLength = reply.trim().length;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col">
      {backLink}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>{inquiryCategoryLabel(inquiry.category)}</SectionHeading>
        <Tag emphasis={!isClosed}>{inquiryStatusLabel(inquiry.status)}</Tag>
      </div>

      <Card className="flex flex-col gap-4">
        <p className="text-md text-text-muted">受付日時: {formatInquiryDate(inquiry.submittedAt)}</p>

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">お問い合わせ内容</p>
          <p className="whitespace-pre-wrap break-words text-base text-text-secondary">{inquiry.body}</p>
          <InquiryAttachments inquiryId={inquiry.id} attachments={inquiry.attachments} scope="user" className="mt-1" />
          {inquiry.relatedUrls.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              <p className="text-md text-text-tertiary">関連URL</p>
              <ul className="flex flex-col gap-1">
                {inquiry.relatedUrls.map((url) => (
                  <li key={url} className="min-w-0">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 break-all text-base text-text-primary underline underline-offset-[3px] hover:text-text-secondary"
                    >
                      {url}
                      <ExternalLinkIcon size={12} className="shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <CardDivider />

        <div className="flex flex-col gap-3">
          <p className="text-lg font-medium text-text-primary">やり取り</p>
          <ol className="flex flex-col gap-3">
            <ThreadMessage name="あなた" sentAt={inquiry.submittedAt} body={inquiry.body} fromAdmin={false} />
            {inquiry.messages.map((m) => (
              <ThreadMessage
                key={m.id}
                name={m.senderType === 'admin' ? '運営' : 'あなた'}
                sentAt={m.sentAt}
                body={m.body}
                fromAdmin={m.senderType === 'admin'}
                attachments={<InquiryAttachments inquiryId={inquiry.id} attachments={m.attachments} scope="user" />}
              />
            ))}
          </ol>
        </div>

        <CardDivider />

        {isClosed ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base text-text-muted">このスレッドはクローズされています。追加でご連絡がある場合は再オープンしてください</p>
            <Button variant="secondary" onClick={reopen} loading={reopening}>
              再オープンする
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Field
              label="メッセージ"
              hint={
                <span className={replyLength > INQUIRY_REPLY_MAX ? 'text-input-error' : undefined}>
                  {replyLength.toLocaleString()} / {INQUIRY_REPLY_MAX.toLocaleString()}
                </span>
              }
            >
              {(props) => (
                <Textarea
                  {...props}
                  placeholder="メッセージを入力"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  disabled={sending}
                  rows={4}
                />
              )}
            </Field>
            <AttachmentPicker images={images} onChange={setImages} error={imageError} onError={setImageError} disabled={sending} />
            <div className="flex justify-end">
              <Button variant="primary" onClick={sendReply} loading={sending} disabled={replyLength === 0 || replyLength > INQUIRY_REPLY_MAX}>
                送信する
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
