'use client';

/**
 * 自動掲載の確認画面で、再生リストに付いているゲームの中身を確かめるモーダル（収集候補レビューUI仕様書 §8.3、v3.6）。
 * ゲームの欄のパッケージ画像・ゲーム名を押すと開く。特に「楽天ブックスのどの商品が選ばれているか」を確認できるよう、
 * 楽天ブックスの商品ページ（games.rakutenUrl。アフィリエイトを付けない元のURL）を別タブで開くリンクを出す。
 * ゲームの内容は開くたびに games/{gameId} から読む（一覧に持っているのは名前と画像だけのため）。
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { packageImageSrc } from '@/lib/package-image';
import { Modal } from '@/components/ui/Modal';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ExternalLinkIcon, InventoryIcon } from '@/components/ui/icons';

interface LinkedGame {
  title: string;
  aliases: string[];
  packageImageUrl: string | null;
  rakutenUrl: string | null;
  platforms: string[];
  genreName: string | null;
  playlistCount: number;
}

export function LinkedGameModal({ gameId, onOpenChange }: { gameId: string | null; onOpenChange: (open: boolean) => void }) {
  // 読み込んだゲームを gameId ごとに持つ（別のゲームを開いたときに前の内容を出さない）
  const [loaded, setLoaded] = useState<{ id: string; game: LinkedGame | null } | null>(null);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    getDoc(doc(db, 'games', gameId))
      .then((snap) => {
        if (cancelled) return;
        const d = snap.data();
        setLoaded({
          id: gameId,
          game: d
            ? {
                title: (d.title as string) ?? '',
                aliases: (d.aliases as string[] | undefined) ?? [],
                packageImageUrl: (d.packageImageUrl as string | null) ?? null,
                rakutenUrl: (d.rakutenUrl as string | null) ?? null,
                platforms: (d.platforms as string[] | undefined) ?? [],
                genreName: (d.genreName as string | null) ?? null,
                playlistCount: (d.playlistCount as number | undefined) ?? 0,
              }
            : null,
        });
      })
      .catch(() => !cancelled && setLoaded({ id: gameId, game: null }));
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  const current = loaded && loaded.id === gameId ? loaded : null;
  const game = current?.game ?? null;

  return (
    <Modal open={gameId !== null} onOpenChange={onOpenChange} title="付いているゲーム" maxWidthClassName="max-w-[560px]">
      {!current ? (
        <SkeletonText lines={4} />
      ) : !game ? (
        <p className="text-md text-text-tertiary">ゲームの情報を読み込めませんでした（削除された可能性があります）。</p>
      ) : (
        <div className="flex gap-4">
          <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-[10px] bg-bg-btn">
            {game.packageImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={packageImageSrc(game.packageImageUrl, 'card')} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-text-muted">
                <InventoryIcon size={28} />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-md">
            <p className="text-lg font-medium text-text-primary">{game.title}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
              {game.aliases.length > 0 && (
                <>
                  <dt className="text-text-tertiary">別名</dt>
                  <dd className="text-text-secondary">{game.aliases.join('、')}</dd>
                </>
              )}
              <dt className="text-text-tertiary">機種</dt>
              <dd className="text-text-secondary">{game.platforms.length > 0 ? game.platforms.join('、') : '未設定'}</dd>
              <dt className="text-text-tertiary">ジャンル</dt>
              <dd className="text-text-secondary">{game.genreName ?? '未設定'}</dd>
              <dt className="text-text-tertiary">掲載中</dt>
              <dd className="text-text-secondary">{game.playlistCount}件の再生リスト</dd>
              <dt className="text-text-tertiary">楽天ブックス</dt>
              <dd className="min-w-0">
                {game.rakutenUrl ? (
                  <a
                    href={game.rakutenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 break-all text-text-secondary underline underline-offset-[3px] hover:text-text-primary"
                  >
                    選ばれている商品のページを開く
                    <ExternalLinkIcon size={12} className="shrink-0" />
                  </a>
                ) : (
                  <span className="text-text-tertiary">商品は選ばれていません（名前だけで登録）</span>
                )}
              </dd>
            </dl>
            <Link
              href={`/games/${encodeURIComponent(gameId!)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1 text-text-tertiary underline underline-offset-[3px] hover:text-text-primary"
            >
              ゲームタイトル詳細を開く（編集はこちら）
              <ExternalLinkIcon size={12} />
            </Link>
          </div>
        </div>
      )}
    </Modal>
  );
}
