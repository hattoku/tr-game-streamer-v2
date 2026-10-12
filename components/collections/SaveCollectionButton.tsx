/**
 * まとめの保存ボタン（まとめ機能仕様書 §5.2・§8.2）。ログイン済みで、作成者以外にだけ出す（呼び出し側で判定）。
 * 押すと保存、保存済みで押すと解除。保存済みはハートを塗りつぶしたトグルON表示（セカンダリボタンの active）。
 * 保存状態の取得・変更は API 経由（savedCount の増減を伴うため。lib/collections.ts の fetchIsSaved / setCollectionSaved）。
 * 表示は押した時点で切り替え、失敗したら元に戻してトーストで知らせる。
 */
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { FavoriteIcon } from '@/components/ui/icons';
import { CollectionApiError, fetchIsSaved, setCollectionSaved } from '@/lib/collections';

export function SaveCollectionButton({ collectionId, className }: { collectionId: string; className?: string }) {
  const { toast } = useToast();
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchIsSaved(collectionId)
      .then((v) => {
        if (!cancelled) setSaved(v);
      })
      .catch(() => {
        if (!cancelled) setSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId]);

  async function toggle() {
    if (saved == null || busy) return;
    const next = !saved;
    setSaved(next);
    setBusy(true);
    try {
      await setCollectionSaved(collectionId, next);
      toast({ type: 'success', message: next ? 'まとめを保存しました' : '保存を解除しました' });
    } catch (e) {
      setSaved(!next);
      toast({ type: 'error', message: e instanceof CollectionApiError ? e.message : '保存に失敗しました。時間をおいて再試行してください' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      active={!!saved}
      aria-pressed={!!saved}
      // 初回の保存状態の取得中は減光ではなくスピナーで示す（§9.3 ボタン内アクション実行中と同じ見せ方）
      loading={saved == null}
      disabled={busy}
      onClick={toggle}
      className={className}
    >
      <FavoriteIcon size={13} fill={saved ? 'currentColor' : 'none'} />
      {saved ? '保存済み' : 'まとめを保存する'}
    </Button>
  );
}
