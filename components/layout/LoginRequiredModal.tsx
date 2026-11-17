/**
 * ログイン要求モーダル（共通 uiコンポーネント フロント 仕様書 §5、ログイン仕様書 §3）。
 * 未ログインユーザーがログイン必須の操作をした際に表示し、アカウント作成またはログインへ誘導する。
 * 見出しと本文は押した操作に合わせる（components/layout/login-prompts.ts）。
 * アカウント作成・ログインのあとは `next`（省略時は今のページ）へ戻す（ログイン仕様書 §5.4）。
 */
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Modal } from '@/components/ui/Modal';
import { LinkButton } from '@/components/ui/Button';
import type { LoginPrompt } from './login-prompts';

interface LoginRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 操作ごとの見出しと本文（LOGIN_PROMPTS のいずれか） */
  prompt: LoginPrompt;
  /** アカウント作成・ログインのあとに戻すサイト内パス。省略時は今のページ */
  next?: string;
  /** ボタンの下に添える補足（チャンネル詳細の「ご本人・事務所の方へ」など） */
  note?: ReactNode;
}

/** ログインページへのリンク先（`next` を付ける）。TOP へ戻すときは付けない */
export function loginHref(mode: 'login' | 'signup', next: string | null | undefined): string {
  const params = new URLSearchParams();
  if (mode === 'signup') params.set('mode', 'signup');
  if (next && next !== '/') params.set('next', next);
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

export function LoginRequiredModal({ open, onOpenChange, prompt, next, note }: LoginRequiredModalProps) {
  const pathname = usePathname();
  const back = next ?? pathname;
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={prompt.title} description={prompt.description}>
      <div className="flex flex-col items-center gap-4" data-testid="login-required-modal">
        <LinkButton href={loginHref('signup', back)} variant="primary" size="full">
          アカウントを作成する
        </LinkButton>
        <p className="text-base text-text-muted">
          すでにアカウントをお持ちの方は{' '}
          <Link href={loginHref('login', back)} className="text-text-primary underline underline-offset-[3px] hover:text-text-secondary">
            ログイン
          </Link>
        </p>
        {note}
      </div>
    </Modal>
  );
}
