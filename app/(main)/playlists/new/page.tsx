'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardChildArea, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, INPUT_CLASS, Input, Textarea } from '@/components/ui/Input';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, CheckIcon, ChevronDownIcon, InfoIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { PlaylistSummary } from '@/components/playlists/PlaylistSummary';

// 「再生リストを追加する」（管理者専用の最小版）。
// document/specification/page/ページ 再生リストを追加する 仕様書.md §2.1（1カラム）、§4.1（URL入力・確認エリア）、
// §4.2（ゲームタイトル選択モーダル）、§4.3（送信ボタン）、§6.1（管理者向け完了画面）、§7（インライン＋トースト）。
// フェーズ2.5ステップ7でデザイン適用（wiki/sources/2026-09-12-login-and-register-design-plan.md）。
// スコープ外（フェーズ3以降。wiki/sources/2026-09-10-phase2-plan.md）:
// - 一般ユーザーの提案フロー（§5.4・§6.2）・ゲームタイトル追加提案モーダル（§4.2.2）・AI説明文自動生成（§4.1.4）
// - 流入元による案内エリア（§3。ゲーム詳細・チャンネル詳細ページが未実装）
// 未ログインは /login へ（§1.2）。一般ユーザーには「管理者のみ」の空状態を出す（提案フローができるまで）。

interface PreviewResult {
  playlist: {
    youtubePlaylistId: string;
    title: string;
    thumbnailUrl: string;
    itemCount: number;
    isPublic: boolean;
  };
  channel: { youtubeChannelId: string; name: string; iconUrl: string };
  channelMatches: boolean;
  channelAlreadyRegistered: boolean;
  playlistAlreadyRegistered: boolean;
}

interface CompletionResult {
  playlistId: string;
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  gameName: string;
  videoCount: number;
}

// URL 形式の事前チェック（§4.1「playlist?list= を含む URL」）。サーバー側 lib/youtube.ts の extractPlaylistId と
// 同じ判定だが、あのモジュールは API キーを持つためクライアントに import しない
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

// §7.2 エラーケース一覧: インライン文言とトースト文言の対
const PREVIEW_ERRORS: Record<string, { inline: string; toast: string }> = {
  invalid_url: { inline: 'YouTubeの再生リストURLを入力してください', toast: 'URLの形式が正しくありません' },
  playlist_not_found: { inline: '再生リストが見つかりませんでした。URLを確認してください', toast: '再生リストの取得に失敗しました' },
  default: { inline: '再生リストの取得に失敗しました', toast: '再生リストの取得に失敗しました' },
};
const REGISTER_ERRORS: Record<string, { inline: string; toast: string }> = {
  already_registered: { inline: 'この再生リストはすでに登録されています', toast: '登録済みの再生リストです' },
  not_public: { inline: 'この再生リストは非公開または限定公開のため登録できません', toast: '公開されていない再生リストです' },
  game_not_found: { inline: 'ゲームタイトルが見つかりませんでした', toast: '送信に失敗しました。時間をおいて再試行してください' },
  default: { inline: '', toast: '送信に失敗しました。時間をおいて再試行してください' },
};

export default function NewPlaylistPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [previewedUrl, setPreviewedUrl] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const [games, setGames] = useState<GameOption[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameOption | null>(null);
  const [gameModalOpen, setGameModalOpen] = useState(false);
  const [gameError, setGameError] = useState<string | null>(null);

  const [channelDescription, setChannelDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);

  const isAdmin = role === 'owner' || role === 'operator';

  // 未ログインはログインページへ（§1.2）
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!isAdmin) return;
    getDocs(collection(db, 'games'))
      .then((snapshot) => {
        setGames(
          snapshot.docs
            .map((d) => ({
              id: d.id,
              title: (d.data().title as string) ?? '',
              packageImageUrl: (d.data().packageImageUrl as string | undefined) ?? null,
            }))
            .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
        );
      })
      .catch((e) => console.error('games の読み込みに失敗', e));
  }, [isAdmin]);

  async function handleUrlBlur() {
    const url = playlistUrl.trim();
    if (!url) {
      setPreview(null);
      setPreviewedUrl('');
      setUrlError(null);
      return;
    }
    // 同じ URL の再 blur では取り直さない
    if (url === previewedUrl) return;

    setPreview(null);
    setPreviewedUrl(url);
    setSubmitError(null);
    if (!isPlaylistUrl(url)) {
      setUrlError(PREVIEW_ERRORS.invalid_url.inline);
      toast({ type: 'error', message: PREVIEW_ERRORS.invalid_url.toast });
      return;
    }

    setPreviewLoading(true);
    setUrlError(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/playlists/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ playlistUrl: url }),
      });
      const body = await res.json();
      if (!res.ok) {
        const msg = PREVIEW_ERRORS[body.error as string] ?? PREVIEW_ERRORS.default;
        setUrlError(msg.inline);
        toast({ type: 'error', message: msg.toast });
        return;
      }
      const result = body as PreviewResult;
      setPreview(result);
      // 制約チェック（§4.1.5）の NG は確認エリアに出しつつトーストでも知らせる（§7.2）
      if (!result.playlist.isPublic) toast({ type: 'error', message: '公開されていない再生リストです' });
      else if (!result.channelMatches) toast({ type: 'error', message: '登録できない再生リストです' });
      else if (result.playlistAlreadyRegistered) toast({ type: 'error', message: '登録済みの再生リストです' });
    } catch {
      setUrlError(PREVIEW_ERRORS.default.inline);
      toast({ type: 'error', message: PREVIEW_ERRORS.default.toast });
    } finally {
      setPreviewLoading(false);
    }
  }

  const constraintsOk = !!preview && preview.playlist.isPublic && preview.channelMatches && !preview.playlistAlreadyRegistered;
  const canSubmit = constraintsOk && !!selectedGame && !submitting;

  async function handleSubmit() {
    if (!constraintsOk || submitting) return;
    if (!selectedGame) {
      // ボタンは非活性のため通常は起きない（§7.2 の注記）。保険としてインラインのみ
      setGameError('ゲームタイトルを選択してください');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const idToken = await getIdToken();
      const res = await fetch('/api/playlists/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          playlistUrl: playlistUrl.trim(),
          gameId: selectedGame.id,
          channelDescription: preview?.channelAlreadyRegistered ? undefined : channelDescription,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const msg = REGISTER_ERRORS[body.error as string] ?? REGISTER_ERRORS.default;
        setSubmitError(msg.inline || null);
        toast({ type: 'error', message: msg.toast });
        return;
      }
      setCompletion(body as CompletionResult);
      toast({ type: 'success', message: '再生リストを登録しました' });
    } catch {
      toast({ type: 'error', message: REGISTER_ERRORS.default.toast });
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setPlaylistUrl('');
    setPreviewedUrl('');
    setPreview(null);
    setUrlError(null);
    setSelectedGame(null);
    setGameError(null);
    setChannelDescription('');
    setSubmitError(null);
    setCompletion(null);
  }

  if (loading || !user) return <NewPlaylistSkeleton />;

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-[720px]">
        <SectionHeading className="mb-5">再生リストを追加する</SectionHeading>
        <EmptyState
          icon={<AlertIcon />}
          title="このページは管理者のみ利用できます"
          description="一般ユーザー向けの再生リスト提案機能は準備中です"
          action={
            <LinkButton href="/" variant="secondary">
              TOPへ戻る
            </LinkButton>
          }
        />
      </div>
    );
  }

  // 完了画面（§6.1）: 同一ページ内で切り替える
  if (completion) {
    return (
      <div className="mx-auto max-w-[720px]">
        <SectionHeading className="mb-5 flex items-center gap-2">
          <CheckIcon size={22} className="shrink-0 text-toast-success" />
          登録が完了しました
        </SectionHeading>
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
          <LinkButton href={`/playlists/${completion.playlistId}`} variant="primary">
            再生リストを見る
          </LinkButton>
          <Button variant="secondary" onClick={resetForm}>
            続けて登録する
          </Button>
        </div>
      </div>
    );
  }

  const showChannelState = constraintsOk;

  return (
    <div className="mx-auto max-w-[720px]">
      <SectionHeading className="mb-5">再生リストを追加する</SectionHeading>

      <Card flush>
        <div className="flex flex-col gap-4 p-[18px]">
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
                onBlur={handleUrlBlur}
                disabled={submitting}
              />
            )}
          </Field>
          <p className="flex items-start gap-[6px] text-md text-text-muted">
            <AlertIcon size={14} className="mt-[3px] shrink-0" />
            <span>チャンネルが作成・公開している再生リストのみ登録できます</span>
          </p>
        </div>

        {/* 再生リスト確認エリア（§4.1.1〜4.1.3）。フォームの中の子領域として見せる */}
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
                <ul className="mt-4 flex flex-col gap-[6px]">
                  {/* チェック順序: 公開状態 → チャンネル一致。前段が NG なら後段は出さない（§4.1.1） */}
                  {preview.playlist.isPublic ? (
                    <CheckLine state="ok">公開されている再生リストです</CheckLine>
                  ) : (
                    <CheckLine state="ng">この再生リストは非公開または限定公開のため登録できません</CheckLine>
                  )}
                  {preview.playlist.isPublic &&
                    (preview.channelMatches ? (
                      <CheckLine state="ok">チャンネルが作成した再生リストです</CheckLine>
                    ) : (
                      <CheckLine state="ng">チャンネルが作成した再生リストではないため登録できません</CheckLine>
                    ))}
                  {preview.playlistAlreadyRegistered && <CheckLine state="ng">この再生リストはすでに登録されています</CheckLine>}
                  {showChannelState &&
                    (preview.channelAlreadyRegistered ? (
                      <CheckLine state="ok">プレミテ登録済みチャンネルです。再生リストと紐づけます。</CheckLine>
                    ) : (
                      <CheckLine state="info">未登録のチャンネルです。再生リスト登録と同時に新規チャンネルとして登録します。</CheckLine>
                    ))}
                </ul>
                {showChannelState && !preview.channelAlreadyRegistered && (
                  <Field
                    label="チャンネルの説明文（任意・手入力）"
                    hint="AIによる自動生成は準備中のため、必要なら手入力してください"
                    className="mt-4"
                  >
                    {(props) => (
                      <Textarea
                        {...props}
                        value={channelDescription}
                        onChange={(e) => setChannelDescription(e.target.value)}
                        disabled={submitting}
                      />
                    )}
                  </Field>
                )}
              </>
            )}
          </CardChildArea>
        )}

        <div className="flex flex-col gap-4 p-[18px]">
          {/* ゲームタイトル選択（§4.2）。表示部は入力要素と同じ面＋シェブロン（トークン仕様書 §10 のセレクト） */}
          <Field label="ゲームタイトル" error={gameError}>
            {(props) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  id={props.id}
                  aria-invalid={props['aria-invalid']}
                  aria-describedby={props['aria-describedby']}
                  aria-haspopup="dialog"
                  onClick={() => {
                    setGameError(null);
                    setGameModalOpen(true);
                  }}
                  disabled={submitting}
                  className={cn(INPUT_CLASS, 'flex items-center justify-between gap-2 text-left', !selectedGame && 'text-input-placeholder')}
                >
                  <span className="truncate">{selectedGame ? selectedGame.title : 'ゲームタイトルを選択する'}</span>
                  <ChevronDownIcon size={16} className="shrink-0 text-text-muted" />
                </button>
                {selectedGame && (
                  <Button variant="ghost" size="sm" aria-label="ゲームタイトルの選択を解除" onClick={() => setSelectedGame(null)} disabled={submitting}>
                    <XIcon size={16} />
                  </Button>
                )}
              </div>
            )}
          </Field>

          {submitError && (
            <p role="alert" className="flex items-start gap-[6px] text-md text-input-error">
              <AlertIcon size={14} className="mt-[2px] shrink-0" />
              <span>{submitError}</span>
            </p>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit} loading={submitting}>
              登録する
            </Button>
          </div>
        </div>
      </Card>

      <GameSelectModal open={gameModalOpen} onOpenChange={setGameModalOpen} games={games} onSelect={setSelectedGame} />
    </div>
  );
}

/** 確認エリアのチェック結果行（§4.1.1）。✅／❌／ℹ️ はアイコンで描く */
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

function NewPlaylistSkeleton() {
  return (
    <div className="mx-auto max-w-[720px]">
      <Skeleton className="mb-5 h-6 w-[200px]" />
      <div className="flex flex-col gap-4 rounded-[12px] border border-border-card bg-gradient-card p-[18px] shadow-card">
        <Skeleton className="h-3 w-[90px]" />
        <Skeleton className="h-10 w-full rounded-[7px]" />
        <Skeleton className="h-3 w-[60%]" />
        <Skeleton className="mt-2 h-3 w-[80px]" />
        <Skeleton className="h-10 w-full rounded-[7px]" />
        <div className="flex justify-end">
          <Skeleton className="h-10 w-[100px] rounded-[8px]" />
        </div>
      </div>
    </div>
  );
}
