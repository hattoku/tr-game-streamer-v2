/**
 * 本文が未整備の静的ページ（/terms・/privacy・/about・/site-info）の暫定表示。
 * ページ自体は存在させ、フッター・登録フォームのリンクが404にならないようにする（フェーズ7ステップ7-1）。
 * 本文を整備したら、各 page.tsx からこの部品を外して本文に差し替える。
 */
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionHeading } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { InventoryIcon } from '@/components/ui/icons';

export function UnderConstruction({ title }: { title: string }) {
  return (
    <div>
      <SectionHeading className="mb-5">{title}</SectionHeading>
      <EmptyState
        icon={<InventoryIcon />}
        title="内容は工事中です"
        description="準備ができ次第、掲載します"
        action={
          <LinkButton href="/" variant="primary">
            TOPへ戻る
          </LinkButton>
        }
      />
    </div>
  );
}
