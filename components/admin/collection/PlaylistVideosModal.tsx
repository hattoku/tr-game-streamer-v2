/**
 * 収集候補の再生リストを YouTube の埋め込みプレイヤーで確認するモーダル（管理 AI運営者向け収集候補レビューUI仕様書 v2.3 §3.8）。
 * シリーズの途中に関係の無い動画が挟まっていないかを、承認前に確かめるためのもの。
 * 埋め込みは YouTube Data API を使わないため、コンテンツ収集の1日の枠を消費しない。
 * 動画の一覧はプレイヤー右上の再生リストのボタンから開く。
 */
'use client';

import { Modal } from '@/components/ui/Modal';

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
      title="再生リストを確認"
      description={candidate?.playlistTitle}
      maxWidthClassName="max-w-[960px]"
    >
      {candidate && (
        <div className="flex flex-col gap-3">
          <p className="text-md text-text-tertiary">
            プレイヤー右上の再生リストのボタンで、動画の一覧を開けます。シリーズと関係の無い動画が挟まっていれば、承認せず却下してください。
          </p>
          <div className="relative aspect-video w-full overflow-hidden rounded-[8px] bg-bg-player">
            <iframe
              src={`https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(candidate.id)}`}
              title={`${candidate.playlistTitle}（YouTube の再生リスト）`}
              className="absolute inset-0 size-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
          <a
            href={`https://www.youtube.com/playlist?list=${encodeURIComponent(candidate.id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="self-end text-md text-admin-accent-text hover:underline"
          >
            埋め込みで再生できないときは YouTube で開く
          </a>
        </div>
      )}
    </Modal>
  );
}
