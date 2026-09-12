/**
 * ログイン要求モーダル（共通 uiコンポーネント フロント 仕様書 §5、ログイン仕様書 §3）。
 * 未ログインユーザーがログイン必須の操作をした際に表示し、アカウント作成またはログインへ誘導する。
 * タイトルは操作に応じて呼び出し側が渡す。
 */
'use client';

import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { LinkButton } from '@/components/ui/Button';
import { SIGNUP_HREF } from './nav';

interface LoginRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 例:「マイリストに追加するにはアカウントが必要です」 */
  title: string;
}

export function LoginRequiredModal({ open, onOpenChange, title }: LoginRequiredModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="プレミテのアカウントを作成すると、視聴記録の管理やレビューの投稿ができます。"
    >
      <div className="flex flex-col items-center gap-4">
        <LinkButton href={SIGNUP_HREF} variant="primary" size="full">
          アカウントを作成する
        </LinkButton>
        <p className="text-base text-text-muted">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-text-primary underline underline-offset-[3px] hover:text-text-secondary">
            ログイン
          </Link>
        </p>
      </div>
    </Modal>
  );
}
