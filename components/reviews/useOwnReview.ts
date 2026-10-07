/**
 * 自分のレビュー（`reviews/{uid}_{playlistId}`）の購読と、upsert API の呼び出し。
 * ReviewForm（視聴ステータス記録＋レビュー投稿UI）と PlaylistFinishedModal（最終話の再生終了時の
 * 完走確認＋星評価）の両方から使う。
 *
 * upsert API（app/api/reviews/upsert/route.ts）は星・視聴ステータス・コメント・ネタバレを
 * まとめて上書きするため、一部だけ変える場合も呼び出し側で保存済みの値を合わせて送ること。
 */
'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { normalizeWatchStatus, type WatchStatus } from '@/components/ui/Chip';

export const MAX_COMMENT_LENGTH = 2000;

/** 再生リスト詳細ページが保持するマイリスト登録状態（呼び出し側と共有する） */
export interface MylistState {
  docId: string;
  status: WatchStatus;
}

export interface ReviewDoc {
  starRating: number | null;
  /** レビュー一覧表示用の非正規化コピー。視聴ステータスの正は mylist */
  watchStatus: WatchStatus | null;
  comment: string | null;
  hasSpoiler: boolean;
}

export const EMPTY_REVIEW: ReviewDoc = { starRating: null, watchStatus: null, comment: null, hasSpoiler: false };

const UPSERT_ERROR_MESSAGE: Record<string, string> = {
  url_in_comment: 'URLの入力はできません',
  ng_word: '不適切な表現が含まれています',
  comment_too_long: `コメントは${MAX_COMMENT_LENGTH}文字以内で入力してください`,
};

export async function getIdToken(): Promise<string> {
  if (!auth.currentUser) throw new Error('not signed in');
  return auth.currentUser.getIdToken();
}

/**
 * 自分の投稿済みレビューを購読する。未投稿・未ログインなら EMPTY_REVIEW。
 * ユーザー切替・アンマウント時はクリーンアップ側で戻す（effect本体では setState しない:
 * react-hooks/set-state-in-effect。components/layout/NotificationBell.tsx と同じ対応）
 */
export function useOwnReview(user: User | null, playlistId: string): ReviewDoc {
  const [review, setReview] = useState<ReviewDoc>(EMPTY_REVIEW);
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, 'reviews', `${user.uid}_${playlistId}`);
    const unsubscribe = onSnapshot(ref, (snap) => {
      setReview(
        snap.exists()
          ? {
              starRating: (snap.data().starRating as number | null) ?? null,
              watchStatus: normalizeWatchStatus(snap.data().watchStatus),
              comment: (snap.data().comment as string | null) ?? null,
              hasSpoiler: (snap.data().hasSpoiler as boolean) ?? false,
            }
          : EMPTY_REVIEW,
      );
    });
    return () => {
      unsubscribe();
      setReview(EMPTY_REVIEW);
    };
  }, [user, playlistId]);
  return review;
}

export type UpsertReviewResult = { ok: true; mylist: MylistState | null } | { ok: false; message: string };

/**
 * `reviews.watchStatus` はサーバー側で mylist にも反映され、結果の mylist 状態が
 * レスポンスで返る。呼び出し側はそれで mylist state を同期する。
 */
export async function upsertReview(body: {
  playlistId: string;
  starRating: number | null;
  watchStatus: WatchStatus | null;
  comment: string;
  hasSpoiler: boolean;
}): Promise<UpsertReviewResult> {
  try {
    const idToken = await getIdToken();
    const res = await fetch('/api/reviews/upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      return { ok: false, message: UPSERT_ERROR_MESSAGE[json.error] ?? '送信に失敗しました。時間をおいて再試行してください' };
    }
    return { ok: true, mylist: json.mylist ?? null };
  } catch {
    return { ok: false, message: '通信エラーが発生しました。時間をおいて再試行してください' };
  }
}
