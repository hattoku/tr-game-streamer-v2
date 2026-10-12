/**
 * まとめ詳細ページ（ページ 再生リスト まとめ機能仕様書 §5）。
 * ヘッダー情報エリア（タイトル／作成者名・作成日／説明文／編集ボタン）＋ 再生リストカードの縦並び。
 * 各カードには作成者の視聴ステータスとレビューコメントを添え、ネタバレコメントはまとめのネタバレ設定
 * （showSpoiler）に従って折りたたむ（§3.5。折りたたみ時はレビュー一覧と同じ「ネタバレを含みます。表示する」）。
 *
 * - 閲覧可否（§2.2）は firestore.rules に任せる。非公開まとめを本人以外が開くと読み取りが拒否されるため、
 *   存在しない場合と同じく 404 にする（非公開まとめの存在を明かさない）。
 * - 作成者名はプロフィールページ（フェーズ6ステップ5）が未実装のためリンクにしない。
 * - 保存ボタン（§5.2・§8.2）はログイン済みの作成者以外に、作成者の編集ボタンと同じ位置（タイトル行の右）に出す。
 *   保存数はメタ情報の行に ♡ N で出す（onSnapshot で購読しているため保存・解除がすぐ反映される）。
 * - 作成者本人には公開設定を表示する（自分のまとめがどの範囲に見えているかを確認できるように）。
 */
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatar } from '@/components/layout/UserDropdown';
import { Card, THUMBNAIL_HOVER_IMG_CLASS } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { CountLabel } from '@/components/ui/Badge';
import { StatusChip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { FavoriteIcon, InventoryIcon, PencilIcon, StarIcon } from '@/components/ui/icons';
import { VisibilityBadge } from '@/components/collections/VisibilityBadge';
import { SaveCollectionButton } from '@/components/collections/SaveCollectionButton';
import { cn } from '@/components/ui/cn';
import {
  fetchCollectionPlaylists,
  fetchCreatorReviews,
  formatCollectionDate,
  toCollectionData,
  type CollectionData,
  type CollectionPlaylist,
  type CreatorReview,
} from '@/lib/collections';

export default function CollectionDetailPage() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const { user, loading } = useAuth();
  const [collection, setCollection] = useState<CollectionData | null>(null);
  const [missing, setMissing] = useState(false);
  const [playlists, setPlaylists] = useState<CollectionPlaylist[] | null>(null);
  const [reviews, setReviews] = useState<Map<string, CreatorReview>>(new Map());

  // ログイン状態が確定する前に読むと非公開まとめは本人でも拒否されるため、確定を待ってから購読する
  useEffect(() => {
    if (!collectionId || loading) return;
    return onSnapshot(
      doc(db, 'collections', collectionId),
      (snap) => {
        if (!snap.exists()) {
          setMissing(true);
          return;
        }
        setMissing(false);
        setCollection(toCollectionData(snap));
      },
      () => setMissing(true),
    );
  }, [collectionId, user, loading]);

  const playlistKey = collection ? `${collection.userId}:${collection.playlistIds.join(',')}` : '';
  useEffect(() => {
    if (!collection) return;
    const { userId, playlistIds } = collection;
    Promise.all([fetchCollectionPlaylists(playlistIds), fetchCreatorReviews(userId, playlistIds)]).then(([p, r]) => {
      setPlaylists(p);
      setReviews(r);
    });
    // collection オブジェクトは onSnapshot のたびに作り直されるため、再取得は再生リストの構成が変わったときだけにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistKey]);

  if (missing) notFound();

  if (!collection) {
    return (
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <Card>
          <SkeletonText lines={3} />
        </Card>
        <Skeleton className="h-[140px] w-full rounded-[12px]" />
      </div>
    );
  }

  const isOwner = user?.uid === collection.userId;

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      {/* ヘッダー情報エリア（§5.2） */}
      {/* 縦積みで間延びしないよう、タイトル行に編集ボタン、メタ情報（作成者・作成日・件数・公開設定）を1行にまとめる */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 break-words text-2xl font-medium text-text-primary">{collection.title}</h1>
          {isOwner && (
            <LinkButton href={`/collections/${collectionId}/edit`} variant="secondary" size="sm" className="shrink-0">
              <PencilIcon size={13} />
              編集
            </LinkButton>
          )}
          {user && !isOwner && <SaveCollectionButton collectionId={collectionId} className="shrink-0" />}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-md text-text-muted">
          <span className="inline-flex min-w-0 items-center gap-2">
            <UserAvatar name={collection.userDisplayName} imageUrl={collection.userProfileImageUrl} size={20} />
            <span className="truncate text-text-secondary">{collection.userDisplayName}</span>
          </span>
          {/* 何の日付か分かるよう「作成」を付け、後日編集されていれば更新日も添える（レビュー一覧と同じ表記） */}
          <span>
            {formatCollectionDate(collection.createdAt)} 作成
            {collection.updatedAt &&
              formatCollectionDate(collection.updatedAt) !== formatCollectionDate(collection.createdAt) &&
              `（${formatCollectionDate(collection.updatedAt)} 更新）`}
          </span>
          <span className="inline-flex items-center gap-1" aria-label={`保存数 ${collection.savedCount}`}>
            <FavoriteIcon size={13} />
            {collection.savedCount.toLocaleString()}
          </span>
          {isOwner && <VisibilityBadge visibility={collection.visibility} />}
        </div>
        {collection.description && <CollectionDescription text={collection.description} />}
      </Card>

      {/* 件数はヘッダーカードではなく一覧の見出しに置く（一覧の中身を数えた値なので、読めない再生リストは含めない） */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xl font-medium text-text-primary">このまとめの再生リスト</h2>
          {playlists && <span className="text-md text-text-muted">{playlists.length}件</span>}
        </div>
        {!playlists ? (
          <Skeleton className="h-[140px] w-full rounded-[12px]" />
        ) : playlists.length === 0 ? (
          <EmptyState icon={<InventoryIcon />} title="表示できる再生リストがありません" />
        ) : (
          <ol className="flex flex-col gap-4">
            {playlists.map((p) => (
              <li key={p.id}>
                <CollectionPlaylistCard playlist={p} review={reviews.get(p.id) ?? null} showSpoiler={collection.showSpoiler} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

const DESCRIPTION_COLLAPSE_LENGTH = 120;
const DESCRIPTION_COLLAPSE_LINES = 3;

/**
 * 説明文（§5.2）。最大500文字あり縦に長くなるため、長い場合は3行で折りたたみ「続きを読む」で展開する
 * （再生リスト一覧までの距離を詰めるため）。
 */
function CollectionDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const collapsible = text.length > DESCRIPTION_COLLAPSE_LENGTH || text.split('\n').length > DESCRIPTION_COLLAPSE_LINES;
  return (
    <div className="flex flex-col items-start gap-1 border-t border-border-divider pt-3">
      <p className={cn('whitespace-pre-wrap break-words text-base text-text-secondary', collapsible && !expanded && 'line-clamp-3')}>{text}</p>
      {collapsible && (
        <button type="button" onClick={() => setExpanded((v) => !v)} className="text-md text-text-muted hover:text-text-primary">
          {expanded ? '閉じる' : '続きを読む'}
        </button>
      )}
    </div>
  );
}

/** 再生リストカード（§5.3）: サムネイル・タイトル・ゲーム名・スコア・作成者の視聴ステータス、その下にレビューコメント */
function CollectionPlaylistCard({
  playlist: p,
  review,
  showSpoiler,
}: {
  playlist: CollectionPlaylist;
  review: CreatorReview | null;
  showSpoiler: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const href = `/playlists/${p.id}`;
  const spoilerHidden = !!review?.comment && review.hasSpoiler && !showSpoiler && !revealed;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex gap-3 md:gap-[18px]">
        <Link href={href} className="group relative block w-[128px] shrink-0 overflow-hidden rounded-[8px] bg-bg-player md:w-[224px]">
          <span className="relative block aspect-video">
            {p.thumbnailUrl && (
              // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnailUrl} alt="" className={cn('absolute inset-0 size-full object-cover', THUMBNAIL_HOVER_IMG_CLASS)} loading="lazy" />
            )}
          </span>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
          <CountLabel className="absolute bottom-2 right-2">{p.videoCount}話</CountLabel>
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-[6px] md:gap-[10px]">
          <Link href={href} className="line-clamp-2 text-base font-semibold leading-snug text-text-primary hover:text-text-secondary md:text-xl">
            {p.title}
          </Link>
          {p.gameName &&
            (p.gameId ? (
              <Link href={`/games/${p.gameId}`} className="truncate text-md text-text-tertiary hover:text-text-primary">
                {p.gameName}
              </Link>
            ) : (
              <span className="truncate text-md text-text-tertiary">{p.gameName}</span>
            ))}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1 text-md">
              <StarIcon size={13} className="text-brand-score" />
              {p.score == null ? <span className="text-text-muted">評価なし</span> : <span className="font-semibold text-text-primary">{p.score.toFixed(1)}</span>}
            </span>
            {review?.watchStatus && <StatusChip status={review.watchStatus} readOnly />}
          </div>
        </div>
      </div>

      {review?.comment &&
        (spoilerHidden ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="self-start rounded-[8px] border border-border-chip bg-bg-input px-3 py-2 text-base text-text-muted hover:text-text-primary"
          >
            ネタバレを含みます。表示する
          </button>
        ) : (
          <p className="whitespace-pre-wrap break-words border-t border-border-divider pt-4 text-base text-text-secondary">{review.comment}</p>
        ))}
    </Card>
  );
}
