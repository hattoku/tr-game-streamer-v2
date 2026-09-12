/**
 * 500 Internal Server Error（共通 エラーページ 仕様書 §5）。
 * 配下のセグメントで発生した予期しない例外を受け止める（Next.js の error.tsx 規約、
 * Next 16 では再試行関数の prop 名が `retry`）。
 * ルートレイアウトのプロバイダは生きているため、ヘッダー・フッターは通常表示する（§2.5）。
 */
'use client';

import { useEffect } from 'react';
import { SiteFrame } from '@/components/layout/SiteFrame';
import { ErrorContent } from '@/components/layout/ErrorContent';
import { Button, LinkButton } from '@/components/ui/Button';
import { AlertIcon } from '@/components/ui/icons';

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SiteFrame>
      <ErrorContent
        icon={<AlertIcon />}
        code="500"
        title="エラーが発生しました"
        description={
          <>
            申し訳ありません。予期しないエラーが発生しました。
            <br />
            時間をおいて再度お試しください。
          </>
        }
        actions={
          <>
            <Button variant="primary" onClick={() => retry()}>
              再読み込み
            </Button>
            <LinkButton href="/" variant="secondary">
              TOPページへ戻る
            </LinkButton>
          </>
        }
      />
    </SiteFrame>
  );
}
