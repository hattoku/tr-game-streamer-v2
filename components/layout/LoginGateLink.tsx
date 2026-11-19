/**
 * ログインが必要なページへのリンク（「再生リストを追加する」「チャンネルを申請する」など）。
 * ログイン済みならそのまま遷移し、未ログインなら遷移せずにログイン要求モーダルを出す
 * （共通 uiコンポーネント フロント 仕様書 §5.2。いきなりログイン画面に移ると、何のためのログインかわからないため）。
 * モーダルからアカウント作成・ログインしたあとは、押したリンクの遷移先へ戻す。
 * ログイン状態の読み込み中はそのまま遷移させる（遷移先のページが未ログインならログインページへ送るので行き止まりにはならない）。
 */
'use client';

import { useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { buttonClassName, type ButtonSize, type ButtonVariant } from '@/components/ui/Button';
import { LoginRequiredModal } from './LoginRequiredModal';
import type { LoginPrompt } from './login-prompts';

type LoginGateLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & {
  href: string;
  prompt: LoginPrompt;
  /** モーダルのボタンの下に添える補足 */
  note?: ReactNode;
  /** 指定するとボタンの見た目にする（LinkButton と同じ） */
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function LoginGateLink({ href, prompt, note, variant, size, className, onClick, children, ...rest }: LoginGateLinkProps) {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!loading && !user) {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <>
      <Link
        href={href}
        onClick={handleClick}
        className={variant || size ? buttonClassName(variant ?? 'secondary', size ?? 'md', className) : className}
        {...rest}
      >
        {children}
      </Link>
      <LoginRequiredModal open={open} onOpenChange={setOpen} prompt={prompt} next={href} note={note} />
    </>
  );
}
