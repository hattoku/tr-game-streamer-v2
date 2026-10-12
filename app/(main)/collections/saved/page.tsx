/**
 * 保存したまとめ一覧（/collections/saved、まとめ機能仕様書 §8.4）。
 * 自分が保存したまとめ（公開・限定公開）を保存日時の降順で、まとめカード（§6.3）＋20件ページングで表示する。
 * 入口はユーザーメニューと「まとめを探す」の見出し横（仕様 §8.3 のヘッダーリンクは置かない。2026-10-12 ユーザー決定）。
 * 作成者が非公開にしたまとめは「閲覧できなくなったまとめ」として残し、保存を解除できるようにする
 * （削除されたまとめはまとめ削除APIが保存記録ごと消すため出てこない）。取得は API 経由（lib/collections.ts の fetchSavedCollections）。
 * 未ログインはログインページへ。
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { CollectionCard } from '@/components/collections/CollectionCard';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, SectionHeading } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { AlertIcon, FavoriteIcon, LockIcon } from '@/components/ui/icons';
import {
  CollectionApiError,
  collectionThumbnails,
  fetchCollectionPlaylists,
  fetchSavedCollections,
  setCollectionSaved,
  type SavedCollectionItem,
} from '@/lib/collections';

const PAGE_SIZE = 20;

export default function SavedCollectionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [items, setItems] = useState<SavedCollectionItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [thumbnailById, setThumbnailById] = useState<Map<string, string>>(new Map());
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const list = await fetchSavedCollections();
        setItems(list);
        const ids = [...new Set(list.flatMap((i) => i.collection?.playlistIds.slice(0, 3) ?? []))];
        const playlists = await fetchCollectionPlaylists(ids);
        setThumbnailById(new Map(playlists.map((p) => [p.id, p.thumbnailUrl])));
      } catch {
        setLoadError(true);
      }
    })();
  }, [user]);

  async function unsave(item: SavedCollectionItem) {
    if (busyId) return;
    setBusyId(item.collectionId);
    try {
      await setCollectionSaved(item.collectionId, false);
      setItems((prev) => prev?.filter((i) => i.collectionId !== item.collectionId) ?? null);
      toast({ type: 'success', message: '保存を解除しました' });
    } catch (e) {
      toast({ type: 'error', message: e instanceof CollectionApiError ? e.message : '保存の解除に失敗しました' });
    } finally {
      setBusyId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil((items?.length ?? 0) / PAGE_SIZE));
  // 解除で件数が減って今のページが無くなったら最終ページへ寄せる
  const currentPage = Math.min(page, pageCount);
  const pageItems = items?.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE) ?? [];

  const unsaveButton = (item: SavedCollectionItem) => (
    <Button variant="ghost" size="sm" disabled={busyId != null} onClick={() => unsave(item)} aria-label={`「${item.collectionTitle}」の保存を解除`}>
      <FavoriteIcon size={13} fill="currentColor" />
      保存を解除
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionHeading>保存したまとめ</SectionHeading>
        {items && items.length > 0 && <span className="text-md text-text-muted">{items.length}件（保存した順）</span>}
      </div>

      {loadError ? (
        <EmptyState
          icon={<AlertIcon />}
          title="保存したまとめを読み込めませんでした"
          description="通信状況を確認して、ページを再読み込みしてください"
          action={
            <Button variant="secondary" onClick={() => window.location.reload()}>
              再読み込み
            </Button>
          }
        />
      ) : !items ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <SkeletonText lines={4} />
            </Card>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FavoriteIcon />}
          title="保存したまとめはまだありません"
          description="気になるまとめを開いて「まとめを保存する」を押すと、ここにまとまります"
          action={
            <LinkButton href="/collections" variant="primary">
              まとめを探す
            </LinkButton>
          }
        />
      ) : (
        <>
          <ol className="flex flex-col gap-4">
            {pageItems.map((item) => (
              <li key={item.collectionId}>
                {item.collection ? (
                  <CollectionCard
                    collection={item.collection}
                    thumbnails={collectionThumbnails(item.collection, thumbnailById)}
                    actions={unsaveButton(item)}
                  />
                ) : (
                  // 作成者が非公開にしたまとめ。公開・限定公開に戻れば再び通常のカードで出る
                  <Card className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      <LockIcon size={14} className="mt-1 shrink-0 text-text-muted" />
                      <div className="flex min-w-0 flex-col gap-1">
                        <p className="break-words text-base text-text-secondary">「{item.collectionTitle}」</p>
                        <p className="text-md text-text-muted">作成者が非公開にしたため、閲覧できなくなりました</p>
                      </div>
                    </div>
                    {unsaveButton(item)}
                  </Card>
                )}
              </li>
            ))}
          </ol>
          <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
