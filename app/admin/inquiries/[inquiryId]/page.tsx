/**
 * お問い合わせ詳細・チャットスレッド（/admin/inquiries/[inquiryId]）。管理 お問い合わせ管理仕様書 §4 準拠。
 *
 * お問い合わせ本体と messages サブコレクションを onSnapshot で購読し、操作（ステータス変更・対応メモ・返信・
 * クローズ・再オープン）はすべて PATCH /api/admin/inquiries/[inquiryId]（Admin SDK）で行う。
 * スレッドの先頭にはお問い合わせ内容（inquiries.body）をユーザーのメッセージとして表示する。
 * 未ログインユーザーのお問い合わせはスレッドが無いため（§4.5）、返信欄の代わりにメールでの返信を案内する
 * （メール通知は未実装のため、mailto リンクから手動で送る。フェーズ7ステップ7-3-1の決定）。
 * ユーザーが添付した画像は本文の下にサムネイルで出し、クリックで拡大する（§4.6。管理者用の API から取得）。
 */
'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import {
  INQUIRY_MEMO_MAX,
  INQUIRY_REPLY_MAX,
  INQUIRY_STATUSES,
  inquiryCategoryLabel,
  parseInquiryAttachments,
  type InquiryAttachmentJson,
  type InquiryStatus,
} from '@/lib/inquiry-shared';
import { Card, CardDivider, SectionHeading } from '@/components/ui/Card';
import { Button, LinkButton } from '@/components/ui/Button';
import { SelectMenu } from '@/components/ui/DropdownMenu';
import { Field, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ChevronLeftIcon, ExternalLinkIcon } from '@/components/ui/icons';
import { ThreadMessage, formatInquiryDate as formatDate } from '@/components/contact/ThreadMessage';
import { InquiryAttachments } from '@/components/contact/InquiryAttachments';

interface InquiryDetail {
  userId: string | null;
  userName: string | null;
  email: string;
  category: string;
  body: string;
  relatedUrls: string[];
  attachments: InquiryAttachmentJson[];
  status: InquiryStatus;
  isGuest: boolean;
  operatorMemo: string | null;
  submittedAt: number;
}

interface Message {
  id: string;
  senderType: 'user' | 'admin';
  body: string;
  attachments: InquiryAttachmentJson[];
  sentAt: number;
}

export default function AdminInquiryDetailPage() {
  const { inquiryId } = useParams<{ inquiryId: string }>();
  const { toast } = useToast();

  const [inquiry, setInquiry] = useState<InquiryDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const [statusSaving, setStatusSaving] = useState(false);
  const [memoDraft, setMemoDraft] = useState('');
  const [memoEditing, setMemoEditing] = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);
  const [reply, setReply] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [threadBusy, setThreadBusy] = useState(false);

  useEffect(() => {
    if (!inquiryId) return;
    return onSnapshot(
      doc(db, 'inquiries', inquiryId),
      (snap) => {
        if (!snap.exists()) {
          setMissing(true);
          return;
        }
        const data = snap.data();
        setInquiry({
          userId: (data.userId as string | null) ?? null,
          userName: (data.userName as string | null) ?? null,
          email: (data.email as string) ?? '',
          category: (data.category as string) ?? 'other',
          body: (data.body as string) ?? '',
          relatedUrls: Array.isArray(data.relatedUrls) ? (data.relatedUrls as string[]) : [],
          attachments: parseInquiryAttachments(data.attachments),
          status: (data.status as InquiryStatus) ?? 'open',
          isGuest: data.isGuest === true,
          operatorMemo: (data.operatorMemo as string | null) ?? null,
          submittedAt: data.submittedAt?.toMillis?.() ?? 0,
        });
      },
      () => setLoadError(true),
    );
  }, [inquiryId]);

  useEffect(() => {
    if (!inquiryId) return;
    return onSnapshot(
      query(collection(db, 'inquiries', inquiryId, 'messages'), orderBy('sentAt', 'asc')),
      (snap) => {
        setMessages(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              senderType: data.senderType === 'admin' ? 'admin' : 'user',
              body: (data.body as string) ?? '',
              attachments: parseInquiryAttachments(data.attachments),
              sentAt: data.sentAt?.toMillis?.() ?? 0,
            };
          }),
        );
      },
      () => setLoadError(true),
    );
  }, [inquiryId]);

  if (missing) notFound();

  async function callApi(body: Record<string, unknown>) {
    const idToken = await auth.currentUser?.getIdToken();
    const res = await fetch(`/api/admin/inquiries/${encodeURIComponent(inquiryId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  }

  // 変更は即時保存（§4.3）
  async function changeStatus(next: InquiryStatus) {
    if (!inquiry || next === inquiry.status || statusSaving) return;
    setStatusSaving(true);
    try {
      await callApi({ action: 'update_status', status: next });
      toast({ type: 'success', message: 'ステータスを変更しました' });
    } catch {
      toast({ type: 'error', message: '変更に失敗しました。時間をおいて再試行してください' });
    } finally {
      setStatusSaving(false);
    }
  }

  async function saveMemo() {
    if (memoSaving) return;
    setMemoSaving(true);
    try {
      await callApi({ action: 'update_memo', operatorMemo: memoDraft });
      toast({ type: 'success', message: '対応メモを保存しました' });
      setMemoEditing(false);
    } catch {
      toast({ type: 'error', message: '保存に失敗しました。時間をおいて再試行してください' });
    } finally {
      setMemoSaving(false);
    }
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text || text.length > INQUIRY_REPLY_MAX || replySending) return;
    setReplySending(true);
    try {
      await callApi({ action: 'reply', body: text });
      setReply('');
      toast({ type: 'success', message: '返信を送信しました' });
    } catch {
      toast({ type: 'error', message: '送信に失敗しました。時間をおいて再試行してください' });
    } finally {
      setReplySending(false);
    }
  }

  async function runThreadAction(action: 'close' | 'reopen') {
    if (threadBusy) return;
    setThreadBusy(true);
    try {
      await callApi({ action });
      toast({ type: 'success', message: action === 'close' ? 'スレッドをクローズしました' : 'スレッドを再オープンしました' });
      setCloseConfirmOpen(false);
    } catch {
      toast({ type: 'error', message: '処理に失敗しました。時間をおいて再試行してください' });
    } finally {
      setThreadBusy(false);
    }
  }

  if (loadError) {
    return <p className="py-10 text-center text-base text-text-muted">読み込みに失敗しました。ページを再読み込みしてください</p>;
  }

  if (!inquiry) {
    return (
      <Card>
        <SkeletonText lines={4} />
      </Card>
    );
  }

  const isClosed = inquiry.status === 'resolved';
  const replyLength = reply.trim().length;
  const userLabel = inquiry.isGuest ? '—' : `${inquiry.userName ?? '(名前未設定)'}（${inquiry.userId ?? '-'}）`;
  const senderName = inquiry.isGuest ? 'ゲスト' : (inquiry.userName ?? 'ユーザー');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <LinkButton href="/admin/inquiries" variant="ghost" size="sm" className="mb-3 -ml-2">
          <ChevronLeftIcon size={14} />
          一覧へ戻る
        </LinkButton>
        <SectionHeading>お問い合わせ詳細</SectionHeading>
      </div>

      <Card className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 text-base">
          <dt className="text-text-tertiary">受付日時</dt>
          <dd className="text-text-secondary">{formatDate(inquiry.submittedAt)}</dd>
          <dt className="text-text-tertiary">種別</dt>
          <dd className="text-text-secondary">{inquiryCategoryLabel(inquiry.category)}</dd>
          <dt className="text-text-tertiary">ユーザー</dt>
          <dd className="break-all text-text-secondary">{userLabel}</dd>
          <dt className="text-text-tertiary">メール</dt>
          <dd className="min-w-0">
            <a
              href={`mailto:${inquiry.email}`}
              className="break-all text-text-primary underline underline-offset-[3px] hover:text-text-secondary"
            >
              {inquiry.email}
            </a>
          </dd>
          <dt className="text-text-tertiary">ステータス</dt>
          <dd>
            <SelectMenu
              value={inquiry.status}
              onValueChange={changeStatus}
              options={[...INQUIRY_STATUSES]}
              aria-label="ステータスを変更"
              align="start"
              disabled={statusSaving}
            />
          </dd>
        </dl>

        <CardDivider />

        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-text-primary">お問い合わせ内容</p>
          <p className="whitespace-pre-wrap break-words text-base text-text-secondary">{inquiry.body}</p>
          <InquiryAttachments inquiryId={inquiryId} attachments={inquiry.attachments} scope="admin" className="mt-1" />
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

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-text-primary">対応メモ（内部共有）</p>
            {!memoEditing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMemoDraft(inquiry.operatorMemo ?? '');
                  setMemoEditing(true);
                }}
              >
                編集する
              </Button>
            )}
          </div>
          {memoEditing ? (
            <div className="flex flex-col gap-2">
              <Field label={`対応メモ（${memoDraft.length}/${INQUIRY_MEMO_MAX}）`}>
                {(props) => (
                  <Textarea
                    {...props}
                    value={memoDraft}
                    onChange={(e) => setMemoDraft(e.target.value.slice(0, INQUIRY_MEMO_MAX))}
                    disabled={memoSaving}
                    rows={3}
                  />
                )}
              </Field>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setMemoEditing(false)} disabled={memoSaving}>
                  キャンセル
                </Button>
                <Button variant="primary" size="sm" onClick={saveMemo} loading={memoSaving}>
                  保存する
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-base text-text-secondary">{inquiry.operatorMemo || '（未記入）'}</p>
          )}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <p className="text-lg font-medium text-text-primary">チャットスレッド</p>

        {inquiry.isGuest ? (
          <p className="text-base text-text-secondary">
            未ログインのユーザーからのお問い合わせのため、スレッドはありません。上記のメールアドレス宛てにメールで返信してください。
          </p>
        ) : (
          <>
            <ol className="flex flex-col gap-3">
              <ThreadMessage name={senderName} sentAt={inquiry.submittedAt} body={inquiry.body} fromAdmin={false} />
              {messages.map((m) => (
                <ThreadMessage
                  key={m.id}
                  name={m.senderType === 'admin' ? '運営' : senderName}
                  sentAt={m.sentAt}
                  body={m.body}
                  fromAdmin={m.senderType === 'admin'}
                  attachments={<InquiryAttachments inquiryId={inquiryId} attachments={m.attachments} scope="admin" />}
                />
              ))}
            </ol>

            <CardDivider />

            {isClosed ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-base text-text-muted">このスレッドはクローズされています</p>
                <Button variant="secondary" onClick={() => runThreadAction('reopen')} loading={threadBusy}>
                  再オープンする
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Field
                  label="返信"
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
                      disabled={replySending}
                      rows={4}
                    />
                  )}
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setCloseConfirmOpen(true)} disabled={replySending}>
                    クローズ
                  </Button>
                  <Button
                    variant="primary"
                    onClick={sendReply}
                    loading={replySending}
                    disabled={replyLength === 0 || replyLength > INQUIRY_REPLY_MAX}
                  >
                    送信
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title="スレッドをクローズしますか?"
        description="クローズするとステータスが「対応済み」になり、返信できなくなります。再オープンすれば再び返信できます。"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCloseConfirmOpen(false)} disabled={threadBusy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={() => runThreadAction('close')} loading={threadBusy}>
            クローズする
          </Button>
        </div>
      </Modal>
    </div>
  );
}
