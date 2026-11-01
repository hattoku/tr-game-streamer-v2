/**
 * ゲーム未設定の再生リストの案内カード（再生リスト詳細。ゲームタイトル（GameInfoCard）の代わりに出す）。
 * ログイン中のユーザーは「ゲームを登録」から既存のゲームタイトルを選んで付けられる（審査なし。新しいゲームタイトルは作れない）。
 * 荒らし対策（付いていれば変更不可・1日20件・管理者が外したゲームは選べない）はサーバー側（/api/playlists/[playlistId]/game）。
 * 既存のゲームに無いときは、ゲーム選択の下の「新しいゲームタイトルとして入力する」から新しいゲームタイトルを提案できる
 * （審査あり。運営が新規登録するか既存に付ける。/api/playlists/[playlistId]/game-proposal。再生リスト詳細仕様書 v1.16）。
 */
'use client';

import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { findSimilarGames } from '@/lib/game-shared';
import { MAX_GAME_PROPOSAL_NOTE_LENGTH, MAX_GAME_TITLE_LENGTH } from '@/lib/proposal-shared';
import { useToast } from '@/components/ui/Toast';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';

const ERROR_MESSAGE: Record<string, string> = {
  already_set: 'この再生リストには、すでにゲームが登録されています',
  rejected_game: 'このゲームは、運営が外したため選べません',
  game_not_found: 'そのゲームタイトルは見つかりませんでした',
  daily_limit: '今日は登録できる上限に達しました。明日また登録できます',
  already_proposed: 'この再生リストには、すでに審査中のゲームタイトルの提案があります',
  game_exists: '同じ名前のゲームタイトルがすでにあります。一覧から選んでください',
};

interface GameRegisterCardProps {
  playlistId: string;
  /** ログイン中か */
  signedIn: boolean;
  /** 登録できたとき（呼び出し側で表示を更新する） */
  onRegistered: (gameId: string) => void;
}

export function GameRegisterCard({ playlistId, signedIn, onRegistered }: GameRegisterCardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [games, setGames] = useState<GameOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposeTitle, setProposeTitle] = useState('');
  const [proposeNote, setProposeNote] = useState('');
  const similar = findSimilarGames(proposeTitle, games ?? []);

  async function openModal() {
    setOpen(true);
    if (games) return;
    let snap;
    try {
      snap = await getDocs(collection(db, 'games'));
    } catch {
      toast({ type: 'error', message: 'ゲームの一覧を読み込めませんでした' });
      setOpen(false);
      return;
    }
    setGames(
      snap.docs
        .map((d) => ({
          id: d.id,
          title: (d.data().title as string) ?? '',
          packageImageUrl: (d.data().packageImageUrl as string) ?? null,
          aliases: (d.data().aliases as string[] | undefined) ?? [],
        }))
        .sort((a, b) => a.title.localeCompare(b.title, 'ja')),
    );
  }

  async function register(game: GameOption) {
    setBusy(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast({ type: 'error', message: 'ログインしてから登録してください' });
        return;
      }
      const res = await fetch(`/api/playlists/${playlistId}/game`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ gameId: game.id }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast({ type: 'success', message: `「${game.title}」を登録しました` });
        onRegistered(game.id);
      } else {
        toast({ type: 'error', message: ERROR_MESSAGE[json.error ?? ''] ?? 'ゲームを登録できませんでした' });
      }
    } catch {
      toast({ type: 'error', message: 'ゲームを登録できませんでした。通信を確かめてください' });
    } finally {
      setBusy(false);
    }
  }

  async function propose() {
    setBusy(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        toast({ type: 'error', message: 'ログインしてから提案してください' });
        return;
      }
      const res = await fetch(`/api/playlists/${playlistId}/game-proposal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ gameTitle: proposeTitle, note: proposeNote }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast({ type: 'success', message: 'ゲームタイトルを提案しました。運営が確認して登録します' });
        setProposeOpen(false);
        setProposeTitle('');
        setProposeNote('');
      } else {
        toast({ type: 'error', message: ERROR_MESSAGE[json.error ?? ''] ?? 'ゲームタイトルを提案できませんでした' });
      }
    } catch {
      toast({ type: 'error', message: 'ゲームタイトルを提案できませんでした。通信を確かめてください' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="game-register-card">
      <h2 className="text-lg font-medium text-text-primary">ゲームが未設定です</h2>
      <p className="text-md text-text-secondary">
        この再生リストは、まだゲームタイトルが決まっていません。わかる方は登録してください。
        一覧に載っているゲームから選べます（登録するとすぐ反映され、運営があとから確認します）。
      </p>
      {signedIn ? (
        <div>
          <Button variant="secondary" onClick={openModal} loading={busy}>
            ゲームを登録
          </Button>
        </div>
      ) : (
        <p className="text-md text-text-tertiary">ゲームを登録するには、ログインしてください。</p>
      )}
      <GameSelectModal
        open={open}
        onOpenChange={setOpen}
        games={games ?? []}
        onSelect={(g) => {
          setOpen(false);
          void register(g);
        }}
        onEnterNew={(query) => {
          setOpen(false);
          setProposeTitle(query);
          setProposeOpen(true);
        }}
      />
      <Modal
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        title="新しいゲームタイトルを提案"
        description="一覧にないゲームタイトルを提案します。運営が確認して、新しく登録するか、既存のゲームに付けます。"
      >
        <div className="flex flex-col gap-4">
          <Field label="ゲームタイトル名" htmlFor="propose-game-title" hint="正式な名前がわかれば、正式な名前で入力してください">
            <Input id="propose-game-title" value={proposeTitle} maxLength={MAX_GAME_TITLE_LENGTH} onChange={(e) => setProposeTitle(e.target.value)} />
          </Field>
          {similar.length > 0 && (
            <div className="rounded-[8px] border border-surface-border p-3 text-md text-text-secondary" data-testid="similar-games">
              <p>登録済みのこちらではありませんか？</p>
              <ul className="mt-1 list-inside list-disc">
                {similar.map((g) => (
                  <li key={g.id}>
                    <button type="button" className="underline underline-offset-2 hover:text-text-primary" onClick={() => { setProposeOpen(false); void register(g); }}>
                      {g.title}
                    </button>
                    （選ぶとこのゲームを登録します）
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Field label="備考（任意）" htmlFor="propose-game-note">
            <Textarea id="propose-game-note" rows={3} value={proposeNote} maxLength={MAX_GAME_PROPOSAL_NOTE_LENGTH} onChange={(e) => setProposeNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setProposeOpen(false)}>キャンセル</Button>
            <Button variant="primary" onClick={propose} loading={busy} disabled={!proposeTitle.trim()}>提案する</Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
