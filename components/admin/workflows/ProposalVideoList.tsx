/**
 * 再生リスト登録提案の審査詳細に出す動画一覧（管理 審査ワークフロー仕様書 §4.2）。
 * YouTube へ移らずに、ゲームが混ざっていないか・ゲーム実況か等を確かめるためのもの。
 * GET /api/admin/workflows/[workflowId]/videos で都度取得する（YouTube API の割り当てを使うため、審査中の提案でだけ出す）。
 */
'use client';

import { useEffect, useState } from 'react';
import { fetchProposalVideos, type ProposalVideo } from '@/lib/workflow-admin';
import { SkeletonText } from '@/components/ui/Skeleton';

type VideoRow = ProposalVideo;

export function ProposalVideoList({ workflowId }: { workflowId: string }) {
  const [videos, setVideos] = useState<VideoRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setVideos(await fetchProposalVideos(workflowId));
      } catch {
        setError(true);
      }
    })();
  }, [workflowId]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-md text-text-tertiary">動画一覧{videos ? `（${videos.length}本）` : ''}</p>
      {error ? (
        <p className="text-base text-text-muted">動画一覧を取得できませんでした。「YouTubeで開く」から確認してください</p>
      ) : videos === null ? (
        <SkeletonText lines={3} />
      ) : videos.length === 0 ? (
        <p className="text-base text-text-muted">動画がありません</p>
      ) : (
        <ol className="flex max-h-[320px] flex-col gap-1 overflow-y-auto rounded-[8px] border border-border-card p-1">
          {videos.map((v, i) => (
            <li key={`${v.youtubeVideoId}-${i}`}>
              <a
                href={`https://www.youtube.com/watch?v=${v.youtubeVideoId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[6px] p-1 transition-colors duration-[120ms] hover:bg-bg-hover"
              >
                <span className="w-6 shrink-0 text-right text-md text-text-muted">{i + 1}</span>
                <span className="relative aspect-video w-[96px] shrink-0 overflow-hidden rounded-[4px] bg-bg-btn">
                  {v.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumbnailUrl} alt="" className="absolute inset-0 size-full object-cover" />
                  )}
                </span>
                <span className="line-clamp-2 min-w-0 text-base text-text-secondary">{v.title}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
