/**
 * 再生リストの要約ブロック（ページ 再生リストを追加する 仕様書 §4.1.1 確認エリア・§6.1 完了画面で共用）。
 * 左にサムネイル（16:9、PC は 200px 幅・モバイルは全幅）、右にタイトル・チャンネル（円形アイコン＋名前）・
 * ゲームタイトル（完了画面のみ）・「動画数: N本」。
 * この画面の文言は仕様書どおり「動画数: N本」とし、一覧カードの「N話」（トークン仕様書 §6.5）は使わない。
 */
import { Tag } from '@/components/ui/Tag';

interface PlaylistSummaryProps {
  title: string;
  thumbnailUrl: string;
  channelName: string;
  channelIconUrl: string;
  videoCount: number;
  /** 完了画面（§6.1）でのみ表示 */
  gameName?: string;
}

export function PlaylistSummary({ title, thumbnailUrl, channelName, channelIconUrl, videoCount, gameName }: PlaylistSummaryProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:gap-4">
      <div className="aspect-video w-full shrink-0 overflow-hidden rounded-[8px] bg-bg-btn md:w-[200px]">
        {thumbnailUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="size-full object-cover" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="line-clamp-2 text-xl font-medium text-text-primary" title={title}>
          {title}
        </p>
        <div className="flex items-center gap-2 text-base text-text-secondary">
          {channelIconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={channelIconUrl} alt="" className="size-6 shrink-0 rounded-full bg-bg-btn object-cover" />
          ) : (
            <span className="block size-6 shrink-0 rounded-full bg-bg-btn" />
          )}
          <span className="truncate">{channelName}</span>
        </div>
        {gameName && (
          <div>
            <Tag emphasis>{gameName}</Tag>
          </div>
        )}
        <p className="text-md text-text-muted">動画数: {videoCount}本</p>
      </div>
    </div>
  );
}
