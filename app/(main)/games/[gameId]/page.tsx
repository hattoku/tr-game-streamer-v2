/**
 * ゲームタイトル詳細ページ（ページ ゲームタイトル 詳細仕様書）。
 * 1カラム構成。ゲームタイトルセクション（PCはパッケージ/基本情報の2カラム）＋
 * 関連する再生リストセクション（components/games/GamePlaylistSection.tsx）。
 *
 * スコープ外（フェーズ3ステップ2時点）:
 * - 「情報を編集ボタン」（第7章の管理者編集フロー・審査ワークフロー経由の一般ユーザー提案）は
 *   審査ワークフロー自体が未実装のため非表示にする（フェーズ2.5でパスワード再発行リンク等を
 *   「未実装機能は置かない」方針で省略した前例に合わせる。フェーズ3計画参照）
 */
'use client';

import { useEffect, useState } from 'react';
import { notFound, useParams } from 'next/navigation';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchTagsMap, resolveTags, type ResolvedTag } from '@/lib/tags';
import { fetchPlaylistsByGame } from '@/components/playlists/PlaylistGrid';
import { GamePlaylistSection } from '@/components/games/GamePlaylistSection';
import { TagEditModal } from '@/components/tags/TagEditModal';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { ExternalLinkButton } from '@/components/ui/Button';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { InventoryIcon, LockIcon, PencilIcon, PlayIcon } from '@/components/ui/icons';

interface GameDetail {
  title: string;
  packageImageUrl: string | null;
  rakutenUrl: string | null;
  description: string | null;
  isAiGeneratedDescription: boolean;
  genreName: string;
  themeIds: string[];
  playlistCount: number;
}

export default function GameDetailPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();

  const [game, setGame] = useState<GameDetail | null>(null);
  const [themeNames, setThemeNames] = useState<string[]>([]);
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);
  const [tags, setTags] = useState<ResolvedTag[]>([]);
  const [tagModalOpen, setTagModalOpen] = useState(false);

  useEffect(() => {
    if (!gameId) return;
    (async () => {
      const [gameSnap, themesSnap, playlists] = await Promise.all([
        getDoc(doc(db, 'games', gameId)),
        getDocs(collection(db, 'themes')),
        fetchPlaylistsByGame(gameId),
      ]);

      if (!gameSnap.exists()) {
        setMissing(true);
        return;
      }
      const data = gameSnap.data();
      const themeIds: string[] = data.themeIds ?? [];
      const themeNameById = new Map(themesSnap.docs.map((d) => [d.id, (d.data().name as string) ?? '']));

      setGame({
        title: data.title ?? '',
        packageImageUrl: data.packageImageUrl ?? null,
        rakutenUrl: data.rakutenUrl ?? null,
        description: data.description ?? null,
        isAiGeneratedDescription: data.isAiGeneratedDescription ?? false,
        genreName: data.genreName ?? '',
        themeIds,
        playlistCount: data.playlistCount ?? 0,
      });
      setThemeNames(themeIds.map((id) => themeNameById.get(id)).filter((n): n is string => !!n));
      setVideoCount(playlists.reduce((sum, p) => sum + p.videoCount, 0));
    })();
  }, [gameId]);

  // タグはタグ編集（app/api/tags/attach・detach）のたびにサーバー側で更新されるため、
  // 操作直後に画面へ反映されるよう別途購読する（再生リスト詳細ページと同じ方針）
  useEffect(() => {
    if (!gameId) return;
    return onSnapshot(doc(db, 'games', gameId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      fetchTagsMap().then((tagsMap) => setTags(resolveTags(data.gameTagIds ?? [], data.gameTagsFixed ?? [], tagsMap)));
    });
  }, [gameId]);

  if (missing) notFound();

  if (!game) {
    return (
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-4">
          <Skeleton className="h-8 w-2/3" />
          <div className="flex gap-4">
            <Skeleton className="aspect-[3/4] w-[160px] shrink-0 rounded-[8px]" />
            <SkeletonText lines={5} className="flex-1" />
          </div>
        </Card>
      </div>
    );
  }

  const packageArea = (
    <div className="flex w-full flex-col gap-3 sm:w-[200px] sm:shrink-0">
      <div className="aspect-[3/4] w-full overflow-hidden rounded-[10px] bg-bg-btn">
        {game.packageImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.packageImageUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-text-muted">
            <InventoryIcon size={40} />
          </div>
        )}
      </div>
      {game.rakutenUrl && (
        <ExternalLinkButton href={game.rakutenUrl} variant="rakuten" size="sm">
          楽天ブックスで見る ↗
        </ExternalLinkButton>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4">
        <h1 className="text-2xl font-medium text-text-primary">{game.title}</h1>
        <div className="border-t border-border-divider pt-4 sm:flex sm:gap-6">
          {packageArea}
          <div className="mt-4 flex flex-1 flex-col gap-2 sm:mt-0">
            {game.genreName && (
              <p className="text-base text-text-secondary">
                ジャンル：<span className="text-text-primary">{game.genreName}</span>
              </p>
            )}
            {themeNames.length > 0 && (
              <p className="text-base text-text-secondary">
                テーマ：<span className="text-text-primary">{themeNames.join(' / ')}</span>
              </p>
            )}
            <div className="mt-1 flex items-center gap-3 text-md text-text-tertiary">
              <span className="inline-flex items-center gap-1">
                <InventoryIcon size={14} />
                {game.playlistCount.toLocaleString()} 再生リスト
              </span>
              <span className="inline-flex items-center gap-1">
                <PlayIcon size={12} />
                {(videoCount ?? 0).toLocaleString()} 動画
              </span>
            </div>
            {(tags.length > 0 || user) && (
              <div className="flex flex-wrap items-center gap-[6px]">
                {tags.map((t) =>
                  t.fixed ? (
                    <span key={t.id} className="inline-flex items-center gap-1 text-sm text-text-secondary">
                      <LockIcon size={11} />
                      {t.name}
                    </span>
                  ) : (
                    <Tag key={t.id} href={`/games?tag=${encodeURIComponent(t.id)}`}>
                      {t.name}
                    </Tag>
                  ),
                )}
                {user && (
                  <button
                    type="button"
                    aria-label="タグを編集する"
                    onClick={() => setTagModalOpen(true)}
                    className="rounded-[6px] p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                  >
                    <PencilIcon size={13} />
                  </button>
                )}
              </div>
            )}
            {game.description && (
              <div className="mt-1 flex flex-col gap-1">
                <p className="text-base text-text-secondary">{game.description}</p>
                {game.isAiGeneratedDescription && (
                  <span
                    title="AIによる生成のため、誤りを含む可能性があります"
                    className="inline-flex w-fit items-center rounded-[4px] bg-bg-hover px-2 py-[2px] text-sm text-text-muted"
                  >
                    AIによる生成
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <GamePlaylistSection gameId={gameId} />

      <TagEditModal open={tagModalOpen} onOpenChange={setTagModalOpen} targetType="game" targetId={gameId} tags={tags} />
    </div>
  );
}
