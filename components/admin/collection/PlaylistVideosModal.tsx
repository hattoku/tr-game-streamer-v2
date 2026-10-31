/**
 * 収集候補の再生リストの全動画を一覧で確認するモーダル（管理 AI運営者向け収集候補レビューUI仕様書 v2.3 §3.8）。
 * シリーズの途中に関係の無い動画が挟まっていないかを、承認前に確かめるためのもの。開くたびに YouTube から取り直す
 * （playlistItems・videos とも50本ごとに1ユニット。コンテンツ収集の1日の枠に数える）。
 */
'use client';

import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { SkeletonText } from '@/components/ui/Skeleton';
import { formatDateTime, postAdminApi, quotaExceededMessage } from '@/lib/collection-admin';

export interface PlaylistVideo {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  position: number;
  publishedAt: string;
  durationSeconds: number | null;
}

interface PlaylistVideosModalProps {
  /** 開いている候補（null で閉じる） */
  candidate: { id: string; playlistTitle: string } | null;
  onClose: () => void;
}

export function PlaylistVideosModal({ candidate, onClose }: PlaylistVideosModalProps) {
  return (
    <Modal
      open={candidate !== null}
      onOpenChange={(open) => !open && onClose()}
      title="再生リストの動画一覧"
      description={candidate?.playlistTitle}
      maxWidthClassName="max-w-[720px]"
    >
      {/* 開くたびに作り直して取り直す（前の候補の一覧が一瞬見えないように） */}
      {candidate && <VideosBody key={candidate.id} playlistId={candidate.id} />}
    </Modal>
  );
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '-';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function VideosBody({ playlistId }: { playlistId: string }) {
  const [list, setList] = useState<PlaylistVideo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await postAdminApi<{ videos?: PlaylistVideo[]; remaining?: number }>('/api/admin/collection/candidates', { action: 'videos', playlistId });
        if (res.status === 429) setError(quotaExceededMessage(res.body.remaining));
        else if (!res.ok || !res.body.videos) setError('動画一覧を取得できませんでした。時間をおいて再試行してください');
        else setList(res.body.videos);
      } catch {
        setError('通信エラーが発生しました。時間をおいて再試行してください');
      }
    })();
  }, [playlistId]);

  if (error) {
    return (
      <p role="alert" className="text-md text-input-error">
        {error}
      </p>
    );
  }
  if (!list) return <SkeletonText lines={6} />;

  const total = list.reduce((sum, v) => sum + (v.durationSeconds ?? 0), 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-md text-text-tertiary">
        今の時点で {list.length}本・合計 {formatDuration(total)}。シリーズと関係の無い動画が挟まっていれば、承認せず却下してください。
      </p>
      <ol className="flex max-h-[60dvh] flex-col gap-1 overflow-y-auto rounded-[8px] border border-border-card p-1" aria-label="動画一覧">
        {list.map((v, i) => (
          <li key={`${v.videoId}-${i}`}>
            <a
              href={`https://www.youtube.com/watch?v=${v.videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-[6px] p-2 hover:bg-bg-input"
            >
              <span className="w-8 shrink-0 text-right text-sm text-text-muted">{i + 1}</span>
              <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-[4px] bg-bg-hover">
                {v.thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={v.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" loading="lazy" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm text-text-primary">{v.title}</span>
                <span className="block text-xs text-text-tertiary">
                  {formatDuration(v.durationSeconds)} ・ 公開 {formatDateTime(Date.parse(v.publishedAt) || null)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
