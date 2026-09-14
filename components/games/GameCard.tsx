/**
 * ゲームタイトルカード（ページ ゲームタイトル 探す仕様書 §3.2〜§3.5）。
 * パッケージ画像（縦長3:4、未取得時はプレースホルダー）を左、情報を右に配置する横並びレイアウト。
 * タグは表示優先順位（固定→登録日順）で最大3件+「+N」、絞り込み中のタグは太字で強調する。
 */
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { InventoryIcon, PlayIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';
import type { ResolvedTag } from '@/lib/tags';

const MAX_VISIBLE_TAGS = 3;

export interface GameCardData {
  id: string;
  title: string;
  packageImageUrl: string | null;
  genreName: string;
  playlistCount: number;
  videoCount: number;
  tags: ResolvedTag[];
}

export function GameCard({ game, highlightTagIds }: { game: GameCardData; highlightTagIds?: Set<string> }) {
  const visibleTags = game.tags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenCount = game.tags.length - visibleTags.length;

  return (
    <Link href={`/games/${game.id}`} className="group block h-full">
      <Card interactive className="flex h-full gap-3">
        <div className="aspect-[3/4] w-[88px] shrink-0 overflow-hidden rounded-[8px] bg-bg-btn">
          {game.packageImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.packageImageUrl} alt="" className="size-full object-cover" loading="lazy" />
          ) : (
            <div className="flex size-full items-center justify-center text-text-muted">
              <InventoryIcon size={28} />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="line-clamp-2 text-lg font-medium leading-snug text-text-primary">{game.title}</p>
          {game.genreName && <p className="text-md text-text-tertiary">{game.genreName}</p>}
          <div className="flex items-center gap-3 text-md text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <InventoryIcon size={13} />
              {game.playlistCount.toLocaleString()} 再生リスト
            </span>
            <span className="inline-flex items-center gap-1">
              <PlayIcon size={11} />
              {game.videoCount.toLocaleString()} 動画
            </span>
          </div>
          {visibleTags.length > 0 && (
            <div className="flex flex-wrap gap-[6px]">
              {visibleTags.map((t) => (
                <Tag key={t.id} className={cn(highlightTagIds?.has(t.id) && 'font-bold text-text-primary')}>
                  {t.name}
                </Tag>
              ))}
              {hiddenCount > 0 && <Tag>+{hiddenCount}</Tag>}
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}
