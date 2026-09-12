/**
 * 空状態（共通 uiコンポーネント フロント 仕様書 §8）。
 * イメージ（アイコン）・メインメッセージ・サブメッセージ・アクションボタンを中央揃えで表示。
 * 上下 60px 以上のパディング（§8.4）。
 */
import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** アクションボタン（Button / LinkButton を渡す） */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-[60px] text-center', className)}>
      {icon && <div className="mb-4 text-text-muted [&>svg]:size-10">{icon}</div>}
      <p className="text-2xl font-medium text-text-primary">{title}</p>
      {description && <p className="mt-2 text-base text-text-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
