/**
 * レビュー投稿セクション（ページ 再生リスト詳細 仕様書「レビュー投稿セクション」節）。
 * フォーム＋一覧をまとめ、一覧側の「編集する」からフォームへスクロールできるようにする。
 * PC版は左カラム（ヒーローの下）、モバイル版は動画リストの直後という配置差があり、
 * 呼び出し側（再生リスト詳細ページ）は PlaylistInfoCard と同じ「2箇所にレンダリングし
 * 片方をCSSで隠す」パターンでこのコンポーネントを配置する。
 */
'use client';

import { useRef } from 'react';
import type { User } from 'firebase/auth';
import { ReviewForm } from './ReviewForm';
import { ReviewList } from './ReviewList';

export function ReviewSection({ playlistId, user }: { playlistId: string; user: User | null }) {
  const formRef = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <div ref={formRef}>
        <ReviewForm playlistId={playlistId} user={user} />
      </div>
      <ReviewList
        playlistId={playlistId}
        user={user}
        onRequestEditFocus={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
    </div>
  );
}
