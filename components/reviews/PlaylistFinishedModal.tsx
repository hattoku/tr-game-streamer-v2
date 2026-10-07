/**
 * 最終話の再生終了時ダイアログ（動画プレーヤー仕様書「最終話の再生終了時」、
 * レビュー投稿機能仕様書「最終話の再生終了時ダイアログ」）。
 * 表示順で最後の動画を見終えたときに、この再生リストの視聴ステータスを「完走」にするかの確認と
 * 星評価を促す。完走への変更は「完走にする」を押したときだけ行う（マイリスト機能仕様書 §5.7:
 * 視聴進捗による自動変更はしない）。コメントは「レビューを書く」でページ内のフォームへ移って書く。
 *
 * どの欄を出すかは開いた時点で呼び出し側が決めて `sections` で渡す（保存のたびに欄が消えて
 * ダイアログが伸縮しないよう、開いている間は固定する）。閉じた後もフェードアウトが終わるまでは
 * 直前の `sections` で描画する。
 */
'use client';

import { useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/ui/StarRating';
import { useToast } from '@/components/ui/Toast';
import { CheckIcon } from '@/components/ui/icons';
import { WATCH_STATUS_LABEL } from '@/components/ui/Chip';
import { upsertReview, type MylistState, type ReviewDoc } from './useOwnReview';

export interface FinishedPromptSections {
  /** 「完走にする」の確認欄（開いた時点で完走でなかった場合） */
  status: boolean;
  /** 星評価欄（開いた時点で星もコメントも無かった場合） */
  review: boolean;
}

interface PlaylistFinishedModalProps {
  /** null のときは閉じている */
  sections: FinishedPromptSections | null;
  onClose: () => void;
  playlistId: string;
  user: User | null;
  mylist: MylistState | null;
  onMylistChange: (next: MylistState | null) => void;
  /** 自分の保存済みレビュー（useOwnReview） */
  review: ReviewDoc;
  /** 「レビューを書く」: ダイアログを閉じ、ページ内のレビューフォームでコメント欄を開く */
  onRequestWriteReview: () => void;
}

export function PlaylistFinishedModal({
  sections,
  onClose,
  playlistId,
  user,
  mylist,
  onMylistChange,
  review,
  onRequestWriteReview,
}: PlaylistFinishedModalProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  // 星の選択は保存完了（購読の反映）までの間だけ仮の値で表示する
  const [pendingStar, setPendingStar] = useState<{ value: number | null } | null>(null);
  // 直近に開いたときの欄構成（閉じるアニメーション中に本文が消えないよう保持する。描画中に調整）
  const [shown, setShown] = useState<FinishedPromptSections | null>(sections);
  if (sections && sections !== shown) setShown(sections);
  // 「レビューを書く」で閉じた。閉じ終わってから（Radix がフォーカスを戻す処理・スクロール固定の
  // 解除の後に）フォームへ移る。閉じる途中で移ると、フォーカスを開く前の要素に戻されてしまうため
  const writeAfterCloseRef = useRef(false);

  const completed = mylist?.status === 'completed';
  // 出した欄の操作がすべて済んだ（完走にした・星を付けた）。後回しにするものが無いので「あとで」を「閉じる」にする
  const allDone = (!shown?.status || completed) && (!shown?.review || review.starRating != null);
  // 購読（useOwnReview）に保存結果が届いたら仮の値を外す（API の応答より購読が遅れても星が旧値に戻らないよう）
  if (pendingStar && review.starRating === pendingStar.value) setPendingStar(null);
  const starValue = pendingStar ? pendingStar.value : review.starRating;

  async function save(next: { watchStatus?: 'completed'; starRating?: number | null }) {
    if (!user) return null;
    setBusy(true);
    try {
      const result = await upsertReview({
        playlistId,
        starRating: next.starRating !== undefined ? next.starRating : review.starRating,
        watchStatus: next.watchStatus ?? mylist?.status ?? null,
        comment: review.comment ?? '',
        hasSpoiler: review.hasSpoiler,
      });
      if (!result.ok) {
        toast({ type: 'error', message: result.message });
        return null;
      }
      onMylistChange(result.mylist);
      return result;
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    const wasRegistered = mylist != null;
    const result = await save({ watchStatus: 'completed' });
    if (!result) return;
    toast({
      type: 'success',
      message: wasRegistered
        ? `ステータスを「${WATCH_STATUS_LABEL.completed}」に変更しました`
        : `ステータスを「${WATCH_STATUS_LABEL.completed}」にして、マイリストに追加しました`,
    });
  }

  async function handlePickStar(v: number | null) {
    setPendingStar({ value: v });
    const result = await save({ starRating: v });
    if (!result) setPendingStar(null);
    if (result) toast({ type: 'success', message: v == null ? '評価を取り消しました' : '評価を保存しました' });
  }

  function handleWriteReview() {
    writeAfterCloseRef.current = true;
    onClose();
  }

  function handleCloseAutoFocus(event: Event) {
    if (!writeAfterCloseRef.current) return;
    writeAfterCloseRef.current = false;
    event.preventDefault();
    setTimeout(onRequestWriteReview, 0);
  }

  return (
    <Modal
      open={sections != null}
      // 保存中は閉じない（マイリスト削除の確認ダイアログと同じ）
      onOpenChange={(open) => !open && !busy && onClose()}
      onCloseAutoFocus={handleCloseAutoFocus}
      title="最後まで見終わりました"
      description="おつかれさまでした！この再生リストの記録を残しておきましょう。"
    >
      <div className="flex flex-col gap-5">
        {shown?.status && (
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-medium text-text-primary">この再生リストの視聴ステータスを「完走」にしますか？</h3>
            {completed ? (
              <p className="flex items-center gap-1 text-base text-text-secondary">
                <CheckIcon size={14} />
                完走にしました
              </p>
            ) : (
              <>
                <p className="text-md text-text-muted">
                  {mylist
                    ? `現在のステータス: ${WATCH_STATUS_LABEL[mylist.status]}`
                    : 'マイリストに未登録です（完走にするとマイリストにも追加されます）'}
                </p>
                <Button variant="primary" className="self-start" onClick={handleComplete} loading={busy}>
                  完走にする
                </Button>
              </>
            )}
          </section>
        )}

        {shown?.review && (
          <section className="flex flex-col gap-2">
            <h3 className="text-lg font-medium text-text-primary">この再生リストを評価しませんか？</h3>
            <StarRating value={starValue} onChange={(v) => !busy && handlePickStar(v)} size={26} aria-label="この再生リストの星評価" />
          </section>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {allDone ? '閉じる' : 'あとで'}
          </Button>
          {!review.comment && (
            <Button variant="secondary" onClick={handleWriteReview} disabled={busy}>
              レビューを書く
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
