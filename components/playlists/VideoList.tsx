/**
 * 再生リスト詳細の動画リスト（動画プレーヤー仕様書「動画リスト」「右カラム進捗バー表示」、
 * デザイントークン仕様書 §6.3, §6.4）。
 * - 各動画: サムネイル＋進捗バー／タイトル／尺。現在再生中は背景ハイライト＋▶アイコン＋「再生中」バッジ（§5.3）
 * - 話数「N話」表示（更新中の再生リストがあるため「全N話」とはしない。動画プレーヤー仕様書 v1.5）と
 *   逆順トグル（動画プレーヤー仕様書「逆順トグル」）
 * - 初期スクロール: 最後に視聴した動画がリスト上端に来るよう、リスト内でスクロール
 */
'use client';

import { useEffect, useRef } from 'react';
import { PlayingBadge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PlayIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

export interface VideoItem {
  id: string;
  youtubeVideoId: string;
  title: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

interface VideoListProps {
  videos: VideoItem[];
  currentIndex: number;
  /** youtubeVideoId → 視聴進捗% */
  progressByVideo: Record<string, number>;
  reverseOrder: boolean;
  reverseNote?: string;
  onReverseToggle: (value: boolean) => void;
  onSelect: (index: number) => void;
  className?: string;
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoList({ videos, currentIndex, progressByVideo, reverseOrder, reverseNote, onReverseToggle, onSelect, className }: VideoListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);

  // 現在の動画をリスト内の上端付近へスクロール（ページ全体は動かさない）
  useEffect(() => {
    const list = listRef.current;
    const item = itemRefs.current[currentIndex];
    if (!list || !item) return;
    list.scrollTo({ top: item.offsetTop - list.offsetTop, behavior: 'smooth' });
  }, [currentIndex, videos.length]);

  return (
    <Card flush className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-3">
        <CardTitle>
          動画リスト <span className="ml-1 text-md font-normal text-text-muted">{videos.length}話</span>
        </CardTitle>
        <Checkbox label="逆順" checked={reverseOrder} onChange={(e) => onReverseToggle(e.target.checked)} className="text-md" />
      </div>
      {reverseNote && <p className="px-[18px] pb-2 text-sm text-text-muted">{reverseNote}</p>}
      <ul ref={listRef} className="max-h-[520px] overflow-y-auto border-t border-border-divider md:max-h-[calc(100dvh-220px)]">
        {videos.map((video, index) => {
          const isCurrent = index === currentIndex;
          const percent = progressByVideo[video.youtubeVideoId];
          return (
            <li
              key={video.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={isCurrent ? 'true' : undefined}
                className={cn(
                  'flex w-full items-start gap-3 px-3 py-2 text-left transition-colors duration-[120ms] hover:bg-bg-list-active',
                  isCurrent && 'bg-bg-list-active',
                )}
              >
                <span className="w-7 shrink-0 pt-[2px] text-right text-xs text-text-faint">{index + 1}</span>
                <span className="relative w-[120px] shrink-0">
                  <span className="relative block aspect-video overflow-hidden rounded-[4px] bg-bg-player">
                    {video.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                    )}
                    {isCurrent && (
                      <>
                        <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                          <PlayIcon size={22} />
                        </span>
                        <PlayingBadge className="absolute left-1 top-1" />
                      </>
                    )}
                  </span>
                  {percent != null && <ProgressBar value={percent} className="mt-[2px]" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn('line-clamp-2 text-md leading-snug', isCurrent ? 'text-text-primary' : 'text-text-secondary')}>{video.title}</span>
                  <span className="mt-1 block text-sm text-text-faint">{formatDuration(video.durationSeconds)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
