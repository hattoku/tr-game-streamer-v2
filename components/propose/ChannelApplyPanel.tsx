'use client';

/**
 * 提案ページのチャンネル側（ページ 提案する 仕様書 §6。フォームは ページ チャンネルを申請する 仕様書 §4・§5・§8 のまま）。
 * チャンネルのURL・@ハンドル・UC…・再生リストのURL・動画のURLを入れると YouTube からチャンネルを確認し
 * （POST /api/channels/apply/preview）、受け付けないチャンネルでは送信を止める。送信は POST /api/channels/apply。
 * 申請の区分（本人・事務所／推薦）は画面で聞かず、記録もしない。実況者向けページから来たとき（`asCreator`）はボタンを「申請する」にするだけ。
 * 既に掲載中のチャンネルなら、再生リスト側へ切り替えるボタンを出す（§7）。
 * 「掲載チャンネル」「認定」という言葉は画面に出さない。管理者はこの部品を使わない（ページ側で案内を出す）。
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, CheckIcon, InfoIcon } from '@/components/ui/icons';
import { CHANNEL_APPLICATION_STEPS, ProposalSteps } from '@/components/playlists/ProposalSteps';
import { UrlCopyGuide } from '@/components/propose/UrlCopyGuide';
import { formatSubscribers } from '@/lib/collection-admin';
import { DAILY_APPLICATION_LIMIT, MAX_APPLICATION_REASON_LENGTH, type ApplyChannelState } from '@/lib/channel-application-shared';

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
  invalid_input: 'YouTubeのチャンネルや動画のURLを入力してください',
};

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

export function ChannelApplyPanel({
  initialInput,
  asCreator,
  onSwitchToPlaylist,
  onDoneChange,
}: {
  /** 入力欄に入れて開く値（`?channel=`、再生リスト側から移ってきたときの URL）。入っていれば最初に一度確認する */
  initialInput: string;
  /** 実況者向けページから来た（ボタンの文言を「申請する」にする。区分は記録しない） */
  asCreator: boolean;
  onSwitchToPlaylist: (youtubeChannelId: string) => void;
  /** 完了画面を出しているか（ページ側の見出し・タブを隠すため） */
  onDoneChange: (done: boolean) => void;
}) {
  const { toast } = useToast();
  const [input, setInput] = useState(initialInput);
  const [checkedInput, setCheckedInput] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<ChannelInfo | null>(null);

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

  // 入力欄に値が入った状態で開いたときは、一度だけ確認する
  const autoCheckedRef = useRef(false);
  useEffect(() => {
    if (autoCheckedRef.current || !initialInput.trim()) return;
    autoCheckedRef.current = true;
    (async () => {
      await runCheck(initialInput);
    })();
    // runCheck は描画ごとに作り直される関数のため依存に含めない（一度だけ走らせる）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput]);

  const canSubmit = !!preview && preview.state === 'ok' && !preview.limitReached && reason.trim().length <= MAX_APPLICATION_REASON_LENGTH && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !preview) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/channels/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getIdToken()}` },
        body: JSON.stringify({ input: input.trim(), reason: reason.trim() }),
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
      onDoneChange(true);
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
    setReason('');
    setSubmitError(null);
    setInputError(null);
    setDone(null);
    onDoneChange(false);
  }

  if (done) {
    return (
      <div>
        <SectionHeading className="mb-4 flex items-center gap-2">
          <CheckIcon size={22} className="shrink-0 text-toast-success" />
          申請を送りました（確認待ち）
        </SectionHeading>
        <Card className="mb-4">
          <ProposalSteps labels={CHANNEL_APPLICATION_STEPS} current={2} />
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
    <div>
      <Card className="mb-4">
        <ProposalSteps labels={CHANNEL_APPLICATION_STEPS} current={1} />
        <p className="mt-3 text-md text-text-muted">
          運営が確認してから公開します。実況者本人・公式のチャンネルだけを掲載します（切り抜き・転載・まとめは掲載しません）。
        </p>
      </Card>

      <Card flush>
        <div className="flex flex-col gap-4 p-[18px]">
          <Field label="推薦・申請するチャンネル" error={inputError}>
            {(props) => (
              <Input
                {...props}
                inputMode="url"
                autoComplete="off"
                placeholder="YouTubeのチャンネルや動画のURL"
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
          <p className="text-md text-text-muted">そのチャンネルの動画のURL、チャンネルのURL、@ハンドル、再生リストのURLのどれでも入力できます</p>
          <UrlCopyGuide kind="channel" />

          {(checking || preview) && (
            <div aria-live="polite" className="flex flex-col gap-3 rounded-[8px] border border-border-card bg-bg-child p-3">
              {checking || !preview ? (
                <SkeletonText lines={2} />
              ) : (
                <>
                  <ChannelPreviewRow channel={preview.channel} />
                  <ApplyStateNote preview={preview} onSwitchToPlaylist={onSwitchToPlaylist} />
                </>
              )}
            </div>
          )}

          <Field
            label={`推薦・申請の理由（任意・${reason.trim().length}/${MAX_APPLICATION_REASON_LENGTH}）`}
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
              {asCreator ? '申請する' : '推薦する'}
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
function ApplyStateNote({ preview, onSwitchToPlaylist }: { preview: PreviewResult; onSwitchToPlaylist: (youtubeChannelId: string) => void }) {
  if (preview.state === 'listed') {
    // 掲載中のチャンネルなら、そのチャンネルの再生リストの提案へ移れるようにする（ページ 提案する 仕様書 §6.2・§7）
    return (
      <div className="flex flex-col gap-2" data-testid="channel-already-listed">
        <p className="flex items-start gap-[6px] text-base text-text-secondary">
          <InfoIcon size={15} className="mt-[3px] shrink-0 text-toast-info" />
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
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => onSwitchToPlaylist(preview.channel.youtubeChannelId)}>
          このチャンネルの再生リストを提案する
        </Button>
      </div>
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

