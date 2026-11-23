/**
 * お知らせの作成・編集（/admin/notices/new・/admin/notices/[noticeId]、管理 お知らせ管理仕様書 v2.0 §5・§6.3・§6.4）。
 * PC は左に入力欄・右にプレビュー、スマートフォンは入力欄の下にプレビュー。
 * 状態ごとに押せるボタンを変える（§5）:
 * - 下書き: 下書き保存・公開する・削除
 * - 公開中: 保存（すぐ反映。ベルは送り直さない）・非公開にする
 * - 非公開: 保存・もう一度公開する（ベルは送らない）
 * 新規作成では、最初の「下書き保存」「公開する」で下書きを作ってから編集画面の URL に移る。
 * 「メールでも送る」は送信の準備ができるまで出さない（決定1）。プレビューだけ見られる。
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';
import { AdminApiError } from '@/lib/admin-api';
import {
  countMembers,
  createNoticeDraft,
  deleteNoticeDraft,
  publishNotice,
  saveNotice,
  unpublishNotice,
  uploadNoticeImage,
  type AdminNoticeDetail,
} from '@/lib/notice-admin';
import {
  EMPTY_NOTICE_INPUT,
  NOTICE_ATTACHMENT_TYPES,
  NOTICE_BODY_MAX,
  NOTICE_IMAGE_ERRORS,
  NOTICE_IMAGE_MIME_TYPES,
  NOTICE_LINK_LABEL_MAX,
  NOTICE_MEMO_MAX,
  NOTICE_TITLE_MAX,
  checkNoticeImageFile,
  formatNoticeDate,
  isNoticeImageErrorCode,
  noticeImageUrl,
  noticeStatusLabel,
  validateNoticeInput,
  type NoticeAttachmentType,
  type NoticeInput,
  type NoticeInputErrors,
  type NoticeStatus,
} from '@/lib/notice-shared';
import { toneClassName } from '@/components/ui/Tag';
import { noticeStatusTone } from '@/lib/label-tone-shared';
import { NoticePreview } from './NoticePreview';

/** ミリ秒 → datetime-local の値（端末の時刻で） */
function toLocalInputValue(ms: number | null): string {
  if (ms === null) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const SERVER_ERROR_MESSAGES: Record<string, string> = {
  already_published: 'このお知らせはすでに公開中です。ページを再読み込みしてください',
  not_published: 'このお知らせは公開中ではありません。ページを再読み込みしてください',
  not_draft: '公開したお知らせは削除できません',
  not_found: 'このお知らせは見つかりませんでした',
  bell_failed: 'ベルの通知を作る途中で失敗したため、下書きに戻しました。もう一度「公開する」を押してください',
};

type Busy = null | 'save' | 'publish' | 'unpublish' | 'delete';

export function NoticeEditor({ initial }: { initial: AdminNoticeDetail | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [id, setId] = useState<string | null>(initial?.id ?? null);
  const [status, setStatus] = useState<NoticeStatus>(initial?.status ?? 'draft');
  const [publishedAt, setPublishedAt] = useState<number | null>(initial?.publishedAt ?? null);
  const [bellSentCount, setBellSentCount] = useState<number | null>(initial?.bellSentCount ?? null);
  const [input, setInput] = useState<NoticeInput>(initial?.input ?? EMPTY_NOTICE_INPUT);
  const [saved, setSaved] = useState<NoticeInput>(initial?.input ?? EMPTY_NOTICE_INPUT);
  const [errors, setErrors] = useState<NoticeInputErrors>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'publish' | 'unpublish' | 'delete'>(null);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(() => JSON.stringify(input) !== JSON.stringify(saved), [input, saved]);
  const isDraft = status === 'draft';

  // 保存していない変更があるままタブを閉じる・再読み込みするときに確かめる（§6.3）
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  function update<K extends keyof NoticeInput>(key: K, value: NoticeInput[K]) {
    setInput((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const errorKey = (key === 'imageFileName' ? 'image' : key) as keyof NoticeInputErrors;
      if (!(errorKey in prev)) return prev;
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
  }

  function showServerError(e: unknown) {
    if (e instanceof AdminApiError) {
      if (e.code === 'invalid_input' && e.body.errors && typeof e.body.errors === 'object') {
        setErrors(e.body.errors as NoticeInputErrors);
        toast({ type: 'error', message: '入力内容を確認してください' });
        return;
      }
      if (e.code && SERVER_ERROR_MESSAGES[e.code]) {
        toast({ type: 'error', message: SERVER_ERROR_MESSAGES[e.code] });
        return;
      }
    }
    toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
  }

  /** 新規なら下書きを作る。作った（またはもともとある）ID を返す */
  async function ensureDraft(): Promise<string> {
    if (id) return id;
    const created = await createNoticeDraft(input);
    setId(created.id);
    setSaved(input);
    // 画面を作り直さずに URL だけ編集画面に替える（再読み込みしても同じお知らせを開けるように）
    window.history.replaceState(null, '', `/admin/notices/${created.id}`);
    return created.id;
  }

  async function handleSave() {
    const mode = isDraft ? 'draft' : 'publish';
    const found = validateNoticeInput(input, mode, Date.now(), saved.importantUntil);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast({ type: 'error', message: '入力内容を確認してください' });
      return;
    }
    setBusy('save');
    try {
      if (id) await saveNotice(id, input);
      else await ensureDraft();
      setSaved(input);
      toast({ type: 'success', message: isDraft ? '下書きを保存しました' : '保存しました。公開中のお知らせにすぐ反映されます' });
    } catch (e) {
      showServerError(e);
    } finally {
      setBusy(null);
    }
  }

  function openPublish() {
    const found = validateNoticeInput(input, 'publish', Date.now(), saved.importantUntil);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast({ type: 'error', message: '入力内容を確認してください' });
      return;
    }
    if (isDraft && input.notifyBell) {
      setMemberCount(null);
      countMembers().then(setMemberCount);
    }
    setConfirm('publish');
  }

  async function handlePublish() {
    setBusy('publish');
    try {
      const noticeId = await ensureDraft();
      const result = await publishNotice(noticeId, input);
      setStatus('published');
      setPublishedAt((prev) => prev ?? Date.now());
      if (result.bellSentCount !== null) setBellSentCount(result.bellSentCount);
      setSaved(input);
      setConfirm(null);
      toast({
        type: 'success',
        message: result.bellSentCount !== null ? `公開しました。${result.bellSentCount.toLocaleString()}人のベルに通知しました` : '公開しました',
      });
    } catch (e) {
      setConfirm(null);
      showServerError(e);
    } finally {
      setBusy(null);
    }
  }

  async function handleUnpublish() {
    if (!id) return;
    setBusy('unpublish');
    try {
      await unpublishNotice(id);
      setStatus('unpublished');
      setConfirm(null);
      toast({ type: 'success', message: '非公開にしました' });
    } catch (e) {
      setConfirm(null);
      showServerError(e);
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!id) {
      router.push('/admin/notices');
      return;
    }
    setBusy('delete');
    try {
      await deleteNoticeDraft(id);
      setSaved(input);
      toast({ type: 'success', message: '下書きを削除しました' });
      router.push('/admin/notices');
    } catch (e) {
      setConfirm(null);
      showServerError(e);
    } finally {
      setBusy(null);
    }
  }

  async function handleImagePick(file: File | undefined) {
    if (!file) return;
    const problem = checkNoticeImageFile(file);
    if (problem) {
      setErrors((prev) => ({ ...prev, image: NOTICE_IMAGE_ERRORS[problem] }));
      return;
    }
    setImageBusy(true);
    try {
      const fileName = await uploadNoticeImage(file);
      update('imageFileName', fileName);
    } catch (e) {
      const code = (e as Error).message;
      setErrors((prev) => ({ ...prev, image: isNoticeImageErrorCode(code) ? NOTICE_IMAGE_ERRORS[code] : '画像を送れませんでした。時間をおいて再試行してください' }));
    } finally {
      setImageBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const attachment = input.attachmentType;
  const hasLink = attachment === 'link' || attachment === 'image_link';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            'inline-flex items-center rounded-[4px] px-2 py-[2px] text-sm font-medium',
            noticeStatusTone(status) === 'neutral' ? 'bg-bg-hover text-text-secondary' : toneClassName(noticeStatusTone(status)),
          )}
          data-testid="notice-status"
        >
          {noticeStatusLabel(status)}
        </span>
        {publishedAt !== null && <span className="text-md text-text-muted">公開日 {formatNoticeDate(publishedAt)}</span>}
        {dirty && <span className="text-md text-text-muted">保存していない変更があります</span>}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="flex flex-col gap-5">
          <Field label={`タイトル（必須・${NOTICE_TITLE_MAX}文字まで）`} error={errors.title} hint={`${input.title.trim().length} / ${NOTICE_TITLE_MAX}`}>
            {(p) => <Input {...p} value={input.title} onChange={(e) => update('title', e.target.value)} placeholder="例: メンテナンスのお知らせ" />}
          </Field>

          <Field label={`本文（必須・${NOTICE_BODY_MAX.toLocaleString()}文字まで）`} error={errors.body} hint={`${input.body.trim().length.toLocaleString()} / ${NOTICE_BODY_MAX.toLocaleString()}`}>
            {(p) => <Textarea {...p} value={input.body} onChange={(e) => update('body', e.target.value)} className="min-h-[180px]" />}
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-[6px] text-md text-text-tertiary">添付の種類</legend>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-5">
              {NOTICE_ATTACHMENT_TYPES.map((t) => (
                <label key={t.value} className="inline-flex cursor-pointer items-center gap-2 text-base text-text-secondary">
                  <input
                    type="radio"
                    name="attachmentType"
                    value={t.value}
                    checked={attachment === t.value}
                    onChange={() => update('attachmentType', t.value as NoticeAttachmentType)}
                    className="size-4"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </fieldset>

          {attachment === 'image_link' && (
            <Field label="画像（PNG・JPEG・WebP、5MBまで）" error={errors.image}>
              {(p) => (
                <div className="flex flex-col gap-3">
                  {input.imageFileName && (
                    // eslint-disable-next-line @next/next/no-img-element -- 配信 API の画像をそのまま出す
                    <img src={noticeImageUrl(input.imageFileName)} alt="選んだ画像" className="max-h-[200px] w-fit max-w-full rounded-[8px] border border-border-card" />
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileRef}
                      id={p.id}
                      aria-invalid={p['aria-invalid']}
                      aria-describedby={p['aria-describedby']}
                      type="file"
                      accept={NOTICE_IMAGE_MIME_TYPES.join(',')}
                      className="sr-only"
                      onChange={(e) => handleImagePick(e.target.files?.[0])}
                    />
                    <Button variant="secondary" size="sm" loading={imageBusy} onClick={() => fileRef.current?.click()}>
                      {input.imageFileName ? '画像を差し替える' : '画像を選ぶ'}
                    </Button>
                    {input.imageFileName && (
                      <Button variant="ghost" size="sm" onClick={() => update('imageFileName', null)}>
                        画像を外す
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Field>
          )}

          {hasLink && (
            <>
              <Field label={`リンクの文言（${NOTICE_LINK_LABEL_MAX}文字まで）`} error={errors.linkLabel}>
                {(p) => <Input {...p} value={input.linkLabel} onChange={(e) => update('linkLabel', e.target.value)} placeholder="例: くわしくはこちら" />}
              </Field>
              <Field label="リンク先のURL" error={errors.linkUrl} hint="https:// で始まるURLか、/ で始まるサイト内のパス（例: /playlists）">
                {(p) => <Input {...p} value={input.linkUrl} onChange={(e) => update('linkUrl', e.target.value)} inputMode="url" placeholder="https://" />}
              </Field>
            </>
          )}

          {attachment === 'youtube' && (
            <Field label="YouTube 動画のURL" error={errors.youtubeUrl} hint="どの動画でも貼れます。お知らせ詳細に埋め込みで出ます">
              {(p) => <Input {...p} value={input.youtubeUrl} onChange={(e) => update('youtubeUrl', e.target.value)} inputMode="url" placeholder="https://www.youtube.com/watch?v=..." />}
            </Field>
          )}

          <fieldset className="flex flex-col gap-3 border-t border-border-divider pt-4">
            <legend className="sr-only">届け方</legend>
            <p className="text-md text-text-tertiary">届け方（TOPの「運営からのお知らせ」欄とお知らせ一覧には必ず載ります）</p>
            <div className="flex flex-col gap-1">
              <Checkbox
                label="ベルで通知する（会員のベルの未読に数えます）"
                checked={input.notifyBell}
                disabled={!isDraft}
                onChange={(e) => update('notifyBell', e.target.checked)}
              />
              {!isDraft && (
                <p className="pl-6 text-sm text-text-muted">
                  公開後は変えられません。
                  {bellSentCount !== null ? `公開したときに${bellSentCount.toLocaleString()}人のベルに通知しました。` : 'ベルの通知はしていません。'}
                </p>
              )}
            </div>
            <Checkbox
              label="重要なお知らせとして出す（TOPの一番上に目立つ枠で出します）"
              checked={input.important}
              onChange={(e) => {
                update('important', e.target.checked);
                if (!e.target.checked) update('importantUntil', null);
              }}
            />
            {input.important && (
              <Field
                label="重要なお知らせの終わり日時（任意）"
                error={errors.importantUntil}
                hint={input.importantUntil === null ? '空のときは、チェックを外すか非公開にするまで出します' : `${formatDateTime(input.importantUntil)} を過ぎたら、ふつうのお知らせに戻ります`}
                className="pl-6"
              >
                {(p) => (
                  <Input
                    {...p}
                    type="datetime-local"
                    value={toLocalInputValue(input.importantUntil)}
                    onChange={(e) => update('importantUntil', fromLocalInputValue(e.target.value))}
                    className="md:w-[260px]"
                  />
                )}
              </Field>
            )}
          </fieldset>

          <Field label={`備考（${NOTICE_MEMO_MAX.toLocaleString()}文字まで）`} error={errors.memo} hint="運用メモ。利用者には見えません" className="border-t border-border-divider pt-4">
            {(p) => <Textarea {...p} value={input.memo} onChange={(e) => update('memo', e.target.value)} />}
          </Field>

          <div className="flex flex-col-reverse gap-2 border-t border-border-divider pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {isDraft && (
                <Button variant="ghost" onClick={() => setConfirm('delete')} disabled={busy !== null}>
                  削除
                </Button>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              {status === 'draft' && (
                <>
                  <Button variant="secondary" onClick={handleSave} loading={busy === 'save'} disabled={busy !== null}>
                    下書き保存
                  </Button>
                  <Button variant="primary" onClick={openPublish} disabled={busy !== null || imageBusy}>
                    公開する
                  </Button>
                </>
              )}
              {status === 'published' && (
                <>
                  <Button variant="secondary" onClick={() => setConfirm('unpublish')} disabled={busy !== null}>
                    非公開にする
                  </Button>
                  <Button variant="primary" onClick={handleSave} loading={busy === 'save'} disabled={busy !== null || imageBusy || !dirty}>
                    保存
                  </Button>
                </>
              )}
              {status === 'unpublished' && (
                <>
                  <Button variant="secondary" onClick={handleSave} loading={busy === 'save'} disabled={busy !== null || imageBusy || !dirty}>
                    保存
                  </Button>
                  <Button variant="primary" onClick={openPublish} disabled={busy !== null || imageBusy}>
                    もう一度公開する
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>

        <Card className="lg:sticky lg:top-24 lg:self-start">
          <NoticePreview id={id} input={input} publishedAt={publishedAt} />
        </Card>
      </div>

      <Modal
        open={confirm === 'publish'}
        onOpenChange={(open) => !open && busy === null && setConfirm(null)}
        title={isDraft ? 'このお知らせを公開しますか？' : 'もう一度公開しますか？'}
      >
        <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-text-secondary">
          <li>TOPの「運営からのお知らせ」欄とお知らせ一覧に載ります。</li>
          {isDraft && input.notifyBell && <li>ベルで{memberCount === null ? '会員' : `${memberCount.toLocaleString()}人`}に通知します（取り消せません）。</li>}
          {!isDraft && <li>ベルの通知は送り直しません。</li>}
          {input.important && (
            <li>
              TOPの一番上に重要なお知らせとして出します
              {input.importantUntil !== null ? `（${formatDateTime(input.importantUntil)}まで）` : '（チェックを外すまで）'}。
            </li>
          )}
          <li>メールは送りません（メール送信は準備中です）。</li>
        </ul>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy !== null}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handlePublish} loading={busy === 'publish'}>
            公開する
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirm === 'unpublish'}
        onOpenChange={(open) => !open && busy === null && setConfirm(null)}
        title="非公開にしますか？"
        description="非公開にすると、TOPとお知らせ一覧から消えます。届いたベルの通知は残りますが、開くと「このお知らせは公開を終了しました」と出ます。"
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy !== null}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleUnpublish} loading={busy === 'unpublish'}>
            非公開にする
          </Button>
        </div>
      </Modal>

      <Modal open={confirm === 'delete'} onOpenChange={(open) => !open && busy === null && setConfirm(null)} title="この下書きを削除しますか？" description="削除すると元に戻せません。">
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy !== null}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleDelete} loading={busy === 'delete'}>
            削除する
          </Button>
        </div>
      </Modal>
    </div>
  );
}
