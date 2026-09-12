/**
 * エラーページ共通のコンテンツエリア（共通 エラーページ 仕様書 §2.2, §2.3）。
 * アイコン／エラーコード（大きめ）／タイトル／補足説明／アクションボタン を中央揃え、最大幅 600px。
 * エラーコードは「ブランドカラーまたはグレー系」の指定のうち、刺し色を限定する原則に従いグレー系。
 */
import type { ReactNode } from 'react';

interface ErrorContentProps {
  icon: ReactNode;
  code: string;
  title: string;
  description: ReactNode;
  actions: ReactNode;
}

export function ErrorContent({ icon, code, title, description, actions }: ErrorContentProps) {
  return (
    <div className="mx-auto flex max-w-[600px] flex-col items-center px-4 py-16 text-center md:py-24">
      <div className="mb-5 text-text-muted [&>svg]:size-12">{icon}</div>
      <p className="text-[48px] font-medium leading-none text-text-tertiary">{code}</p>
      <h1 className="mt-4 text-2xl font-medium text-text-primary">{title}</h1>
      <p className="mt-3 text-base text-text-muted">{description}</p>
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">{actions}</div>
    </div>
  );
}
