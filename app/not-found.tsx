/**
 * 404 Not Found（共通 エラーページ 仕様書 §3）。
 * 存在しないURL・削除済みコンテンツ（各ページの notFound() 呼び出し）で表示する。
 * ルート直下に置くためレイアウトはここで SiteFrame を組む（ヘッダー・フッター通常表示、§2.5）。
 */
import type { Metadata } from 'next';
import { SiteFrame } from '@/components/layout/SiteFrame';
import { ErrorContent } from '@/components/layout/ErrorContent';
import { LinkButton } from '@/components/ui/Button';
import { SearchIcon } from '@/components/ui/icons';

export const metadata: Metadata = {
  title: 'ページが見つかりません',
};

export default function NotFound() {
  return (
    <SiteFrame>
      <ErrorContent
        icon={<SearchIcon />}
        code="404"
        title="ページが見つかりません"
        description={
          <>
            お探しのページは存在しないか、削除された可能性があります。
            <br />
            URLをご確認の上、再度お試しください。
          </>
        }
        actions={
          <>
            <LinkButton href="/" variant="primary">
              TOPページへ戻る
            </LinkButton>
            <LinkButton href="/playlists" variant="secondary">
              再生リストを探す
            </LinkButton>
          </>
        }
      />
    </SiteFrame>
  );
}
