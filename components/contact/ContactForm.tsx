/**
 * お問い合わせフォーム（/contact）。document/specification/page/ページ お問い合わせフォーム仕様書.md 準拠。
 * ログイン・未ログインどちらも送信できる。ログイン済みはアカウントのメールアドレスを自動入力・編集不可にする（§3）。
 * 送信は POST /api/inquiries（Admin SDK）。入力チェックは lib/inquiry-shared.ts をサーバーと共有する。
 * 送信完了画面には、ログイン済みのときだけ `/contact/history` へのリンクを出す（§7、フェーズ7ステップ7-3-2）。
 * 画像の添付欄（§9）はログイン済みのときだけ出す。画像があるときは multipart/form-data（本文は payload に JSON）で送る。
 */
'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  INQUIRY_ATTACHMENT_ERRORS,
  INQUIRY_BODY_MAX,
  INQUIRY_CATEGORIES,
  INQUIRY_URLS_MAX,
  hasInquiryErrors,
  isInquiryAttachmentErrorCode,
  validateInquiryInput,
  type InquiryCategory,
  type InquiryInputErrors,
} from '@/lib/inquiry-shared';
import { Button, Card, Field, Input, SectionHeading, SelectMenu, Skeleton, Textarea, useToast } from '@/components/ui';
import { AlertIcon, PlusIcon, XIcon } from '@/components/ui/icons';
import { AttachmentPicker, type PickedImage } from '@/components/contact/AttachmentPicker';

const LINK_CLASS = 'text-text-primary underline underline-offset-[3px] hover:text-text-secondary';

export function ContactForm() {
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [category, setCategory] = useState<InquiryCategory | ''>('');
  const [body, setBody] = useState('');
  // 行ごとに安定した key を持たせる（途中の行を×で消したときに入力値がずれないように）
  const [urls, setUrls] = useState<Array<{ key: number; value: string }>>([{ key: 0, value: '' }]);
  const [nextUrlKey, setNextUrlKey] = useState(1);
  const [guestEmail, setGuestEmail] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [imageError, setImageError] = useState<string>();
  const [errors, setErrors] = useState<InquiryInputErrors>({});
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [sentAsGuest, setSentAsGuest] = useState<boolean | null>(null);

  const isGuest = !user;
  // ログイン済みでもアカウントにメールアドレスが無ければ入力してもらう（返信先が無くなるため）
  const accountEmail = user?.email ?? null;
  const email = accountEmail ?? guestEmail;
  const categoryHint = INQUIRY_CATEGORIES.find((c) => c.value === category)?.hint;

  function addUrl() {
    if (urls.length >= INQUIRY_URLS_MAX) return;
    setUrls((prev) => [...prev, { key: nextUrlKey, value: '' }]);
    setNextUrlKey((k) => k + 1);
  }

  function removeUrl(index: number) {
    setUrls((prev) => (prev.length === 1 ? [{ key: prev[0].key, value: '' }] : prev.filter((_, i) => i !== index)));
    // 行の位置が詰まるので、URLのエラー表示は消して送信時に出し直す
    setErrors((prev) => ({ ...prev, relatedUrls: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const input = {
      category,
      body,
      relatedUrls: urls.map((u) => u.value),
      email,
      requireEmail: accountEmail === null,
    };
    const nextErrors = validateInquiryInput(input);
    setErrors(nextErrors);
    if (hasInquiryErrors(nextErrors)) return;

    setBusy(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      // 画像はログイン済みのときだけ送る（§9.1。ゲストには添付欄を出していない）
      const files = user ? images.map((i) => i.file) : [];
      let requestBody: BodyInit = JSON.stringify(input);
      if (files.length > 0) {
        const form = new FormData();
        form.append('payload', JSON.stringify(input));
        files.forEach((f) => form.append('images', f));
        requestBody = form;
      }
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: {
          // multipart のときは境界付きの Content-Type をブラウザに付けさせる
          ...(files.length > 0 ? {} : { 'Content-Type': 'application/json' }),
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: requestBody,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.errors) setErrors(data.errors as InquiryInputErrors);
        const code: unknown = data?.error;
        if (isInquiryAttachmentErrorCode(code)) {
          const message = INQUIRY_ATTACHMENT_ERRORS[code];
          setImageError(message);
          setFormError(message);
          toast({ type: 'error', message });
          return;
        }
        throw new Error(`status ${res.status}`);
      }
      setSentAsGuest(isGuest);
    } catch {
      const message = '送信に失敗しました。時間をおいて再試行してください';
      setFormError(message);
      toast({ type: 'error', message });
    } finally {
      setBusy(false);
    }
  }

  if (sentAsGuest !== null) {
    return (
      <Card>
        {/* 完了画面に切り替わった時点でここへフォーカスを移し、スクリーンリーダーに完了を伝える */}
        <div ref={(el) => el?.focus()} tabIndex={-1} className="flex flex-col gap-4 outline-none">
          <SectionHeading>お問い合わせを受け付けました</SectionHeading>
          <p className="text-base text-text-secondary">
            {sentAsGuest ? 'ご入力のメールアドレスに折り返しご連絡いたします。' : 'お問い合わせ履歴からやり取りを確認できます。'}
          </p>
          <p className="flex flex-wrap gap-x-6 gap-y-2 text-base">
            {!sentAsGuest && (
              <Link href="/contact/history" className={LINK_CLASS}>
                お問い合わせ履歴を見る
              </Link>
            )}
            <Link href="/" className={LINK_CLASS}>
              トップページへ戻る
            </Link>
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <SectionHeading>お問い合わせ</SectionHeading>
          {/* 履歴への入り口（ページ お問い合わせフォーム仕様書 導線。ログイン済みのみ） */}
          {user && (
            <Link href="/contact/history" className={`text-sm ${LINK_CLASS}`}>
              過去のお問い合わせを見る
            </Link>
          )}
        </div>

        {formError && (
          <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
            <AlertIcon size={14} className="mt-[2px] shrink-0" />
            <span>{formError}</span>
          </p>
        )}

        <Field label="お問い合わせ種別（必須）" error={errors.category} hint={categoryHint}>
          {(props) => (
            <SelectMenu
              {...props}
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setErrors((prev) => ({ ...prev, category: undefined }));
              }}
              options={INQUIRY_CATEGORIES.map((c) => ({
                value: c.value,
                label: c.label,
              }))}
              placeholder="選択してください"
              align="start"
              disabled={busy}
              className="w-full justify-between sm:w-[320px]"
            />
          )}
        </Field>

        <Field
          label="お問い合わせ内容（必須）"
          error={errors.body}
          hint={
            <span className={body.trim().length > INQUIRY_BODY_MAX ? 'text-input-error' : undefined}>
              {body.trim().length.toLocaleString()} / {INQUIRY_BODY_MAX.toLocaleString()}
            </span>
          }
        >
          {(props) => <Textarea {...props} value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={8} />}
        </Field>

        <fieldset className="flex min-w-0 flex-col gap-[6px]">
          <legend className="mb-[6px] text-md text-text-tertiary">関連URL（任意・{INQUIRY_URLS_MAX}件まで）</legend>
          {urls.map((url, i) => {
            const urlError = errors.relatedUrls?.[i];
            return (
              <div key={url.key} className="flex flex-col gap-[6px]">
                <div className="flex items-center gap-2">
                  <Input
                    type="url"
                    inputMode="url"
                    placeholder="https://"
                    aria-label={`関連URL ${i + 1}件目`}
                    aria-invalid={urlError ? true : undefined}
                    value={url.value}
                    onChange={(e) => setUrls((prev) => prev.map((u, j) => (j === i ? { ...u, value: e.target.value } : u)))}
                    disabled={busy}
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeUrl(i)}
                    disabled={busy}
                    aria-label={`関連URL ${i + 1}件目を削除`}
                    className="shrink-0"
                  >
                    <XIcon size={14} />
                  </Button>
                </div>
                {urlError && (
                  <p role="alert" className="text-md text-input-error">
                    {urlError}
                  </p>
                )}
              </div>
            );
          })}
          {urls.length < INQUIRY_URLS_MAX && (
            <div>
              <Button type="button" variant="secondary" size="sm" onClick={addUrl} disabled={busy}>
                <PlusIcon size={14} />
                URLを追加する
              </Button>
            </div>
          )}
        </fieldset>

        {user && <AttachmentPicker images={images} onChange={setImages} error={imageError} onError={setImageError} disabled={busy} />}

        {loading ? (
          <Skeleton className="h-[62px] w-full" />
        ) : (
          <Field
            label="メールアドレス（必須）"
            error={errors.email}
            hint={
              accountEmail === null
                ? '返信はこのメールアドレスにお送りします'
                : 'アカウントに登録されているメールアドレスを使います（変更できません）'
            }
          >
            {(props) => (
              <Input
                {...props}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setGuestEmail(e.target.value)}
                readOnly={accountEmail !== null}
                disabled={busy}
                className="read-only:text-text-muted"
              />
            )}
          </Field>
        )}

        <div>
          <Button type="submit" variant="primary" loading={busy} disabled={loading}>
            送信する
          </Button>
        </div>
      </form>
    </Card>
  );
}
