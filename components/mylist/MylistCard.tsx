/**
 * マイリストのカード（ページ マイリスト機能仕様書 §5、共通 デザイントークン仕様書 v2.0 §6.1・§6.5・§6.6）。
 * - 親エリア: 再生リストのサムネイル（話数）・タイトル・配信者・ステータスチップ（クリックで変更ドロップダウン §5.8）・
 *   逆順トグル（§5.5、セカンダリボタンのトグルON）・まとめに追加（まとめ機能仕様書 §4.1）・削除（ゴーストボタン）
 * - 子エリア: 最後に再生した動画（§5.3）。サムネイル（右下に再生時間）＋進捗バー 3px・タイトル（省略せず折り返し）・
 *   残り時間・右端の丸い再生アイコン。行全体が「続きから再生」のリンク
 *   （`?autoplay=1` 付きで遷移し、遷移先で自動再生を試みる。自動再生できない iOS / Safari では
 *   右矢印アイコン・読み上げ名「再生ページへ」の通常の遷移にする）
 * - 最終話を視聴済みなら子エリアは出さず、新着動画があれば「🔔 NEW 新着動画があります」行（§5.4）
 * - サムネイル・タイトルのクリックで動画プレーヤーページへ（§5.6）。カード全体はボタンを含むためリンクにしない
 */
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
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
import { formatDuration } from '@/components/playlists/VideoList';
import { ChevronDownIcon, ChevronRightIcon, PlayIcon, ReverseIcon, TrashIcon } from '@/components/ui/icons';
import { useCanAutoplayAfterNavigation } from '@/lib/autoplay';
import { AddToCollectionButton } from '@/components/collections/AddToCollectionButton';
import { COLLECTIONS_ENABLED } from '@/lib/feature-flags';

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
    /** 動画の尺（秒）。取れない場合は null */
    durationSeconds: number | null;
    /** 残り秒数。尺が取れない場合は null */
    remainingSeconds: number | null;
    /** 何話目か（1始まり、逆順を考慮）。position が取れない場合は null。TOPのマイリストカードで使用 */
    episodeNumber: number | null;
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
  const canAutoplay = useCanAutoplayAfterNavigation();

  return (
    <Card flush className="flex flex-col">
      {/* 親エリア（§5.2） */}
      <div className="flex gap-3 p-3 md:gap-[18px] md:p-[18px]">
        <Link href={href} className="relative block w-[128px] shrink-0 overflow-hidden rounded-[8px] bg-bg-player md:w-[224px]">
          <span className="relative block aspect-video">
            {p?.thumbnailUrl && (
              // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
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
                // referrerPolicy: yt3.ggpht.com の Referer 制限対策（PlaylistSummary 参照）
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.channelIconUrl} alt="" referrerPolicy="no-referrer" className="size-[18px] shrink-0 rounded-full md:size-[22px]" loading="lazy" />
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

      {/* 子エリア（§5.3, §5.4）。行全体を「続きから再生」のリンクにする（v1.13。カードごとに幅いっぱいの
          プライマリボタンを置くと、一覧で赤い帯が縦に並び「1ページに原則1つ」のルールにも反するため）。
          右端の丸い再生アイコン／右矢印は押せることを示す目印で、それ自体は別のリンクにしない */}
      {entry.lastPlayed ? (
        <CardChildArea className="p-0">
          {/* 自動再生できない環境（iOS / Safari）では再生を約束する名前・アイコンにせず、遷移のみの表示にする（§5.3） */}
          <Link
            href={canAutoplay ? `${href}?autoplay=1` : href}
            aria-label={`${canAutoplay ? '続きから再生' : '再生ページへ'}: ${entry.lastPlayed.title}`}
            className="group flex items-center gap-[10px] px-3 pt-3 pb-[14px] transition-colors duration-[120ms] hover:bg-bg-hover md:gap-[14px] md:px-[18px]"
          >
            <span className="hidden whitespace-nowrap text-sm text-text-muted md:inline">最後に再生</span>
            <span className="flex w-[96px] shrink-0 flex-col md:w-[124px]">
              <span className="relative block aspect-video overflow-hidden rounded-t-[6px] bg-bg-player">
                {entry.lastPlayed.thumbnailUrl && (
                  // absolute化: 通常フローの子だと画像自身の縦横比がaspect-videoコンテナの高さに影響してしまうため
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.lastPlayed.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                )}
                {entry.lastPlayed.durationSeconds != null && (
                  <CountLabel className="absolute bottom-1 right-1 px-[5px] py-0 text-xs">
                    {formatDuration(entry.lastPlayed.durationSeconds)}
                  </CountLabel>
                )}
              </span>
              <ProgressBar value={entry.lastPlayed.percent} size="md" className="rounded-t-none rounded-b-[6px]" label="前回の再生位置" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px] md:gap-1">
              <span className="text-xs text-text-muted md:hidden">最後に再生</span>
              <span className="break-words text-md text-text-secondary transition-colors duration-[120ms] group-hover:text-text-primary md:text-base">
                {entry.lastPlayed.title}
              </span>
              <span className="flex items-center gap-2 text-xs text-text-muted md:text-sm">
                {entry.lastPlayed.remainingSeconds != null && formatRemaining(entry.lastPlayed.remainingSeconds)}
                {entry.hasNew && <NewBadge />}
              </span>
            </span>
            {canAutoplay ? (
              // セカンダリボタン（§4.2）の面を持つ丸い目印。赤い面はページ内の主要1アクション用なので使わない
              <span
                aria-hidden
                data-testid="mylist-continue-play-icon"
                className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-control bg-gradient-secondary text-text-btn shadow-control inset-shadow-highlight transition-colors duration-[120ms] group-hover:bg-gradient-secondary-hover group-hover:text-text-primary md:size-10"
              >
                <PlayIcon size={16} />
              </span>
            ) : (
              <span aria-hidden data-testid="mylist-continue-chevron" className="shrink-0 text-text-muted transition-colors duration-[120ms] group-hover:text-text-primary">
                <ChevronRightIcon size={20} />
              </span>
            )}
          </Link>
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

      <Button variant="secondary" size="sm" active={entry.isReverseOrder} onClick={() => onReverseToggle(!entry.isReverseOrder)}>
        <ReverseIcon size={13} />
        {entry.isReverseOrder ? (compact ? '逆順中' : '逆順再生中') : compact ? '逆順' : '逆順で再生'}
      </Button>
      {/* まとめ機能仕様書 §4.1「マイリストページ」の作成導線。まとめ機能の取り下げ（マイリスト機能仕様書 v1.12）で出さない */}
      {COLLECTIONS_ENABLED && <AddToCollectionButton playlistId={entry.playlistId} label={compact ? 'まとめ' : 'まとめに追加'} />}
      <Button variant="ghost" size="sm" onClick={onRemove} aria-label="マイリストから削除">
        <TrashIcon size={13} />
        {/* モバイルは「まとめ」ボタン追加で1行に収まらなくなるためアイコンのみ（aria-label で名前は保つ）。まとめを出さない間は文字も出す */}
        {(!compact || !COLLECTIONS_ENABLED) && '削除'}
      </Button>
    </div>
  );
}
