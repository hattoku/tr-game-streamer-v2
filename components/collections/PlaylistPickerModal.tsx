/**
 * まとめ作成・編集フォームの「＋ 再生リストを追加する」（まとめ機能仕様書 §4.2）で開く再生リスト選択モーダル。
 * 公開再生リスト全件をクライアント取得し（`/playlists` と同じ簡易実装方針）、キーワード（タイトル・ゲーム名・
 * チャンネル名の部分一致）で絞り込む。自分のマイリストにある再生リストを先頭に並べる。
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchPublicPlaylists, type PlaylistSummary } from '@/components/playlists/PlaylistGrid';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { CheckIcon, PlusIcon } from '@/components/ui/icons';
import type { CollectionPlaylist } from '@/lib/collections';

const MAX_RESULTS = 50;

export function toCollectionPlaylist(p: PlaylistSummary): CollectionPlaylist {
  return {
    id: p.id,
    title: p.title,
    thumbnailUrl: p.thumbnailUrl,
    videoCount: p.videoCount,
    gameId: p.gameId,
    gameName: p.gameName,
    score: p.score,
  };
}

export function PlaylistPickerModal({
  open,
  onOpenChange,
  selectedIds,
  disabled,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  /** 上限に達しているなど、これ以上追加できない */
  disabled: boolean;
  onPick: (playlist: CollectionPlaylist) => void;
}) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [mylistIds, setMylistIds] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');

  // 開いたときに初めて取得する（フォームを開いただけでは全件取得しない）
  useEffect(() => {
    if (!open || playlists) return;
    fetchPublicPlaylists().then(setPlaylists);
  }, [open, playlists]);

  useEffect(() => {
    if (!open || !user) return;
    getDocs(query(collection(db, 'mylist'), where('userId', '==', user.uid))).then((snap) =>
      setMylistIds(new Set(snap.docs.map((d) => d.data().playlistId as string))),
    );
  }, [open, user]);

  const results = useMemo(() => {
    if (!playlists) return [];
    const kw = keyword.trim().toLowerCase();
    const matched = kw
      ? playlists.filter((p) => [p.title, p.gameName, p.channelName].some((s) => s.toLowerCase().includes(kw)))
      : playlists;
    return [...matched].sort((a, b) => Number(mylistIds.has(b.id)) - Number(mylistIds.has(a.id)) || b.registeredAt - a.registeredAt);
  }, [playlists, keyword, mylistIds]);

  const selected = new Set(selectedIds);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="再生リストを追加する" maxWidthClassName="max-w-[640px]">
      <div className="flex flex-col gap-4">
        <Input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="タイトル・ゲーム名・チャンネル名で絞り込む"
          aria-label="再生リストを絞り込む"
        />
        {disabled && <p className="text-md text-text-muted">再生リストは最大10件までです</p>}
        {!playlists ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-base text-text-muted">該当する再生リストがありません</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {results.slice(0, MAX_RESULTS).map((p) => {
              const isSelected = selected.has(p.id);
              return (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="relative block aspect-video w-[96px] shrink-0 overflow-hidden rounded-[6px] bg-bg-player">
                    {p.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                    <p className="line-clamp-2 text-base text-text-primary">{p.title}</p>
                    <p className="truncate text-sm text-text-muted">
                      {mylistIds.has(p.id) && <span className="mr-2 text-text-tertiary">マイリスト</span>}
                      {p.gameName || p.channelName}
                    </p>
                  </div>
                  {isSelected ? (
                    <span className="inline-flex shrink-0 items-center gap-1 px-2 text-md text-text-muted">
                      <CheckIcon size={13} />
                      追加済み
                    </span>
                  ) : (
                    <Button variant="secondary" size="sm" className="shrink-0" disabled={disabled} onClick={() => onPick(toCollectionPlaylist(p))}>
                      <PlusIcon size={13} />
                      追加
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {results.length > MAX_RESULTS && (
          <p className="text-md text-text-muted">
            {results.length}件中{MAX_RESULTS}件を表示しています。キーワードで絞り込んでください
          </p>
        )}
      </div>
    </Modal>
  );
}
