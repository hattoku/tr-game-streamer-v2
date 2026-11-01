/**
 * ゲーム未設定の再生リスト（/admin/collection/unset）。管理 AI運営者向け収集候補レビューUI仕様書 v2.5 §6.5。
 *
 * 「ゲーム未設定で登録」した再生リストの一覧。ゲームを選んで付ける、ゲームを新規登録して付ける、いますぐ照合する
 * （ゲームのタイトル・別名と再生リストのヒント・名前を照合して自動で付ける）ことができる。
 * ゲームが登録・編集されたときにも同じ照合を自動で行う。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Card, SectionHeading } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { CollectionNav } from '@/components/admin/collection/CollectionNav';
import { GameSelectModal, type GameOption } from '@/components/playlists/GameSelectModal';
import { GameCreateModal } from '@/components/games/GameCreateModal';
import { formatDateTime, postAdminApi } from '@/lib/collection-admin';

interface UnsetPlaylist {
  id: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;
  gameHint: string;
  registeredAt: number | null;
  gameName: string;
  gameSetAt: number | null;
}

async function fetchPlaylists(field: 'gameId' | 'gameSetBy', value: null | 'user'): Promise<UnsetPlaylist[]> {
  const snap = await getDocs(query(collection(db, 'playlists'), where(field, '==', value)));
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        title: (data.title as string) ?? '',
        channelName: (data.channelName as string) ?? '',
        thumbnailUrl: (data.thumbnailUrl as string) ?? '',
        gameHint: (data.gameHint as string | null) ?? '',
        registeredAt: (data.registeredAt as { toMillis(): number } | undefined)?.toMillis?.() ?? null,
        gameName: (data.gameName as string) ?? '',
        gameSetAt: (data.gameSetAt as { toMillis(): number } | null)?.toMillis?.() ?? null,
      };
    })
    .sort((a, b) => (b.gameSetAt ?? b.registeredAt ?? 0) - (a.gameSetAt ?? a.registeredAt ?? 0));
}

const fetchUnsetPlaylists = () => fetchPlaylists('gameId', null);
/** 一般ユーザーが登録したゲーム（確認して、違えば戻す。v3.2 §6.5） */
const fetchUserSetPlaylists = () => fetchPlaylists('gameSetBy', 'user');

async function fetchGames(): Promise<GameOption[]> {
  const snap = await getDocs(collection(db, 'games'));
  return snap.docs
    .map((d) => ({
      id: d.id,
      title: (d.data().title as string) ?? '',
      packageImageUrl: (d.data().packageImageUrl as string) ?? null,
      aliases: (d.data().aliases as string[] | undefined) ?? [],
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ja'));
}

export default function AdminUnsetPlaylistsPage() {
  const { toast } = useToast();
  const [playlists, setPlaylists] = useState<UnsetPlaylist[] | null>(null);
  const [userSet, setUserSet] = useState<UnsetPlaylist[]>([]);
  const [games, setGames] = useState<GameOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectFor, setSelectFor] = useState<UnsetPlaylist | null>(null);
  const [createFor, setCreateFor] = useState<UnsetPlaylist | null>(null);

  useEffect(() => {
    // 非同期 IIFE にして、effect 本体で同期的に setState しない形にする（react-hooks/set-state-in-effect）
    (async () => {
      const [list, gameList, byUser] = await Promise.all([fetchUnsetPlaylists(), fetchGames(), fetchUserSetPlaylists()]);
      setPlaylists(list);
      setUserSet(byUser);
      setGames(gameList);
    })();
  }, []);

  async function reload() {
    const [list, byUser] = await Promise.all([fetchUnsetPlaylists(), fetchUserSetPlaylists()]);
    setPlaylists(list);
    setUserSet(byUser);
  }

  async function revert(playlist: UnsetPlaylist) {
    if (!window.confirm(`「${playlist.gameName}」を外して、ゲーム未設定に戻しますか？（このゲームは自動では付け直されません）`)) return;
    setBusy(playlist.id);
    const res = await postAdminApi('/api/admin/playlist-game', { action: 'unlink', playlistId: playlist.id });
    setBusy(null);
    if (res.ok) {
      toast({ type: 'success', message: 'ゲーム未設定に戻しました' });
      await reload();
    } else {
      toast({ type: 'error', message: '戻せませんでした' });
    }
  }

  async function link(playlist: UnsetPlaylist, gameId: string) {
    setBusy(playlist.id);
    const res = await postAdminApi('/api/admin/playlist-game', { action: 'link', playlistId: playlist.id, gameId });
    setBusy(null);
    // 新規登録したゲームの自動照合で、すでに付いていた場合も成功として扱う
    if (res.ok || res.status === 409) {
      toast({ type: 'success', message: res.ok ? 'ゲームを付けました' : '自動照合ですでにゲームが付いていました' });
      await reload();
    } else {
      toast({ type: 'error', message: 'ゲームを付けられませんでした' });
    }
  }

  async function relink() {
    setBusy('relink');
    const res = await postAdminApi<{ scanned?: number; linked?: number }>('/api/admin/playlist-game', { action: 'relink' });
    setBusy(null);
    if (!res.ok) {
      toast({ type: 'error', message: '照合に失敗しました' });
      return;
    }
    toast({ type: 'success', message: `${res.body.scanned ?? 0}件を照合し、${res.body.linked ?? 0}件にゲームを付けました` });
    await reload();
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading>コンテンツ収集</SectionHeading>
      <CollectionNav />
      <h2 className="text-xl font-medium text-text-primary">ゲーム未設定の再生リスト</h2>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base text-text-secondary">
          ゲームタイトルが登録・編集されたときに、ヒントや再生リスト名が合うものへ自動で付きます。「いますぐ照合」で、今ある未設定をまとめて照合できます。
        </p>
        <Button variant="secondary" onClick={relink} loading={busy === 'relink'} disabled={busy !== null || !playlists?.length}>
          いますぐ照合
        </Button>
      </Card>

      {playlists === null ? (
        <SkeletonText lines={4} />
      ) : playlists.length === 0 ? (
        <EmptyState title="ゲーム未設定の再生リストはありません" description="収集候補で「ゲーム未設定で登録」すると、ここに並びます" />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="ゲーム未設定の再生リスト">
          {playlists.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 gap-3">
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- YouTube のサムネイルURL（外部・可変）をそのまま表示する
                    <img src={p.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="h-14 w-24 shrink-0 rounded-[6px] object-cover" loading="lazy" />
                  ) : (
                    <span className="h-14 w-24 shrink-0 rounded-[6px] bg-bg-hover" />
                  )}
                  <div className="min-w-0">
                    <Link href={`/playlists/${p.id}`} className="block truncate text-lg font-medium text-text-primary hover:underline">
                      {p.title}
                    </Link>
                    <p className="truncate text-md text-text-tertiary">{p.channelName}</p>
                    <p className="text-sm text-text-tertiary">
                      ヒント: {p.gameHint || '（なし）'} ／ 登録 {formatDateTime(p.registeredAt)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setSelectFor(p)} disabled={busy !== null} aria-label={`${p.title}のゲームを選ぶ`}>
                    ゲームを選ぶ
                  </Button>
                  <Button variant="secondary" onClick={() => setCreateFor(p)} disabled={busy !== null} aria-label={`${p.title}のゲームを新規登録して付ける`}>
                    新規登録して付ける
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {userSet.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="ユーザーが登録したゲーム">
          <h3 className="text-lg font-medium text-text-primary">ユーザーが登録したゲーム（{userSet.length}件）</h3>
          <p className="text-md text-text-tertiary">一般ユーザーが付けたゲームです。違っていたら「戻す」で未設定に戻せます（戻したゲームは、その再生リストにはもう選べません）。</p>
          <ul className="flex flex-col gap-2">
            {userSet.map((p) => (
              <li key={p.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/playlists/${p.id}`} className="block truncate text-base font-medium text-text-primary hover:underline">
                      {p.title}
                    </Link>
                    <p className="text-md text-text-tertiary">ゲーム: {p.gameName} ／ 登録 {formatDateTime(p.gameSetAt)}</p>
                  </div>
                  <Button variant="secondary" onClick={() => revert(p)} disabled={busy !== null} aria-label={`${p.title}のゲームを外して戻す`}>
                    戻す
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GameSelectModal
        open={selectFor !== null}
        onOpenChange={(open) => !open && setSelectFor(null)}
        games={games}
        onSelect={(g) => {
          if (selectFor) void link(selectFor, g.id);
          setSelectFor(null);
        }}
      />
      <GameCreateModal
        open={createFor !== null}
        onOpenChange={(open) => !open && setCreateFor(null)}
        initialQuery={createFor?.gameHint || createFor?.title}
        onCreated={(g) => {
          setGames((prev) => [...prev, g].sort((a, b) => a.title.localeCompare(b.title, 'ja')));
          if (createFor) void link(createFor, g.id);
          setCreateFor(null);
        }}
      />
    </div>
  );
}
