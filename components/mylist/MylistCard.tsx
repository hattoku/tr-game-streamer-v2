/**
 * マイリストのカード（ページ マイリスト機能仕様書 §5、共通 デザイントークン仕様書 v2.0 §6.1・§6.5・§6.6）。
 * - 親エリア: 再生リストのサムネイル（話数）・タイトル・配信者・ステータスチップ（クリックで変更ドロップダウン §5.8）・
 *   逆順トグル（§5.5、セカンダリボタンのトグルON）・削除（ゴーストボタン）
 * - 子エリア: 最後に再生した動画（§5.3）。サムネイル＋進捗バー 3px・タイトル・残り時間・「続きから再生」
 * - 最終話を視聴済みなら子エリアは出さず、新着動画があれば「🔔 NEW 新着動画があります」行（§5.4）
 * - サムネイル・タイトルのクリックで動画プレーヤーページへ（§5.6）。カード全体はボタンを含むためリンクにしない
 */
'use client';

import Link from 'next/link';
import { Button, LinkButton } from '@/components/ui/Button';
import { Card, CardChildArea } from '@/components/ui/Card';
import { CountLabel, NewBadge } from '@/components/ui/Badge';
import { StatusChip, WATCH_STATUS_LABEL, WATCH_STATUS_ORDER, type WatchStatus } from '@/components/ui/Chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ChevronDownIcon, PlayIcon, ReverseIcon, TrashIcon } from '@/components/ui/icons';

export interface MylistCardData {
  mylistId: string;
  playlistId: string;
  watchStatus: WatchStatus;
  isReverseOrder: boolean;
  playlist: {
    title: string;
    thumbnailUrl: string;
    channelName: string;
    channelIconUrl: string;
    videoCount: number;
  } | null;
  /** 最後に再生した動画。無い／最終話まで視聴済みなら null（§5.4） */
  lastPlayed: {
    title: string;
    thumbnailUrl: string;
    /** 0〜100 */
    percent: number;
    /** 残り秒数。尺が取れない場合は null */
    remainingSeconds: number | null;
  } | null;
  /** マイリスト登録後に新着動画がある（未読の新着通知がある） */
  hasNew: boolean;
}

interface MylistCardProps {
  entry: MylistCardData;
  onStatusChange: (status: WatchStatus) => void;
  onReverseToggle: (value: boolean) => void;
  onRemove: () => void;
}

function formatRemaining(seconds: number): string {
  const min = Math.ceil(seconds / 60);
  return min >= 60 ? `残り ${Math.floor(min / 60)} 時間 ${min % 60} 分` : `残り ${min} 分`;
}

export function MylistCard({ entry, onStatusChange, onReverseToggle, onRemove }: MylistCardProps) {
  const href = `/playlists/${entry.playlistId}`;
  const p = entry.playlist;

  return (
    <Card flush className="flex flex-col">
      {/* 親エリア（§5.2） */}
      <div className="flex gap-3 p-3 md:gap-[18px] md:p-[18px]">
        <Link href={href} className="relative block w-[128px] shrink-0 overflow-hidden rounded-[8px] bg-bg-player md:w-[224px]">
          <span className="block aspect-video">
            {p?.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
            )}
          </span>
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[46%] bg-thumb-overlay" />
          {p && <CountLabel className="absolute bottom-2 right-2">{p.videoCount}話</CountLabel>}
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-[6px] md:gap-[10px]">
          <Link href={href} className="line-clamp-2 text-base font-semibold leading-snug text-text-primary hover:text-text-secondary md:text-xl">
            {p?.title ?? '（再生リスト情報が見つかりません）'}
          </Link>
          {p && (
            <div className="flex items-center gap-2">
              {p.channelIconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.channelIconUrl} alt="" className="size-[18px] shrink-0 rounded-full md:size-[22px]" loading="lazy" />
              ) : (
                <span className="size-[18px] shrink-0 rounded-full bg-bg-btn md:size-[22px]" />
              )}
              <span className="truncate text-sm text-text-tertiary md:text-md">{p.channelName}</span>
            </div>
          )}
          {/* PC ではここに操作列。モバイルは下に回す */}
          <div className="mt-auto hidden md:block">
            <Actions entry={entry} onStatusChange={onStatusChange} onReverseToggle={onReverseToggle} onRemove={onRemove} />
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 md:hidden">
        <Actions entry={entry} onStatusChange={onStatusChange} onReverseToggle={onReverseToggle} onRemove={onRemove} compact />
      </div>

      {/* 子エリア（§5.3, §5.4） */}
      {entry.lastPlayed ? (
        <CardChildArea className="flex flex-col gap-[10px] px-3 md:flex-row md:items-center md:gap-[14px] md:px-[18px]">
          <div className="flex items-center gap-[10px] md:contents">
            <span className="hidden whitespace-nowrap text-sm text-text-muted md:inline">最後に再生</span>
            <div className="flex w-[96px] shrink-0 flex-col md:w-[124px]">
              <span className="block aspect-video overflow-hidden rounded-t-[6px] bg-bg-player">
                {entry.lastPlayed.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.lastPlayed.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
                )}
              </span>
              <ProgressBar value={entry.lastPlayed.percent} size="md" className="rounded-t-none rounded-b-[6px]" label="前回の再生位置" />
            </div>
            <div className="flex min-w-0 flex-col gap-[2px] md:gap-1">
              <span className="text-xs text-text-muted md:hidden">最後に再生</span>
              <p className="line-clamp-2 text-md text-text-secondary md:truncate md:text-base">{entry.lastPlayed.title}</p>
              <span className="flex items-center gap-2 text-xs text-text-muted md:text-sm">
                {entry.lastPlayed.remainingSeconds != null && formatRemaining(entry.lastPlayed.remainingSeconds)}
                {entry.hasNew && <NewBadge />}
              </span>
            </div>
          </div>
          <LinkButton href={href} variant="primary" size="full" className="md:ml-auto md:w-auto md:shrink-0 md:px-[22px] md:py-[9px]">
            <PlayIcon size={14} />
            続きから再生
          </LinkButton>
        </CardChildArea>
      ) : entry.hasNew ? (
        <CardChildArea className="flex items-center gap-3 px-3 md:px-[18px]">
          <NewBadge />
          <Link href={href} className="text-base text-text-secondary hover:text-text-primary">
            新着動画があります
          </Link>
        </CardChildArea>
      ) : null}
    </Card>
  );
}

/** ステータスチップ（変更ドロップダウン）／逆順トグル／削除 の操作列 */
function Actions({
  entry,
  onStatusChange,
  onReverseToggle,
  onRemove,
  compact = false,
}: MylistCardProps & { compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-[10px] md:gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`視聴ステータス: ${WATCH_STATUS_LABEL[entry.watchStatus]}。クリックで変更`}
          className="inline-flex items-center gap-1 rounded-[20px] text-text-muted transition-colors duration-[120ms] hover:text-text-primary"
        >
          <StatusChip status={entry.watchStatus} active readOnly />
          <ChevronDownIcon size={12} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>視聴ステータスを変更</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={entry.watchStatus} onValueChange={(v) => onStatusChange(v as WatchStatus)}>
            {WATCH_STATUS_ORDER.map((s) => (
              <DropdownMenuRadioItem key={s} value={s}>
                {WATCH_STATUS_LABEL[s]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 性格の異なるボタンの間の縦線（トークン仕様書 §4.4） */}
      <span aria-hidden className="h-[18px] w-px bg-white/10" />

      <Button variant="secondary" size={compact ? 'sm' : 'md'} active={entry.isReverseOrder} onClick={() => onReverseToggle(!entry.isReverseOrder)}>
        <ReverseIcon size={13} />
        {compact ? '逆順' : '逆順で再生'}
      </Button>
      <Button variant="ghost" size={compact ? 'sm' : 'md'} onClick={onRemove} aria-label="マイリストから削除">
        <TrashIcon size={13} />
        削除
      </Button>
    </div>
  );
}
