/**
 * レビューコメント通報モーダル（レビュー投稿機能仕様書「通報機能」節）。
 * `workflows`（type: "review_report"）へのレコード作成のみ行う。承認・却下の処理は
 * 管理画面（フェーズ6ステップ3 /admin/workflows）で行う。AI運営者による一次審査・
 * STEP1/STEP2の二段階フローは引き続き先送り（管理_審査ワークフロー仕様書 実装注記参照）。
 */
'use client';

import { useState } from 'react';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { REPORT_REASONS, type ReportReason } from '@/lib/report-reasons';

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reviewId: string;
  playlistId: string;
  userId: string;
}

export function ReportModal({ open, onOpenChange, reviewId, playlistId, userId }: ReportModalProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function resetAndClose() {
    setReason(null);
    setDetail('');
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    try {
      // 多重送信制限（仕様書「通報の多重送信制限」節）: 自分の通報のみ読めるルールのため、
      // submittedBy==自分 で取得しクライアント側で対象レビューIDを絞り込む（複合indexを増やさない）。
      const mineSnap = await getDocs(
        query(collection(db, 'workflows'), where('submittedBy', '==', userId), where('type', '==', 'review_report')),
      );
      const alreadyReported = mineSnap.docs.some((d) => d.data().reportData?.reviewId === reviewId);
      if (alreadyReported) {
        toast({ type: 'info', message: 'すでに通報済みです' });
        resetAndClose();
        return;
      }

      await addDoc(collection(db, 'workflows'), {
        type: 'review_report',
        status: 'reviewing_lv1',
        submittedBy: userId,
        genreId: null,
        step1AssignedOperatorIds: [],
        proposalData: null,
        reportData: {
          targetType: 'review',
          reviewId,
          playlistId,
          reason,
          detail: detail.trim() || null,
        },
        step1History: [],
        step1Errors: [],
        step2History: [],
        editHistory: [],
        operatorMemo: null,
        submittedAt: new Date(),
        updatedAt: new Date(),
      });
      toast({ type: 'success', message: '通報を受け付けました' });
      resetAndClose();
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(next) => (next ? onOpenChange(next) : resetAndClose())} title="このレビューを通報する">
      <div className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-md text-text-tertiary">通報理由</legend>
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="inline-flex cursor-pointer items-center gap-2 text-base text-text-secondary">
              <input
                type="radio"
                name="report-reason"
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="size-4"
              />
              {r.label}
            </label>
          ))}
        </fieldset>
        <Textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="詳細（任意）"
          aria-label="通報の詳細コメント（任意）"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={resetAndClose}>
            キャンセル
          </Button>
          <Button variant="primary" disabled={!reason} loading={submitting} onClick={handleSubmit}>
            通報する
          </Button>
        </div>
      </div>
    </Modal>
  );
}
