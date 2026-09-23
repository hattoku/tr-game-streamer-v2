/**
 * レビュー投稿セクション（ページ 再生リスト詳細 仕様書「レビュー投稿セクション」節）。
 * フォーム（視聴ステータス記録＋レビュー投稿）＋一覧をまとめ、一覧側の「編集する」から
 * フォームへスクロールできるようにする。
 * PC版は左カラム（ヒーローの下）、モバイル版は動画リストの直後という配置差があり、
 * 呼び出し側（再生リスト詳細ページ）は PlaylistInfoCard と同じ「2箇所にレンダリングし
 * 片方をCSSで隠す」パターンでこのコンポーネントを配置する。
 * mylist state は呼び出し側（ページ）が保持し、2箇所の描画とマイリスト登録判定とで共有する。
 */
'use client';

import { useRef } from 'react';
import type { User } from 'firebase/auth';
import { ReviewForm, type MylistState } from './ReviewForm';
import { ReviewList } from './ReviewList';

interface ReviewSectionProps {
  playlistId: string;
  user: User | null;
  mylist: MylistState | null;
  onMylistChange: (next: MylistState | null) => void;
}

export function ReviewSection({ playlistId, user, mylist, onMylistChange }: ReviewSectionProps) {
  const formRef = useRef<HTMLDivElement>(null);
  return (
    <div className="flex flex-col gap-4">
      <div ref={formRef}>
        <ReviewForm playlistId={playlistId} user={user} mylist={mylist} onMylistChange={onMylistChange} />
      </div>
      <ReviewList
        playlistId={playlistId}
        user={user}
        onRequestEditFocus={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      />
    </div>
  );
}
