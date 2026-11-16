'use client';

/**
 * 提案ページの再生リスト側（ページ 提案する 仕様書 §5・§9）。
 * - 掲載中のチャンネルを名前で探し（§5.1）、そのチャンネルの再生リスト一覧から選ぶ（§5.2。URL は使わない）
 * - 一覧に無いときだけ URL で入力する（§5.3。確認エリアは ページ 再生リストを追加する 仕様書 §4.1 のまま）
 * - ゲームタイトルは任意で、推定したゲームを初期値にする（§5.4）
 * - 一般ユーザーは提案（POST /api/playlists/propose）、管理者はその場で公開・登録（POST /api/playlists/register）
 * - 掲載していないチャンネルなら、チャンネル側へ移るボタンを出す（§7）。管理者はチャンネルも同時に掲載できる（§9）
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardChildArea, SectionHeading } from '@/components/ui/Card';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Input';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, CheckIcon, ChevronDownIcon, InfoIcon, SearchIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import type { GameOption } from '@/components/playlists/GameSelectModal';
import { PlaylistSummary } from '@/components/playlists/PlaylistSummary';
import { ProposalSteps } from '@/components/playlists/ProposalSteps';
import { GameTitlePicker, gameChoicePayload, type GameChoice } from '@/components/propose/GameTitlePicker';
import { UrlCopyGuide } from '@/components/propose/UrlCopyGuide';
import { normalizeForSearch } from '@/lib/game-shared';
import {
  MAX_PROPOSE_REASON_LENGTH,
  outOfScopeLabel,
  proposePlaylistGroup,
  type ProposeChannel,
  type ProposePlaylist,
} from '@/lib/propose-shared';

interface PreviewResult {
  playlist: { youtubePlaylistId: string; title: string; thumbnailUrl: string; itemCount: number; isPublic: boolean };
  channel: { youtubeChannelId: string; name: string; iconUrl: string };
  channelMatches: boolean;
  channelAlreadyRegistered: boolean;
  playlistAlreadyRegistered: boolean;
  existingPlaylist: { listingStatus: string; listingReason: string | null; hiddenByAdmin: boolean; gameId: string | null; gameName: string | null } | null;
  pendingProposal: boolean;
  channelListing: 'listed' | 'not_listed' | 'opted_out';
}

interface CompletionResult {
  playlistId?: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameName: string;
  videoCount: number;
}

/** 一覧で最初に出す件数（多いチャンネルは「もっと見る」で続きを出す。§5.2） */
const PAGE_SIZE = 30;

function isPlaylistUrl(url: string): boolean {
  try {
    return !!new URL(url).searchParams.get('list');
  } catch {
    return false;
  }
}

async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

async function authedFetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), 'Content-Type': 'application/json', Authorization: `Bearer ${await getIdToken()}` },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}

const SUBMIT_ERRORS: Record<string, string> = {
  already_registered: 'この再生リストはすでに公開しています',
  already_proposed: 'この再生リストはすでに提案済み、または公開済みです',
  hidden_by_admin: 'この再生リストは運営の判断で公開していません',
  not_proposable: 'この再生リストは提案できません',
  channel_mismatch: 'このチャンネルの再生リストではありません。URLを確認してください',
  not_public: 'この再生リストは非公開または限定公開のため登録できません',
  game_not_found: 'ゲームタイトルが見つかりませんでした',
  channel_not_listed: 'このチャンネルはまだ掲載していません。先にチャンネルの推薦をお願いします',
  channel_opted_out: 'このチャンネルの再生リストは掲載していません',
  playlist_not_found: '再生リストが見つかりませんでした',
  quota_exceeded: 'YouTubeの取得上限に達しました。時間をおいて再試行してください',
};

export function PlaylistProposePanel({
  isAdmin,
  fixedChannelId,
  presetChannelId,
  initialGameId,
  initialUrl,
  onSwitchToChannel,
  onDoneChange,
}: {
  isAdmin: boolean;
  /** チャンネル詳細から来たときのチャンネル（固定。§4） */
  fixedChannelId: string | null;
  /** チャンネル側から移ってきたときのチャンネル（選んだ状態で始めるが、変えられる。§7） */
  presetChannelId: string | null;
  /** ゲーム詳細から来たときのゲーム（§4） */
  initialGameId: string | null;
  /** URL 入力に入れて開く値（管理画面からの導線。§4） */
  initialUrl: string | null;
  /** チャンネル側へ移る（入力済みの URL を引き継ぐ。§7） */
  onSwitchToChannel: (input: string) => void;
  onDoneChange: (done: boolean) => void;
}) {
  const { toast } = useToast();
  const [games, setGames] = useState<GameOption[]>([]);
  const [mode, setMode] = useState<'list' | 'url'>(initialUrl ? 'url' : 'list');

  // §5.1 チャンネル
  const [channel, setChannel] = useState<ProposeChannel | null>(null);
  const [fixedChannelMissing, setFixedChannelMissing] = useState(false);
  const [channelQuery, setChannelQuery] = useState('');
  const [channelResults, setChannelResults] = useState<ProposeChannel[] | null>(null);
  const [searching, setSearching] = useState(false);

  // §5.2 再生リスト一覧
  const [playlists, setPlaylists] = useState<ProposePlaylist[] | null>(null);
  const [playlistsError, setPlaylistsError] = useState(false);
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [outOfScopeOpen, setOutOfScopeOpen] = useState(false);
  const [selected, setSelected] = useState<ProposePlaylist | null>(null);

  // §5.3 URL 入力
  const [playlistUrl, setPlaylistUrl] = useState(initialUrl ?? '');
  const [previewedUrl, setPreviewedUrl] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [channelDescription, setChannelDescription] = useState('');
  const [addChannel, setAddChannel] = useState(true);

  // §5.4・§5.5
  const [gameChoice, setGameChoice] = useState<GameChoice>({ kind: 'none', ready: true });
  const [gameTitleError, setGameTitleError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'games'))
      .then((snapshot) => {
        setGames(
          snapshot.docs
            .map((d) => ({
              id: d.id,
              title: (d.data().title as string) ?? '',
              packageImageUrl: (d.data().packageImageUrl as string | undefined) ?? null,
              aliases: (d.data().aliases as string[] | undefined) ?? [],
            }))
            .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
        );
      })
      .catch((e) => console.error('games の読み込みに失敗', e));
  }, []);

  // チャンネル詳細から来たとき・チャンネル側から移ってきたときは、そのチャンネルを選んだ状態で始める
  const startChannelId = fixedChannelId ?? presetChannelId;
  useEffect(() => {
    if (!startChannelId) return;
    (async () => {
      try {
        const { res, body } = await authedFetch(`/api/propose/channels?id=${encodeURIComponent(startChannelId)}`);
        const hit = res.ok ? ((body.channels as ProposeChannel[])[0] ?? null) : null;
        if (hit) setChannel(hit);
        else setFixedChannelMissing(true);
      } catch {
        setFixedChannelMissing(true);
      }
    })();
  }, [startChannelId]);

  // チャンネル名の検索（入力が止まってから少し待つ）
  useEffect(() => {
    const q = channelQuery.trim();
    if (!q) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { res, body } = await authedFetch(`/api/propose/channels?q=${encodeURIComponent(q)}`);
        setChannelResults(res.ok ? (body.channels as ProposeChannel[]) : []);
      } catch {
        setChannelResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [channelQuery]);

  // チャンネルを選んだら再生リスト一覧を読む
  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    (async () => {
      setPlaylists(null);
      setPlaylistsError(false);
      try {
        const { res, body } = await authedFetch(`/api/propose/channels/${encodeURIComponent(channel.youtubeChannelId)}/playlists`);
        if (cancelled) return;
        if (!res.ok) {
          setPlaylistsError(true);
          return;
        }
        setPlaylists(body.playlists as ProposePlaylist[]);
      } catch {
        if (!cancelled) setPlaylistsError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel]);

  function chooseChannel(c: ProposeChannel | null) {
    setChannel(c);
    setSelected(null);
    setPlaylistFilter('');
    setShownCount(PAGE_SIZE);
    setOutOfScopeOpen(false);
    setSubmitError(null);
  }

  function choosePlaylist(p: ProposePlaylist | null) {
    setSelected(p);
    setReason('');
    setSubmitError(null);
    setGameTitleError(null);
  }

  // ---- §5.3 URL 入力の確認 ----
  async function runPreview(url: string) {
    if (!url) {
      setPreview(null);
      setPreviewedUrl('');
      setUrlError(null);
      return;
    }
    if (url === previewedUrl) return;
    setPreview(null);
    setPreviewedUrl(url);
    setSubmitError(null);
    if (!isPlaylistUrl(url)) {
      setUrlError('YouTubeの再生リストのURL（list= を含むもの）を入力してください');
      return;
    }
    setPreviewLoading(true);
    setUrlError(null);
    try {
      const { res, body } = await authedFetch('/api/playlists/preview', { method: 'POST', body: JSON.stringify({ playlistUrl: url }) });
      if (!res.ok) {
        setUrlError(body.error === 'playlist_not_found' ? '再生リストが見つかりませんでした。URLを確認してください' : '再生リストの取得に失敗しました');
        return;
      }
      setPreview(body as PreviewResult);
    } catch {
      setUrlError('再生リストの取得に失敗しました');
    } finally {
      setPreviewLoading(false);
    }
  }

  const autoPreviewedRef = useRef(false);
  useEffect(() => {
    if (autoPreviewedRef.current || !initialUrl) return;
    autoPreviewedRef.current = true;
    (async () => {
      await runPreview(initialUrl.trim());
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  const existing = preview?.existingPlaylist ?? null;
  const sourceChannelMismatch = !!preview && !!fixedChannelId && preview.channel.youtubeChannelId !== fixedChannelId;
  const urlChecks = (() => {
    if (!preview) return null;
    if (!preview.playlist.isPublic) return { ok: false, note: <CheckLine state="ng">この再生リストは非公開または限定公開のため登録できません</CheckLine> };
    if (sourceChannelMismatch) return { ok: false, note: <CheckLine state="ng">このチャンネルの再生リストではありません。URLを確認してください</CheckLine> };
    if (preview.playlistAlreadyRegistered) return { ok: false, note: <CheckLine state="ng">この再生リストはすでに公開しています</CheckLine> };
    if (!isAdmin && preview.pendingProposal) return { ok: false, note: <CheckLine state="ng">この再生リストはすでに提案済みです（確認待ち）</CheckLine> };
    if (!isAdmin && existing?.hiddenByAdmin) return { ok: false, note: <CheckLine state="ng">この再生リストは運営の判断で公開していません</CheckLine> };
    if (preview.channelListing === 'opted_out') return { ok: false, note: <CheckLine state="ng">このチャンネルの再生リストは掲載していません</CheckLine> };
    if (preview.channelListing === 'not_listed' && !isAdmin) {
      return {
        ok: false,
        note: (
          <li className="flex flex-col gap-2 text-base text-text-secondary" data-testid="channel-not-listed">
            <span className="flex items-start gap-2">
              <span className="mt-[3px] shrink-0">
                <InfoIcon size={15} className="text-toast-info" />
              </span>
              <span>このチャンネルはまだプレミテに掲載していません。先にチャンネルの推薦をお願いします。掲載が決まると、このチャンネルの再生リストは運営が順に公開します</span>
            </span>
            <Button variant="secondary" size="sm" className="w-fit" onClick={() => onSwitchToChannel(previewedUrl)}>
              このチャンネルを推薦する
            </Button>
          </li>
        ),
      };
    }
    const notes: ReactNode[] = [<CheckLine key="pub" state="ok">公開されている再生リストです</CheckLine>];
    if (existing) {
      notes.push(
        <CheckLine key="ex" state="info">
          {isAdmin ? 'プレミテにあるが、まだ公開していない再生リストです。公開すると、さがすに表示されます。' : 'この再生リストはまだ公開していません。公開してほしい場合は提案してください。'}
        </CheckLine>,
      );
    }
    if (isAdmin && preview.pendingProposal) {
      notes.push(
        <CheckLine key="pending" state="info">
          この再生リストには審査中の提案があります。ここで登録した場合、その提案は審査画面で却下してください。
        </CheckLine>,
      );
    }
    if (isAdmin && preview.channelListing === 'not_listed') {
      notes.push(
        <CheckLine key="ch" state="info">
          このチャンネルは掲載していません。
        </CheckLine>,
      );
    }
    return { ok: true, note: <>{notes}</> };
  })();
  const urlNeedsAddChannel = isAdmin && preview?.channelListing === 'not_listed';

  // ---- 送信 ----
  const listOutOfScope = !!selected && proposePlaylistGroup(selected) === 'out_of_scope';
  const reasonTooLong = reason.trim().length > MAX_PROPOSE_REASON_LENGTH;
  const targetReady = mode === 'list' ? !!selected && !selected.pending : !!urlChecks?.ok && (!urlNeedsAddChannel || addChannel);
  const canSubmit = targetReady && gameChoice.ready && !reasonTooLong && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const target =
        mode === 'list'
          ? { playlistId: selected!.id }
          : {
              playlistUrl: previewedUrl,
              ...(isAdmin ? { addChannel, channelDescription: preview && !preview.channelAlreadyRegistered ? channelDescription : undefined } : {}),
            };
      const { res, body } = await authedFetch(isAdmin ? '/api/playlists/register' : '/api/playlists/propose', {
        method: 'POST',
        body: JSON.stringify({
          ...target,
          ...gameChoicePayload(gameChoice),
          ...(!isAdmin && reason.trim() ? { reason: reason.trim() } : {}),
          sourceChannelId: fixedChannelId ?? undefined,
        }),
      });
      if (!res.ok) {
        if (body.error === 'game_exists') {
          setGameTitleError('このゲームタイトルはすでに登録されています。一覧から選んでください');
          toast({ type: 'error', message: '登録済みのゲームタイトルです' });
          return;
        }
        const message = SUBMIT_ERRORS[body.error as string] ?? '送信に失敗しました。時間をおいて再試行してください';
        setSubmitError(message);
        toast({ type: 'error', message });
        return;
      }
      setCompletion(body as CompletionResult);
      onDoneChange(true);
      toast({ type: 'success', message: isAdmin ? '再生リストを公開しました' : '提案を送信しました' });
    } catch {
      toast({ type: 'error', message: '送信に失敗しました。時間をおいて再試行してください' });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setCompletion(null);
    onDoneChange(false);
    setSelected(null);
    setReason('');
    setSubmitError(null);
    setPlaylistUrl('');
    setPreviewedUrl('');
    setPreview(null);
    setUrlError(null);
    setChannelDescription('');
    // 一覧は提案済みの印を付け直すため読み直す
    if (channel) setChannel({ ...channel });
  }

  // ---- 完了画面 ----
  if (completion) {
    return (
      <div>
        <SectionHeading className="mb-4 flex items-center gap-2">
          <CheckIcon size={22} className="shrink-0 text-toast-success" />
          {isAdmin ? '公開しました' : '提案を送りました（確認待ち）'}
        </SectionHeading>
        {!isAdmin && (
          <Card className="mb-4">
            <ProposalSteps current={2} hereLabel />
            <p className="mt-4 text-base text-text-secondary">
              ありがとうございます！今は運営の確認待ちです。確認が済むとさがすに表示されます。結果は通知と提案履歴でお知らせします。
            </p>
          </Card>
        )}
        <Card>
          <PlaylistSummary
            title={completion.title}
            thumbnailUrl={completion.thumbnailUrl}
            channelName={completion.channelName}
            channelIconUrl={completion.channelIconUrl}
            videoCount={completion.videoCount}
            gameName={completion.gameName}
          />
        </Card>
        <div className="mt-5 flex flex-wrap gap-3">
          {isAdmin && completion.playlistId ? (
            <LinkButton href={`/playlists/${completion.playlistId}`} variant="primary">
              再生リストを見る
            </LinkButton>
          ) : (
            <LinkButton href="/playlists/proposals" variant="primary">
              提案履歴を見る
            </LinkButton>
          )}
          <Button variant="secondary" onClick={resetForm}>
            {isAdmin ? '続けて追加する' : '続けて提案する'}
          </Button>
          <LinkButton href="/playlists" variant="ghost">
            再生リストを探す
          </LinkButton>
        </div>
      </div>
    );
  }

  const pickerInitialGameId = mode === 'list' ? (selected?.gameId ?? initialGameId) : (existing?.gameId ?? initialGameId);
  const pickerKey = mode === 'list' ? `list-${selected?.id ?? ''}` : `url-${previewedUrl}`;
  const showGameAndSubmit = mode === 'list' ? !!selected : !!urlChecks?.ok;

  return (
    <div>
      {!isAdmin && (
        <Card className="mb-4">
          <ProposalSteps current={1} />
          <p className="mt-3 text-md text-text-muted">運営が確認してから公開します。</p>
        </Card>
      )}

      <Card flush>
        {mode === 'list' ? (
          <div className="flex flex-col gap-4 p-[18px]">
            {/* §5.1 チャンネルを選ぶ */}
            {channel ? (
              <div className="flex items-center gap-3" data-testid="propose-channel-selected">
                <ChannelIcon url={channel.iconUrl} />
                <p className="min-w-0 flex-1 truncate text-base font-medium text-text-primary">{channel.title}</p>
                {!fixedChannelId && (
                  <Button variant="ghost" size="sm" onClick={() => chooseChannel(null)} disabled={submitting}>
                    チャンネルを変える
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {fixedChannelMissing && (
                  <p className="text-md text-input-error">このチャンネルの再生リストは、いまは提案できません。別のチャンネルを探してください。</p>
                )}
                <Field label="どのチャンネルの再生リストですか">
                  {(props) => (
                    <div className="relative">
                      <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                      <Input
                        {...props}
                        className="pl-9"
                        placeholder="チャンネル名で探す"
                        autoComplete="off"
                        value={channelQuery}
                        onChange={(e) => {
                          setChannelQuery(e.target.value);
                          if (!e.target.value.trim()) setChannelResults(null);
                        }}
                      />
                    </div>
                  )}
                </Field>
                {searching && <SkeletonText lines={2} />}
                {!searching && channelResults && channelQuery.trim() && (
                  channelResults.length > 0 ? (
                    <ul className="flex flex-col overflow-hidden rounded-[8px] border border-border-card" data-testid="propose-channel-results">
                      {channelResults.map((c) => (
                        <li key={c.youtubeChannelId} className="border-b border-border-divider last:border-b-0">
                          <button
                            type="button"
                            onClick={() => chooseChannel(c)}
                            className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-bg-hover"
                          >
                            <ChannelIcon url={c.iconUrl} />
                            <span className="truncate text-base text-text-primary">{c.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-md text-text-muted">見つかりませんでした。</p>
                  )
                )}
                <p className="text-md text-text-muted">
                  探しているチャンネルが無いときは{' '}
                  <button
                    type="button"
                    className="text-text-primary underline underline-offset-[3px] hover:text-text-secondary"
                    onClick={() => onSwitchToChannel('')}
                  >
                    チャンネルを推薦する
                  </button>
                </p>
              </div>
            )}

            {/* §5.2 再生リストを選ぶ */}
            {channel &&
              (selected ? (
                <div className="flex flex-col gap-3" data-testid="propose-playlist-selected">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-md text-text-tertiary">選んだ再生リスト</p>
                    <Button variant="ghost" size="sm" onClick={() => choosePlaylist(null)} disabled={submitting}>
                      選び直す
                    </Button>
                  </div>
                  <PlaylistSummary
                    title={selected.title}
                    thumbnailUrl={selected.thumbnailUrl}
                    channelName={channel.title}
                    channelIconUrl={channel.iconUrl}
                    videoCount={selected.videoCount}
                  />
                  {listOutOfScope && (
                    <p className="flex items-start gap-2 text-md text-text-secondary">
                      <InfoIcon size={15} className="mt-[3px] shrink-0 text-toast-info" />
                      <span>この再生リストは「{outOfScopeLabel(selected)}」で公開の対象外になっています。</span>
                    </p>
                  )}
                </div>
              ) : (
                <PlaylistList
                  playlists={playlists}
                  error={playlistsError}
                  isAdmin={isAdmin}
                  filter={playlistFilter}
                  onFilterChange={(v) => {
                    setPlaylistFilter(v);
                    setShownCount(PAGE_SIZE);
                  }}
                  shownCount={shownCount}
                  onShowMore={() => setShownCount((n) => n + PAGE_SIZE)}
                  outOfScopeOpen={outOfScopeOpen}
                  onToggleOutOfScope={() => setOutOfScopeOpen((v) => !v)}
                  onSelect={choosePlaylist}
                />
              ))}

            {channel && !selected && (
              <p className="text-md text-text-muted">
                一覧に無いときは{' '}
                <button
                  type="button"
                  className="text-text-primary underline underline-offset-[3px] hover:text-text-secondary"
                  onClick={() => setMode('url')}
                  data-testid="propose-switch-url"
                >
                  URLで入力する
                </button>
              </p>
            )}
          </div>
        ) : (
          <>
            {/* §5.3 URL 入力 */}
            <div className="flex flex-col gap-4 p-[18px]">
              <div className="flex items-center justify-between gap-2">
                <p className="text-md text-text-tertiary">再生リストのURLで入力</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMode('list');
                    setPreview(null);
                    setPreviewedUrl('');
                    setUrlError(null);
                  }}
                  disabled={submitting}
                >
                  一覧から選ぶ
                </Button>
              </div>
              <Field label="再生リストURL" error={urlError}>
                {(props) => (
                  <Input
                    {...props}
                    type="url"
                    inputMode="url"
                    autoComplete="off"
                    placeholder="https://www.youtube.com/playlist?list=..."
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    onBlur={() => runPreview(playlistUrl.trim())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runPreview(playlistUrl.trim());
                    }}
                    disabled={submitting}
                  />
                )}
              </Field>
              <p className="flex items-start gap-[6px] text-md text-text-muted">
                <AlertIcon size={14} className="mt-[3px] shrink-0" />
                <span>チャンネルが作成・公開している再生リストのみ登録できます</span>
              </p>
              <UrlCopyGuide kind="playlist" />
            </div>
            {(previewLoading || preview) && (
              <CardChildArea className="border-b" aria-live="polite">
                {previewLoading || !preview ? (
                  <div className="flex flex-col gap-3 md:flex-row md:gap-4">
                    <Skeleton className="aspect-video w-full rounded-[8px] md:w-[200px]" />
                    <div className="flex-1 pt-1">
                      <SkeletonText lines={3} />
                    </div>
                  </div>
                ) : (
                  <>
                    <PlaylistSummary
                      title={preview.playlist.title}
                      thumbnailUrl={preview.playlist.thumbnailUrl}
                      channelName={preview.channel.name}
                      channelIconUrl={preview.channel.iconUrl}
                      videoCount={preview.playlist.itemCount}
                    />
                    <ul className="mt-4 flex flex-col gap-[6px]">{urlChecks?.note}</ul>
                    {urlChecks?.ok && urlNeedsAddChannel && (
                      <Checkbox
                        className="mt-3"
                        checked={addChannel}
                        onChange={(e) => setAddChannel(e.target.checked)}
                        disabled={submitting}
                        label="このチャンネルを掲載するチャンネルに加える（掲載方法は「確認してから掲載」）。加えないと登録できません"
                      />
                    )}
                    {isAdmin && urlChecks?.ok && !existing && !preview.channelAlreadyRegistered && (
                      <Field label="チャンネルの説明文（任意・手入力）" className="mt-4">
                        {(props) => <Textarea {...props} value={channelDescription} onChange={(e) => setChannelDescription(e.target.value)} disabled={submitting} />}
                      </Field>
                    )}
                  </>
                )}
              </CardChildArea>
            )}
          </>
        )}

        {/* §5.4 ゲームタイトル・§5.5 送信 */}
        {showGameAndSubmit && (
          <div className="flex flex-col gap-4 border-t border-border-divider p-[18px]">
            <GameTitlePicker
              key={pickerKey}
              games={games}
              onGameCreated={(game) => setGames((prev) => [...prev, game].sort((a, b) => a.title.localeCompare(b.title, 'ja')))}
              isAdmin={isAdmin}
              initialGameId={pickerInitialGameId}
              disabled={submitting}
              titleError={gameTitleError}
              onTitleErrorChange={setGameTitleError}
              onChange={setGameChoice}
            />
            {!isAdmin && (listOutOfScope || (mode === 'url' && !!existing && existing.listingStatus !== 'unconfirmed')) && (
              <Field
                label={`公開してほしい理由（任意・${reason.trim().length}/${MAX_PROPOSE_REASON_LENGTH}）`}
                error={reasonTooLong ? `${MAX_PROPOSE_REASON_LENGTH}文字以内で入力してください` : null}
              >
                {(props) => <Textarea {...props} value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting} rows={2} />}
              </Field>
            )}
            {submitError && (
              <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
                <AlertIcon size={14} className="mt-[2px] shrink-0" />
                <span>{submitError}</span>
              </p>
            )}
            <div className="flex flex-col items-end gap-2">
              {!isAdmin && <p className="text-md text-text-muted">送信後、運営の確認が済むまで公開されません</p>}
              <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
                {isAdmin ? (mode === 'list' || existing ? '公開する' : '登録する') : '提案する'}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ChannelIcon({ url }: { url: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full bg-bg-btn object-cover" />
  ) : (
    <span className="block size-9 shrink-0 rounded-full bg-bg-btn" />
  );
}

/** §5.2 のチャンネルの再生リスト一覧 */
function PlaylistList({
  playlists,
  error,
  isAdmin,
  filter,
  onFilterChange,
  shownCount,
  onShowMore,
  outOfScopeOpen,
  onToggleOutOfScope,
  onSelect,
}: {
  playlists: ProposePlaylist[] | null;
  error: boolean;
  isAdmin: boolean;
  filter: string;
  onFilterChange: (v: string) => void;
  shownCount: number;
  onShowMore: () => void;
  outOfScopeOpen: boolean;
  onToggleOutOfScope: () => void;
  onSelect: (p: ProposePlaylist) => void;
}) {
  if (error) return <p className="text-md text-input-error">再生リストの読み込みに失敗しました。時間をおいて再試行してください。</p>;
  if (!playlists) return <SkeletonText lines={4} />;

  const q = normalizeForSearch(filter);
  const matched = q ? playlists.filter((p) => normalizeForSearch(p.title).includes(q)) : playlists;
  const proposable = matched.filter((p) => proposePlaylistGroup(p) === 'unconfirmed' || (isAdmin && proposePlaylistGroup(p) === 'hidden'));
  const outOfScope = matched.filter((p) => proposePlaylistGroup(p) === 'out_of_scope');
  const listed = matched.filter((p) => proposePlaylistGroup(p) === 'listed');

  return (
    <div className="flex flex-col gap-4" data-testid="propose-playlist-list">
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <Input className="pl-9" placeholder="再生リスト名で絞り込む" aria-label="再生リスト名で絞り込む" value={filter} onChange={(e) => onFilterChange(e.target.value)} />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-md font-medium text-text-secondary">まだ公開していない再生リスト（提案できます）</h2>
        {proposable.length === 0 ? (
          <p className="text-md text-text-muted">ありません。</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {proposable.slice(0, shownCount).map((p) => (
                <PlaylistRow key={p.id} playlist={p} onSelect={onSelect} />
              ))}
            </ul>
            {proposable.length > shownCount && (
              <Button variant="ghost" size="sm" className="w-fit" onClick={onShowMore}>
                もっと見る（残り{proposable.length - shownCount}件）
              </Button>
            )}
          </>
        )}
      </section>

      {outOfScope.length > 0 && (
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onToggleOutOfScope}
            aria-expanded={outOfScopeOpen}
            className="flex w-fit items-center gap-1 text-md font-medium text-text-secondary hover:text-text-primary"
            data-testid="propose-out-of-scope-toggle"
          >
            <ChevronDownIcon size={14} className={cn('transition-transform duration-[120ms]', !outOfScopeOpen && '-rotate-90')} />
            公開の対象外になっている再生リスト（{outOfScope.length}件）
          </button>
          {outOfScopeOpen && (
            <ul className="flex flex-col gap-2">
              {outOfScope.map((p) => (
                <PlaylistRow key={p.id} playlist={p} onSelect={onSelect} note={outOfScopeLabel(p)} />
              ))}
            </ul>
          )}
        </section>
      )}

      {listed.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-md font-medium text-text-secondary">公開中の再生リスト</h2>
          <ul className="flex flex-col gap-2">
            {listed.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-[8px] border border-border-card px-2 py-2">
                <Thumb url={p.thumbnailUrl} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-base text-text-secondary">{p.title}</p>
                  <p className="text-sm text-text-muted">公開中</p>
                </div>
                <Link href={`/playlists/${p.id}`} className="shrink-0 text-md text-text-secondary underline underline-offset-[3px] hover:text-text-primary">
                  詳細へ
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PlaylistRow({ playlist: p, onSelect, note }: { playlist: ProposePlaylist; onSelect: (p: ProposePlaylist) => void; note?: string }) {
  const disabled = p.pending;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(p)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center gap-3 rounded-[8px] border border-border-card px-2 py-2 text-left',
          disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-border-card-hover hover:bg-bg-hover',
        )}
        data-testid="propose-playlist-row"
      >
        <Thumb url={p.thumbnailUrl} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 text-base text-text-primary">{p.title}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            <span>動画 {p.videoCount}本</span>
            {p.gameName && <Tag>{p.gameName}</Tag>}
            {note && <span>{note}</span>}
            {p.hiddenByAdmin && <span className="text-input-error">運営が非表示</span>}
            {p.pending && <span>{p.pendingIsMine ? 'あなたが提案済み（確認待ち）' : '提案済み（確認待ち）'}</span>}
          </div>
        </div>
      </button>
    </li>
  );
}

function Thumb({ url }: { url: string }) {
  return (
    <div className="relative aspect-video w-[96px] shrink-0 overflow-hidden rounded-[6px] bg-bg-btn md:w-[120px]">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  );
}

/** 確認エリアのチェック結果行（ページ 再生リストを追加する 仕様書 §4.1.1） */
function CheckLine({ state, children }: { state: 'ok' | 'ng' | 'info'; children: ReactNode }) {
  const icon =
    state === 'ok' ? (
      <CheckIcon size={15} className="text-toast-success" />
    ) : state === 'ng' ? (
      <AlertIcon size={15} className="text-input-error" />
    ) : (
      <InfoIcon size={15} className="text-toast-info" />
    );
  return (
    <li className={cn('flex items-start gap-2 text-base', state === 'ng' ? 'text-input-error' : 'text-text-secondary')}>
      <span className="mt-[3px] shrink-0">{icon}</span>
      <span>{children}</span>
    </li>
  );
}
