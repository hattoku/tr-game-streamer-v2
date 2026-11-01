/**
 * ゲーム未設定の再生リストの案内カード（再生リスト詳細。ゲームタイトル（GameInfoCard）の代わりに出す）。
 * ログイン中のユーザーは「ゲームを登録」から既存のゲームタイトルを選んで付けられる（審査なし。新しいゲームタイトルは作れない）。
 * 荒らし対策（付いていれば変更不可・1日20件・管理者が外したゲームは選べない）はサーバー側（/api/playlists/[playlistId]/game）。
 */
'use client';

import { useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';

const ERROR_MESSAGE: Record<string, string> = {
  already_set: 'この再生リストには、すでにゲームが登録されています',
  rejected_game: 'このゲームは、運営が外したため選べません',
  daily_limit: '今日は登録できる上限（20件）に達しました。明日また登録できます',
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

  async function openModal() {
    setOpen(true);
    if (games) return;
    const snap = await getDocs(collection(db, 'games'));
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
      />
    </Card>
  );
}
