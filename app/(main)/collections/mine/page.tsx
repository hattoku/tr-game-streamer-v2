/**
 * 自分のまとめ一覧（まとめ機能仕様書 §4.1・§4.5・§4.6 の「まとめ管理画面」）。
 * プロフィールページ（フェーズ6ステップ5）が未実装の間の作成・編集・削除・並び替えの入口として
 * 2026-10-08 ユーザー決定で新設。プロフィールのまとめセクション実装後も管理画面として残す。
 * 公開設定を問わず自分のまとめを全件、手動並び替えの設定順（未設定は作成日時の降順）で表示する。
 * 並び替えは ↑↓ボタンのみ（§4.5 のドラッグ＆ドロップは見送り）。
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { Button, LinkButton } from '@/components/ui/Button';
import { SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ChevronDownIcon, ChevronUpIcon, InventoryIcon, PencilIcon, PlusIcon, TrashIcon } from '@/components/ui/icons';
import { VisibilityBadge } from '@/components/collections/VisibilityBadge';
import {
  COLLECTIONS_PER_USER_MAX,
  CollectionApiError,
  callCollectionsApi,
  fetchCollectionPlaylists,
  fetchMyCollections,
  type CollectionData,
} from '@/lib/collections';

export default function MyCollectionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [collections, setCollections] = useState<CollectionData[] | null>(null);
  const [thumbnails, setThumbnails] = useState<Map<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  // 閉じるアニメーション中も本文を出し続けるため、対象は閉じても null に戻さない（マイリスト削除と同じ）
  const [deleteTarget, setDeleteTarget] = useState<CollectionData | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const list = await fetchMyCollections(user.uid);
      setCollections(list);
      const ids = [...new Set(list.flatMap((c) => c.playlistIds.slice(0, 3)))];
      const playlists = await fetchCollectionPlaylists(ids);
      setThumbnails(new Map(playlists.map((p) => [p.id, p.thumbnailUrl])));
    })();
  }, [user]);

  async function move(index: number, delta: -1 | 1) {
    if (!collections || busy) return;
    const prev = collections;
    const next = [...prev];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setCollections(next);
    setBusy(true);
    try {
      await callCollectionsApi('/api/collections/reorder', 'POST', { ids: next.map((c) => c.id) });
    } catch {
      setCollections(prev);
      toast({ type: 'error', message: '並び順を保存できませんでした。ページを再読み込みしてください' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await callCollectionsApi(`/api/collections/${encodeURIComponent(deleteTarget.id)}`, 'DELETE');
      setCollections((prev) => prev?.filter((c) => c.id !== deleteTarget.id) ?? null);
      setDeleteOpen(false);
      toast({ type: 'success', message: 'まとめを削除しました' });
    } catch (e) {
      toast({ type: 'error', message: e instanceof CollectionApiError ? e.message : '削除に失敗しました' });
    } finally {
      setBusy(false);
    }
  }

  const atLimit = (collections?.length ?? 0) >= COLLECTIONS_PER_USER_MAX;

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>自分のまとめ</SectionHeading>
        {collections && collections.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-md text-text-muted">
              {collections.length} / {COLLECTIONS_PER_USER_MAX}件
            </span>
            {atLimit ? (
              <Button variant="primary" size="sm" disabled>
                <PlusIcon size={13} />
                新しいまとめを作る
              </Button>
            ) : (
              <LinkButton href="/collections/new" variant="primary" size="sm">
                <PlusIcon size={13} />
                新しいまとめを作る
              </LinkButton>
            )}
          </div>
        )}
      </div>
      {atLimit && <p className="-mt-3 text-md text-text-muted">作成できるまとめは{COLLECTIONS_PER_USER_MAX}件までです。新しく作るには既存のまとめを削除してください</p>}

      {!collections ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-[200px] w-full rounded-[12px]" />
          <Skeleton className="h-[200px] w-full rounded-[12px]" />
        </div>
      ) : collections.length === 0 ? (
        <EmptyState
          icon={<InventoryIcon />}
          title="まだまとめがありません"
          description="お気に入りの再生リストを集めて、自分だけのまとめを作ってみましょう"
          action={
            <LinkButton href="/collections/new" variant="primary">
              <PlusIcon size={14} />
              新しいまとめを作る
            </LinkButton>
          }
        />
      ) : (
        <ol className="flex flex-col gap-4">
          {collections.map((c, i) => (
            <li key={c.id}>
              <CollectionCard
                collection={c}
                thumbnails={thumbnails ? c.playlistIds.slice(0, 3).map((id) => thumbnails.get(id) ?? '') : undefined}
                badge={<VisibilityBadge visibility={c.visibility} />}
                actions={
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" aria-label={`「${c.title}」を上へ移動`} disabled={busy || i === 0} onClick={() => move(i, -1)}>
                      <ChevronUpIcon size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`「${c.title}」を下へ移動`}
                      disabled={busy || i === collections.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ChevronDownIcon size={14} />
                    </Button>
                    <span aria-hidden className="mx-1 h-[18px] w-px bg-white/10" />
                    <LinkButton href={`/collections/${c.id}/edit`} variant="ghost" size="sm" aria-label={`「${c.title}」を編集`}>
                      <PencilIcon size={13} />
                      編集
                    </LinkButton>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`「${c.title}」を削除`}
                      disabled={busy}
                      onClick={() => {
                        setDeleteTarget(c);
                        setDeleteOpen(true);
                      }}
                    >
                      <TrashIcon size={13} />
                      削除
                    </Button>
                  </div>
                }
              />
            </li>
          ))}
        </ol>
      )}

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="このまとめを削除しますか？"
        description={deleteTarget ? `「${deleteTarget.title}」を削除します。削除すると元に戻せません。` : undefined}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={busy}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={handleDelete} loading={busy}>
            削除する
          </Button>
        </div>
      </Modal>
    </div>
  );
}
