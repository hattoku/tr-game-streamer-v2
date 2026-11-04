/**
 * チャンネルを申請する（/channels/apply）。ページ チャンネルを申請する 仕様書（リブランディング段階6）。
 * 実況者本人・事務所の申請と視聴者の推薦を1つのフォームで受け付ける。URL・@ハンドル・UC…・再生リストURL を入れると
 * YouTube からチャンネルを確認し（POST /api/channels/apply/preview）、受け付けないチャンネルでは送信を止める。
 * 送信は POST /api/channels/apply（`workflows` に `channel_application` を作る）。未ログインは /login へ（ログイン後に戻す）。
 * 「掲載チャンネル」「認定」という言葉は画面に出さない。
 */
'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, CheckIcon } from '@/components/ui/icons';
import { CHANNEL_APPLICATION_STEPS, ProposalSteps } from '@/components/playlists/ProposalSteps';
import { formatSubscribers } from '@/lib/collection-admin';
import {
  APPLICANT_TYPES,
  DAILY_APPLICATION_LIMIT,
  MAX_APPLICATION_REASON_LENGTH,
  type ApplicantType,
  type ApplyChannelState,
} from '@/lib/channel-application-shared';

interface ChannelInfo {
  youtubeChannelId: string;
  title: string;
  iconUrl: string;
  subscriberCount: number | null;
}

interface PreviewResult {
  channel: ChannelInfo;
  state: ApplyChannelState;
  pendingIsMine: boolean;
  channelPageId: string | null;
  limitReached: boolean;
}

const PREVIEW_ERRORS: Record<string, string> = {
  channel_not_found: 'チャンネルが見つかりませんでした。URLをご確認ください',
  invalid_input: 'チャンネルのURL（https://www.youtube.com/@... など）を入力してください',
};

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export default function ChannelApplyPage() {
  return (
    <Suspense fallback={<ApplySkeleton />}>
      <ChannelApplyForm />
    </Suspense>
  );
}

function ChannelApplyForm() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [input, setInput] = useState(() => searchParams.get('channel') ?? '');
  const [checkedInput, setCheckedInput] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [applicantType, setApplicantType] = useState<ApplicantType | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<ChannelInfo | null>(null);

  const isAdmin = role === 'owner' || role === 'operator';

  // 未ログインはログインページへ。ログイン後にクエリ込みでこの画面へ戻す
  useEffect(() => {
    if (loading || user) return;
    const query = searchParams.toString();
    router.replace(`/login?next=${encodeURIComponent(query ? `${pathname}?${query}` : pathname)}`);
  }, [loading, user, router, pathname, searchParams]);

  async function runCheck(value: string) {
    const text = value.trim();
    if (!text) {
      setPreview(null);
      setCheckedInput('');
      setInputError(null);
      return;
    }
    if (text === checkedInput) return;
    setPreview(null);
    setCheckedInput(text);
    setSubmitError(null);
    setChecking(true);
    setInputError(null);
    try {
      const res = await fetch('/api/channels/apply/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getIdToken()}` },
        body: JSON.stringify({ input: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setInputError(PREVIEW_ERRORS[body.error as string] ?? 'チャンネルの確認に失敗しました。時間をおいて再試行してください');
        return;
      }
      setPreview(body as PreviewResult);
    } catch {
      setInputError('チャンネルの確認に失敗しました。時間をおいて再試行してください');
    } finally {
      setChecking(false);
    }
  }

  // `?channel=` で流入したときは、ログイン状態が分かってから一度だけ確認する
  const autoCheckedRef = useRef(false);
  useEffect(() => {
    const param = searchParams.get('channel');
    if (!user || isAdmin || autoCheckedRef.current || !param) return;
    autoCheckedRef.current = true;
    (async () => {
      await runCheck(param);
    })();
    // runCheck は描画ごとに作り直される関数のため依存に含めない（一度だけ走らせる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, searchParams]);

  const canSubmit =
    !!preview && preview.state === 'ok' && !preview.limitReached && !!applicantType && reason.trim().length <= MAX_APPLICATION_REASON_LENGTH && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !preview || !applicantType) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/channels/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getIdToken()}` },
        body: JSON.stringify({ input: input.trim(), applicantType, reason: reason.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          body.error === 'daily_limit'
            ? '本日の申請の上限に達しました。明日また申請してください'
            : String(body.error).startsWith('channel_')
              ? 'このチャンネルは現在申請できません。入力し直して確認してください'
              : '送信に失敗しました。時間をおいて再試行してください';
        setSubmitError(message);
        toast({ type: 'error', message });
        return;
      }
      setDone(body.channel as ChannelInfo);
      toast({ type: 'success', message: '申請を送信しました' });
    } catch {
      toast({ type: 'error', message: '送信に失敗しました。時間をおいて再試行してください' });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setInput('');
    setCheckedInput('');
    setPreview(null);
    setApplicantType(null);
    setReason('');
    setSubmitError(null);
    setInputError(null);
    setDone(null);
  }

  if (loading || !user) return <ApplySkeleton />;

  if (isAdmin) {
    return (
      <div className="mx-auto max-w-[720px]">
        <SectionHeading className="mb-4">チャンネルを申請する</SectionHeading>
        <Card className="flex flex-col gap-3">
          <p className="text-base text-text-secondary">管理者は申請できません。掲載チャンネル画面から直接登録できます。</p>
          <LinkButton href="/admin/collection/channels" variant="primary" className="w-fit">
            掲載チャンネル画面へ
          </LinkButton>
        </Card>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-[720px]">
        <SectionHeading className="mb-4 flex items-center gap-2">
          <CheckIcon size={22} className="shrink-0 text-toast-success" />
          申請を送りました（確認待ち）
        </SectionHeading>
        <Card className="mb-4">
          <ProposalSteps labels={CHANNEL_APPLICATION_STEPS} current={2} hereLabel />
          <p className="mt-4 text-base text-text-secondary">
            運営が確認し、掲載が決まるとお知らせでお伝えします。掲載が決まったチャンネルの再生リストは、運営の確認のあと順に公開します。
          </p>
        </Card>
        <Card>
          <ChannelPreviewRow channel={done} />
        </Card>
        <div className="mt-5 flex flex-wrap gap-3">
          <LinkButton href="/playlists/proposals" variant="primary">
            提案履歴を見る
          </LinkButton>
          <Button variant="secondary" onClick={resetForm}>
            続けて申請する
          </Button>
          <LinkButton href="/" variant="ghost">
            TOPへ戻る
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[720px]">
      <SectionHeading className="mb-4">チャンネルを申請する</SectionHeading>
      <Card className="mb-4">
        <ProposalSteps labels={CHANNEL_APPLICATION_STEPS} current={1} />
        <p className="mt-3 text-md text-text-muted">運営が確認してから公開します。実況者本人・公式のチャンネルだけを掲載します（切り抜き・転載・まとめは掲載しません）。</p>
      </Card>

      <Card flush>
        <div className="flex flex-col gap-4 p-[18px]">
          <Field label="チャンネルのURL" error={inputError}>
            {(props) => (
              <Input
                {...props}
                inputMode="url"
                autoComplete="off"
                placeholder="https://www.youtube.com/@..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onBlur={() => runCheck(input)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runCheck(input);
                }}
                disabled={submitting}
              />
            )}
          </Field>
          <p className="text-md text-text-muted">チャンネルのURL、@ハンドル、再生リストのURLのどれでも入力できます</p>

          {(checking || preview) && (
            <div aria-live="polite" className="flex flex-col gap-3 rounded-[8px] border border-border-card bg-bg-child p-3">
              {checking || !preview ? (
                <SkeletonText lines={2} />
              ) : (
                <>
                  <ChannelPreviewRow channel={preview.channel} />
                  <ApplyStateNote preview={preview} />
                </>
              )}
            </div>
          )}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-md text-text-tertiary">どちらで申請しますか</legend>
            {APPLICANT_TYPES.map((t) => (
              <label key={t.value} className="flex cursor-pointer items-start gap-2 text-base text-text-secondary">
                <input
                  type="radio"
                  name="applicant-type"
                  value={t.value}
                  checked={applicantType === t.value}
                  onChange={() => setApplicantType(t.value)}
                  disabled={submitting}
                  className="mt-[3px]"
                />
                <span>{t.label}</span>
              </label>
            ))}
          </fieldset>

          <Field
            label={`申請の理由（任意・${reason.trim().length}/${MAX_APPLICATION_REASON_LENGTH}）`}
            error={reason.trim().length > MAX_APPLICATION_REASON_LENGTH ? `${MAX_APPLICATION_REASON_LENGTH}文字以内で入力してください` : null}
          >
            {(props) => <Textarea {...props} value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting} rows={3} />}
          </Field>

          {submitError && (
            <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
              <AlertIcon size={14} className="mt-[2px] shrink-0" />
              <span>{submitError}</span>
            </p>
          )}

          <div className="flex flex-col items-end gap-2">
            <p className="text-md text-text-muted">送信後、運営の確認が済むまで公開されません（1日{DAILY_APPLICATION_LIMIT}件まで）</p>
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
              申請する
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ChannelPreviewRow({ channel }: { channel: ChannelInfo }) {
  return (
    <div className="flex items-center gap-3">
      {channel.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={channel.iconUrl} alt="" referrerPolicy="no-referrer" className="size-12 shrink-0 rounded-full bg-bg-btn object-cover" />
      ) : (
        <span className="block size-12 shrink-0 rounded-full bg-bg-btn" />
      )}
      <div className="min-w-0">
        <p className="truncate text-base font-medium text-text-primary">{channel.title}</p>
        {channel.subscriberCount !== null && <p className="text-md text-text-tertiary">{formatSubscribers(channel.subscriberCount)}</p>}
        <a
          href={`https://www.youtube.com/channel/${channel.youtubeChannelId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-md text-text-secondary underline underline-offset-[3px] hover:text-text-primary"
        >
          YouTubeで開く
        </a>
      </div>
    </div>
  );
}

/** 受け付けないチャンネルの表示（仕様書 §4）。申請できるときは何も出さない（上限のときだけ案内） */
function ApplyStateNote({ preview }: { preview: PreviewResult }) {
  if (preview.state === 'listed') {
    return (
      <p className="flex items-start gap-[6px] text-base text-input-error">
        <AlertIcon size={15} className="mt-[3px] shrink-0" />
        <span>
          このチャンネルはすでに掲載しています
          {preview.channelPageId && (
            <>
              {' '}
              <Link href={`/channels/${preview.channelPageId}`} className="underline underline-offset-[3px]">
                チャンネルを見る
              </Link>
            </>
          )}
        </span>
      </p>
    );
  }
  if (preview.state === 'opted_out') {
    return (
      <p className="flex items-start gap-[6px] text-base text-input-error">
        <AlertIcon size={15} className="mt-[3px] shrink-0" />
        <span>このチャンネルは掲載していません</span>
      </p>
    );
  }
  if (preview.state === 'pending') {
    return (
      <p className="flex items-start gap-[6px] text-base text-input-error">
        <AlertIcon size={15} className="mt-[3px] shrink-0" />
        <span>
          このチャンネルは申請済みです（確認待ち）
          {preview.pendingIsMine && (
            <>
              {' '}
              <Link href="/playlists/proposals" className="underline underline-offset-[3px]">
                提案履歴を見る
              </Link>
            </>
          )}
        </span>
      </p>
    );
  }
  if (preview.limitReached) {
    return (
      <p className="flex items-start gap-[6px] text-base text-input-error">
        <AlertIcon size={15} className="mt-[3px] shrink-0" />
        <span>本日の申請の上限に達しました。明日また申請してください</span>
      </p>
    );
  }
  return null;
}

function ApplySkeleton() {
  return (
    <div className="mx-auto max-w-[720px]">
      <Skeleton className="mb-5 h-6 w-[200px]" />
      <div className="flex flex-col gap-4 rounded-[12px] border border-border-card bg-gradient-card p-[18px] shadow-card">
        <Skeleton className="h-3 w-[90px]" />
        <Skeleton className="h-10 w-full rounded-[7px]" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-[100px] rounded-[8px]" />
        </div>
      </div>
    </div>
  );
}
