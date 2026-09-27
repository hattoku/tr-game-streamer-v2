/**
 * 再生リスト詳細の動画リスト（動画プレーヤー仕様書「動画リスト」「右カラム進捗バー表示」、
 * デザイントークン仕様書 §6.3, §6.4）。
 * - 各動画: サムネイル＋進捗バー／タイトル／尺。現在再生中は背景ハイライト＋▶アイコン＋「再生中」バッジ（§5.3）
 * - 話数「N話」表示（更新中の再生リストがあるため「全N話」とはしない。動画プレーヤー仕様書 v1.5）と
 *   逆順トグル（動画プレーヤー仕様書「逆順トグル」）
 * - 初期スクロール: 最後に視聴した動画がリスト上端に来るよう、リスト内でスクロール
 * - ネタバレ対策: リストの高さは約3話分（現在の話＋次の2話）に抑え、下端をフェードさせる。
 *   フッターの「広げる」で従来の高さに広げ、「縮める」で約3話分に戻せる（状態は保存しない）。
 *   設定「先の話のサムネイルを隠す」がONの場合、hiddenThumbnailIds の話はサムネイルの代わりに
 *   話数のプレースホルダーを表示する（どの話を隠すかの判定は呼び出し側）
 * - リスト最下部（スクロール領域外）に参照元URL「YouTubeの再生リストを見る」リンク
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { PlayingBadge } from '@/components/ui/Badge';
import { Button, ExternalLinkButton } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Input';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { PlayIcon, YouTubeIcon } from '@/components/ui/icons';
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
  /** YouTubeの元の再生リストURL（リスト最下部のリンク） */
  referenceUrl: string;
  /** サムネイルを隠して話数のプレースホルダーにする動画の id（現在の話は対象でも隠さない） */
  hiddenThumbnailIds?: ReadonlySet<string>;
  className?: string;
}

// 縮めた状態で表示する行数。各行の高さは揃えてある（サムネ 67.5px ＋ 進捗バー枠 4px ＋ 上下余白 16px = 87.5px）
// ため、COLLAPSED_LIST_HEIGHT_CLASS はちょうど3行分（4行目がのぞかない高さ）になる。行の構成を変えたら合わせて直すこと
// （Tailwind の任意値クラスは静的に生成されるため、定数から計算して組み立てられない）
const COLLAPSED_ROWS = 3;
const COLLAPSED_LIST_HEIGHT_CLASS = 'max-h-[262.5px]';

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` : `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoList({
  videos,
  currentIndex,
  progressByVideo,
  reverseOrder,
  reverseNote,
  onReverseToggle,
  onSelect,
  referenceUrl,
  hiddenThumbnailIds,
  className,
}: VideoListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [expanded, setExpanded] = useState(false);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const collapsible = videos.length > COLLAPSED_ROWS;
  const showFade = collapsible && !expanded && !scrolledToEnd;

  // 現在の動画をリスト内の上端付近へスクロール（ページ全体は動かさない）。
  // 縮め直したときも現在の話が上端に戻るよう、expanded も deps に含める
  useEffect(() => {
    const list = listRef.current;
    const item = itemRefs.current[currentIndex];
    if (!list || !item) return;
    list.scrollTo({ top: item.offsetTop - list.offsetTop, behavior: 'smooth' });
  }, [currentIndex, videos.length, expanded]);

  // 末尾までスクロールしたら下端フェードを消す（最後の話が見づらくならないように）
  function handleScroll() {
    const list = listRef.current;
    if (!list) return;
    setScrolledToEnd(list.scrollTop + list.clientHeight >= list.scrollHeight - 1);
  }

  return (
    <Card flush className={cn('flex flex-col', className)}>
      <div className="flex items-center justify-between gap-3 px-[18px] pt-4 pb-3">
        <CardTitle>
          動画リスト <span className="ml-1 text-md font-normal text-text-muted">{videos.length}話</span>
        </CardTitle>
        <Checkbox label="逆順" checked={reverseOrder} onChange={(e) => onReverseToggle(e.target.checked)} className="text-md" />
      </div>
      {reverseNote && <p className="px-[18px] pb-2 text-sm text-text-muted">{reverseNote}</p>}
      <div className="relative border-t border-border-divider">
        <ul
          ref={listRef}
          onScroll={handleScroll}
          className={cn('overflow-y-auto', expanded ? 'max-h-[520px] md:max-h-[calc(100dvh-220px)]' : COLLAPSED_LIST_HEIGHT_CLASS)}
        >
          {videos.map((video, index) => {
            const isCurrent = index === currentIndex;
            const percent = progressByVideo[video.youtubeVideoId];
            const thumbnailHidden = !isCurrent && !!hiddenThumbnailIds?.has(video.id);
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
                      {thumbnailHidden ? (
                        <span className="absolute inset-0 flex items-center justify-center text-md text-text-faint">#{index + 1}</span>
                      ) : (
                        video.thumbnailUrl && (
                          // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                        )
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
                    {/* 縮めた状態の高さを3行ちょうどにするため、進捗が無い行も同じ高さの枠を取る */}
                    {percent != null ? <ProgressBar value={percent} className="mt-[2px]" /> : <span aria-hidden className="mt-[2px] block h-[2px]" />}
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
        {showFade && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-bg-card-bottom to-transparent" />
        )}
      </div>
      {/* フッターのリンク・ボタンはゴーストボタン（小、デザイントークン仕様書 §4.4）。ボタン自身の余白（8px / 5px）の分だけ
          フッターの余白を詰め、文字の位置は従来（左右18px・上下12px）のまま */}
      <div className="flex items-center justify-between gap-3 border-t border-border-divider px-[10px] py-[7px]">
        <ExternalLinkButton href={referenceUrl} variant="ghost" size="sm">
          <YouTubeIcon />
          YouTubeの再生リストを見る ↗
        </ExternalLinkButton>
        {collapsible && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="shrink-0">
            {expanded ? '縮める' : '広げる'}
          </Button>
        )}
      </div>
    </Card>
  );
}
