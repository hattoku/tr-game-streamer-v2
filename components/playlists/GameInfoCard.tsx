/**
 * ゲーム情報セクション（ページ 再生リスト詳細 仕様書「ゲーム情報セクション」）。
 * 右カラムが縦に伸びすぎないよう、パッケージ画像（小）を左、タイトル・ジャンル・テーマ・
 * 「楽天ブックスで見る ↗」を右に置く横並びコンパクト構成（v1.9、2026-09-26）。
 * タイトル・「このゲームの再生リストを見る ›」（カード幅いっぱいのセカンダリボタン、配信者カードと共通）はゲームタイトル詳細（/games/[gameId]）へ、
 * パッケージ画像・楽天ボタンは楽天ブックス（アフィリエイトリンク、別タブ）へ遷移する。
 * タグは閲覧のみ（編集はゲームタイトル詳細ページで行う）。
 */
import Link from 'next/link';
import { Card, CardTitle } from '@/components/ui/Card';
import { ExternalLinkButton, LinkButton } from '@/components/ui/Button';
import { ChevronRightIcon, InventoryIcon } from '@/components/ui/icons';
import { TagRow } from '@/components/tags/TagRow';
import { toRakutenAffiliateUrl } from '@/lib/rakuten-affiliate';
import type { ResolvedTag } from '@/lib/tags';

interface GameInfoCardProps {
  gameId: string;
  title: string;
  packageImageUrl: string | null;
  rakutenUrl: string | null;
  genreName: string;
  themeNames: string[];
  tags: ResolvedTag[];
}

export function GameInfoCard({ gameId, title, packageImageUrl, rakutenUrl, genreName, themeNames, tags }: GameInfoCardProps) {
  const href = `/games/${gameId}`;
  const affiliateUrl = rakutenUrl ? toRakutenAffiliateUrl(rakutenUrl) : null;

  // absolute化: 通常フローの子だと画像自身の縦横比がaspectコンテナの高さに影響してしまうため
  // （ゲームタイトル詳細ページのパッケージ画像と同じ実装）
  const packageImage = (
    <div className="relative aspect-[3/4] w-24 overflow-hidden rounded-[10px] bg-bg-btn">
      {packageImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={packageImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-text-muted">
          <InventoryIcon size={28} />
        </div>
      )}
    </div>
  );

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle className="text-md font-normal text-text-muted">ゲーム</CardTitle>
      <div className="flex gap-4">
        {affiliateUrl ? (
          <a href={affiliateUrl} target="_blank" rel="noopener noreferrer" aria-label={`${title}を楽天ブックスで見る`} className="shrink-0">
            {packageImage}
          </a>
        ) : (
          <div className="shrink-0">{packageImage}</div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link href={href} className="text-lg text-text-primary hover:text-text-secondary">
            <span className="line-clamp-2">{title}</span>
          </Link>
          {genreName && (
            <p className="text-base text-text-secondary">
              ジャンル：<span className="text-text-primary">{genreName}</span>
            </p>
          )}
          {themeNames.length > 0 && (
            <p className="text-base text-text-secondary">
              テーマ：<span className="text-text-primary">{themeNames.join(' / ')}</span>
            </p>
          )}
          {affiliateUrl && (
            <ExternalLinkButton href={affiliateUrl} variant="rakuten" size="sm" className="mt-2 self-start">
              楽天ブックスで見る ↗
            </ExternalLinkButton>
          )}
        </div>
      </div>
      <TagRow tags={tags} hrefForTag={(id) => `/games?tag=${encodeURIComponent(id)}`} />
      <LinkButton href={href} variant="secondary" size="full">
        このゲームの再生リストを見る
        <ChevronRightIcon size={14} />
      </LinkButton>
    </Card>
  );
}
