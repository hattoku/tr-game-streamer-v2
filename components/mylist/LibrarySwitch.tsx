/**
 * マイリスト（/mylist）と視聴履歴（/history）の見出しを兼ねた切り替え
 * （ページ マイリスト機能仕様書 §2.4、ページ 視聴履歴 仕様書 §2.4）。
 * 「マイリスト　視聴履歴」を見出しの大きさで並べ、開いているページを白（h1）、もう片方を薄い色のリンクにする。
 * ページは2つのまま（URL・戻るボタン・各ページの絞り込みはそのまま）で、1タップで行き来できるようにする。
 * スマホ下タブはどちらのページでも「マイリスト」をアクティブにする（components/layout/nav.ts の BOTTOM_TABS）。
 */
import Link from 'next/link';
import { cn } from '@/components/ui/cn';

type LibraryView = 'mylist' | 'history';

const ITEMS: Array<{ key: LibraryView; label: string; href: string }> = [
  { key: 'mylist', label: 'マイリスト', href: '/mylist' },
  { key: 'history', label: '視聴履歴', href: '/history' },
];

export function LibrarySwitch({ current, className }: { current: LibraryView; className?: string }) {
  return (
    <nav aria-label="マイリストと視聴履歴の切り替え" className={cn('flex items-baseline gap-5', className)}>
      {ITEMS.map((item) =>
        item.key === current ? (
          <h1 key={item.key} aria-current="page" className="text-heading font-bold text-text-primary">
            {item.label}
          </h1>
        ) : (
          <Link
            key={item.key}
            href={item.href}
            className="text-heading font-bold text-text-muted transition-colors duration-[120ms] hover:text-text-secondary"
          >
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
