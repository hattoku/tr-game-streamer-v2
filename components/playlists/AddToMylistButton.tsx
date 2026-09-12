/**
 * 「マイリストに追加」ボタン（ページ マイリスト機能仕様書 §1.3、§5.8）。
 * - 未登録: セカンダリボタン。クリックで視聴ステータス選択モーダル（見たい／視聴中／完走／一時中断／断念）
 * - 未ログイン: ログイン要求モーダル（共通 uiコンポーネント フロント 仕様書 §5）
 * - 登録済み: 現在のステータスチップ。クリックでステータス変更・削除のドロップダウン
 * Firestore の mylist ドキュメント ID は `${uid}_${playlistId}`（フェーズ2の実装を踏襲）。
 */
'use client';

import { useState } from 'react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusChip, WATCH_STATUS_LABEL, WATCH_STATUS_ORDER, type WatchStatus } from '@/components/ui/Chip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { useToast } from '@/components/ui/Toast';
import { FavoriteIcon } from '@/components/ui/icons';
import { LoginRequiredModal } from '@/components/layout/LoginRequiredModal';

export interface MylistState {
  docId: string;
  status: WatchStatus;
}

interface AddToMylistButtonProps {
  playlistId: string;
  user: User | null;
  mylist: MylistState | null;
  onChange: (next: MylistState | null) => void;
}

export function AddToMylistButton({ playlistId, user, mylist, onChange }: AddToMylistButtonProps) {
  const { toast } = useToast();
  const [loginOpen, setLoginOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function add(status: WatchStatus) {
    if (!user) return;
    setBusy(true);
    try {
      const docId = `${user.uid}_${playlistId}`;
      await setDoc(doc(db, 'mylist', docId), {
        userId: user.uid,
        playlistId,
        watchStatus: status,
        isReverseOrder: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onChange({ docId, status });
      setPickerOpen(false);
      toast({ type: 'success', message: 'マイリストに追加しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: WatchStatus) {
    if (!mylist || status === mylist.status) return;
    try {
      await updateDoc(doc(db, 'mylist', mylist.docId), { watchStatus: status, updatedAt: serverTimestamp() });
      onChange({ ...mylist, status });
      toast({ type: 'success', message: `ステータスを「${WATCH_STATUS_LABEL[status]}」に変更しました` });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  async function remove() {
    if (!mylist) return;
    try {
      await deleteDoc(doc(db, 'mylist', mylist.docId));
      onChange(null);
      toast({ type: 'success', message: 'マイリストから削除しました' });
    } catch {
      toast({ type: 'error', message: '通信エラーが発生しました。時間をおいて再試行してください' });
    }
  }

  if (mylist) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="inline-flex items-center gap-2 text-md text-text-muted" aria-label="マイリストのステータスを変更">
            <FavoriteIcon size={14} className="text-text-primary" />
            マイリスト登録済み
            <StatusChip status={mylist.status} active readOnly />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>視聴ステータスを変更</DropdownMenuLabel>
          {WATCH_STATUS_ORDER.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => changeStatus(s)} className={s === mylist.status ? 'text-text-primary' : undefined}>
              {WATCH_STATUS_LABEL[s]}
              {s === mylist.status && <span className="ml-auto text-md text-text-muted">現在</span>}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={remove}>マイリストから削除</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <>
      <Button variant="secondary" size="full" onClick={() => (user ? setPickerOpen(true) : setLoginOpen(true))}>
        <FavoriteIcon size={14} />
        マイリストに追加
      </Button>

      <LoginRequiredModal open={loginOpen} onOpenChange={setLoginOpen} title="マイリストに追加するにはアカウントが必要です" />

      <Modal open={pickerOpen} onOpenChange={setPickerOpen} title="視聴ステータスを選んでください" description="あとからマイリストページや、このページで変更できます。">
        <div className="flex flex-wrap gap-2" aria-busy={busy}>
          {WATCH_STATUS_ORDER.map((s) => (
            <StatusChip key={s} status={s} disabled={busy} onClick={() => add(s)} />
          ))}
        </div>
      </Modal>
    </>
  );
}
