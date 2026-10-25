/**
 * ゲームタイトル追加提案モーダル（ページ 再生リストを追加する 仕様書 §4.2.2、フェーズ7ステップ7-4）。
 * 一般ユーザーが GameSelectModal のフッター「ゲームタイトルの登録を提案する」から開く。
 * 送信は POST /api/games/propose（`workflows` に type: "game_title_register" で保存）。
 * 送信後はモーダル内に完了メッセージを出し、閉じても再生リスト追加フォームの状態は消さない（呼び出し側で保持）。
 * 管理者は GameCreateModal で直接登録するため、このモーダルは出さない（§4.2.2 対象ユーザー）。
 */
'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { CheckIcon } from '@/components/ui/icons';
import { MAX_GAME_PROPOSAL_NOTE_LENGTH, MAX_GAME_TITLE_LENGTH } from '@/lib/proposal-shared';

interface GameProposalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 再生リスト追加フォームで入力済みのURL（あれば自動入力する） */
  defaultPlaylistUrl: string;
  /** 「戻る」: ゲームタイトル選択モーダルへ戻る（§4.2.2 のフッター） */
  onBack: () => void;
}

function isPlaylistUrl(url: string): boolean {
  try {
    return !!new URL(url).searchParams.get('list');
  } catch {
    return false;
  }
}

const SUBMIT_ERRORS: Record<string, { field: 'url' | 'title' | null; message: string }> = {
  invalid_url: { field: 'url', message: 'YouTubeの再生リストURLを入力してください' },
  game_exists: { field: 'title', message: 'このゲームタイトルはすでに登録されています。選択画面で検索してください' },
  already_proposed: { field: 'title', message: 'このゲームタイトルはすでに提案されています。登録までお待ちください' },
};

export function GameProposalModal({ open, onOpenChange, defaultPlaylistUrl, onBack }: GameProposalModalProps) {
  const { toast } = useToast();
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [gameTitle, setGameTitle] = useState('');
  const [note, setNote] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // 開くたびにリセットし、フォームの入力済みURLを入れる（GameCreateModal と同じ「propが変わったらstateを調整する」パターン）
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPlaylistUrl(defaultPlaylistUrl);
      setGameTitle('');
      setNote('');
      setUrlError(null);
      setTitleError(null);
      setNoteError(null);
      setDone(false);
    }
  }

  // §4.2.2 バリデーション
  function validate(): boolean {
    const url = playlistUrl.trim();
    const title = gameTitle.trim();
    const nextUrlError = !url ? '再生リストのURLを入力してください' : !isPlaylistUrl(url) ? 'YouTubeの再生リストURLを入力してください' : null;
    const nextTitleError = !title
      ? 'ゲームタイトル名を入力してください'
      : title.length > MAX_GAME_TITLE_LENGTH
        ? `${MAX_GAME_TITLE_LENGTH}文字以内で入力してください`
        : null;
    const nextNoteError = note.trim().length > MAX_GAME_PROPOSAL_NOTE_LENGTH ? `${MAX_GAME_PROPOSAL_NOTE_LENGTH}文字以内で入力してください` : null;
    setUrlError(nextUrlError);
    setTitleError(nextTitleError);
    setNoteError(nextNoteError);
    return !nextUrlError && !nextTitleError && !nextNoteError;
  }

  async function handleSubmit() {
    if (submitting || !validate()) return;
    setSubmitting(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/games/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ playlistUrl: playlistUrl.trim(), gameTitle: gameTitle.trim(), note: note.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const known = SUBMIT_ERRORS[body.error as string];
        if (known?.field === 'url') setUrlError(known.message);
        else if (known?.field === 'title') setTitleError(known.message);
        else toast({ type: 'error', message: '送信に失敗しました。時間をおいて再試行してください' });
        return;
      }
      setDone(true);
    } catch {
      toast({ type: 'error', message: '送信に失敗しました。時間をおいて再試行してください' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      // 完了時はタイトルを受付メッセージに切り替える（仕様の「📨」は他の完了画面と同じくアイコンで描く）
      title={
        done ? (
          <span className="flex items-center gap-2">
            <CheckIcon size={22} className="shrink-0 text-toast-success" />
            ゲームタイトルの提案を受け付けました
          </span>
        ) : (
          'ゲームタイトルの追加を提案する'
        )
      }
    >
      {done ? (
        <div className="flex flex-col gap-4" aria-live="polite">
          <p className="text-base text-text-secondary">
            ありがとうございます！
            <br />
            内容を確認後、ゲームタイトルの登録を検討します。
            <br />
            一緒に送っていただいた再生リストも、ゲームタイトルの登録とあわせて掲載を検討します。
          </p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              閉じる
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-base text-text-secondary">追加してほしいゲームタイトルの情報を入力してください。</p>
          <Field label="追加したい再生リストのURL" error={urlError}>
            {(props) => (
              <Input
                {...props}
                type="url"
                inputMode="url"
                autoComplete="off"
                placeholder="https://www.youtube.com/playlist?list=..."
                value={playlistUrl}
                onChange={(e) => setPlaylistUrl(e.target.value)}
                disabled={submitting}
              />
            )}
          </Field>
          <Field label={`ゲームタイトル名 *（${gameTitle.trim().length}/${MAX_GAME_TITLE_LENGTH}）`} error={titleError}>
            {(props) => <Input {...props} value={gameTitle} onChange={(e) => setGameTitle(e.target.value)} disabled={submitting} />}
          </Field>
          <Field
            label={`備考（${note.trim().length}/${MAX_GAME_PROPOSAL_NOTE_LENGTH}）`}
            hint="発売機種・シリーズ情報など補足があれば記入してください"
            error={noteError}
          >
            {(props) => <Textarea {...props} value={note} onChange={(e) => setNote(e.target.value)} disabled={submitting} rows={3} />}
          </Field>
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                onBack();
              }}
              disabled={submitting}
            >
              戻る
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={submitting}>
              提案を送信する
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
