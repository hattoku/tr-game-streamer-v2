/**
 * プロフィールの公開設定ポップアップ（ページ 設定 プロフィール仕様書 §2.3・§4.2）。
 * ヘッダーの「公開設定」から開き、マイリスト・レビュー履歴の公開ON/OFFをその場で切り替える。
 * 値は設定ページの「公開設定」カード（設定仕様書 §5）と同じ users/{uid}.isMylistPublic / isReviewHistoryPublic。
 * 切り替えと同時に保存し（§5.4）、結果は本人のページのセクション見出し横の「非公開」バッジに出る。
 */
'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Modal } from '@/components/ui/Modal';
import { Checkbox } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export type VisibilityKey = 'isMylistPublic' | 'isReviewHistoryPublic';

const ITEMS: Array<{ key: VisibilityKey; label: string; description: string }> = [
  { key: 'isMylistPublic', label: 'マイリストを公開する', description: '他のユーザーにマイリストを公開します' },
  { key: 'isReviewHistoryPublic', label: 'レビュー履歴を公開する', description: '他のユーザーにレビュー履歴を公開します' },
];

export function ProfileVisibilityModal({
  open,
  onOpenChange,
  userId,
  values,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  values: Record<VisibilityKey, boolean>;
  onChange: (key: VisibilityKey, value: boolean) => void;
}) {
  const { toast } = useToast();
  const [busyKey, setBusyKey] = useState<VisibilityKey | null>(null);

  async function toggle(key: VisibilityKey, value: boolean) {
    setBusyKey(key);
    onChange(key, value);
    try {
      await updateDoc(doc(db, 'users', userId), { [key]: value });
      toast({ type: 'success', message: '設定を保存しました' });
    } catch {
      onChange(key, !value);
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="公開設定"
      description="オフにすると他のユーザーには表示されません（自分には表示されます）"
    >
      <div className="flex flex-col gap-4">
        {ITEMS.map((item) => (
          <div key={item.key}>
            <Checkbox
              label={item.label}
              checked={values[item.key]}
              disabled={busyKey != null}
              onChange={(e) => toggle(item.key, e.target.checked)}
            />
            <p className="mt-1 text-md text-text-muted">{item.description}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
