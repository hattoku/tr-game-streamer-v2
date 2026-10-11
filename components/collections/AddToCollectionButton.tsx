/**
 * 「まとめに追加する」ボタン＋ダイアログ（まとめ機能仕様書 §4.1）。
 * 再生リスト詳細ページの視聴記録カード（components/reviews/ReviewForm.tsx）とマイリストページのカード
 * （components/mylist/MylistCard.tsx）に置く。ダイアログでは自分のまとめごとのチェックボックスで
 * その場で追加・解除し（保存ボタンは無い）、「新しいまとめを作る」でこの再生リスト入りの作成フォームへ移る。
 * 再生リストは1件以上必須のため、この再生リストだけが入っているまとめからは外せない。
 */
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LoginRequiredModal } from '@/components/layout/LoginRequiredModal';
import { Button, LinkButton, type ButtonSize } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { InventoryIcon, PlusIcon } from '@/components/ui/icons';
import {
  COLLECTION_PLAYLISTS_MAX,
  COLLECTIONS_PER_USER_MAX,
  CollectionApiError,
  VISIBILITY_LABEL,
  callCollectionsApi,
  fetchMyCollections,
  type CollectionData,
} from '@/lib/collections';

export function AddToCollectionButton({
  playlistId,
  size = 'sm',
  label = 'まとめに追加する',
  className,
}: {
  playlistId: string;
  size?: ButtonSize;
  label?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <Button variant="secondary" size={size} className={className} onClick={() => (user ? setOpen(true) : setLoginOpen(true))}>
        <InventoryIcon size={13} />
        {label}
      </Button>
      {user && <AddToCollectionModal open={open} onOpenChange={setOpen} playlistId={playlistId} uid={user.uid} />}
      <LoginRequiredModal open={loginOpen} onOpenChange={setLoginOpen} title="まとめを作るにはアカウントが必要です" />
    </>
  );
}

function AddToCollectionModal({
  open,
  onOpenChange,
  playlistId,
  uid,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playlistId: string;
  uid: string;
}) {
  const { toast } = useToast();
  const [collections, setCollections] = useState<CollectionData[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // 開くたびに取り直す（別タブ・別ページでの編集を反映するため）
  useEffect(() => {
    if (!open) return;
    fetchMyCollections(uid).then(setCollections);
  }, [open, uid]);

  async function toggle(c: CollectionData, add: boolean) {
    setBusyId(c.id);
    try {
      const { playlistIds } = await callCollectionsApi<{ playlistIds: string[] }>(
        `/api/collections/${encodeURIComponent(c.id)}`,
        'PATCH',
        add ? { addPlaylistId: playlistId } : { removePlaylistId: playlistId },
      );
      setCollections((prev) => prev?.map((x) => (x.id === c.id ? { ...x, playlistIds } : x)) ?? null);
      toast({ type: 'success', message: add ? `「${c.title}」に追加しました` : `「${c.title}」から外しました` });
    } catch (e) {
      toast({ type: 'error', message: e instanceof CollectionApiError ? e.message : '保存に失敗しました' });
    } finally {
      setBusyId(null);
    }
  }

  const atLimit = (collections?.length ?? 0) >= COLLECTIONS_PER_USER_MAX;

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="まとめに追加する">
      <div className="flex flex-col gap-4">
        {!collections ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : collections.length === 0 ? (
          <p className="text-base text-text-secondary">まだまとめがありません。新しいまとめを作って、この再生リストを入れましょう。</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {collections.map((c) => {
              const included = c.playlistIds.includes(playlistId);
              const lockedIn = included && c.playlistIds.length <= 1;
              const full = !included && c.playlistIds.length >= COLLECTION_PLAYLISTS_MAX;
              const note = lockedIn ? 'この再生リストのみのため外せません' : full ? `${COLLECTION_PLAYLISTS_MAX}件に達しています` : null;
              return (
                <li key={c.id}>
                  {/* 共通 Checkbox（Input.tsx）はラベル1行の簡易版のため、行全体のホバー・2行テキスト・スピナーを持つ独自の行にしている */}
                  <label className="flex cursor-pointer items-center gap-3 rounded-[8px] px-2 py-2 hover:bg-bg-hover has-disabled:cursor-default has-disabled:hover:bg-transparent">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={included}
                      disabled={busyId != null || lockedIn || full}
                      onChange={(e) => toggle(c, e.target.checked)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-base text-text-primary">{c.title}</span>
                      <span className="text-sm text-text-muted">
                        {VISIBILITY_LABEL[c.visibility]}・{c.playlistIds.length}件{note && `（${note}）`}
                      </span>
                    </span>
                    {busyId === c.id && <Spinner size={14} />}
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col gap-2 border-t border-border-divider pt-4">
          {atLimit ? (
            <>
              <Button variant="secondary" disabled className="self-start">
                <PlusIcon size={13} />
                新しいまとめを作る
              </Button>
              <p className="text-md text-text-muted">作成できるまとめは{COLLECTIONS_PER_USER_MAX}件までです</p>
            </>
          ) : (
            <LinkButton href={`/collections/new?playlistId=${encodeURIComponent(playlistId)}`} variant="secondary" className="self-start">
              <PlusIcon size={13} />
              新しいまとめを作る
            </LinkButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
