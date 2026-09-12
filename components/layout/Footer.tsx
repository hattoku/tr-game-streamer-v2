/**
 * グローバルフッター（共通 uiコンポーネント フロント 仕様書 §3、デザイントークン仕様書 §14）。
 * ロゴ＋タグライン／サービス・サポートのリンク群／利用規約・プライバシーポリシー・コピーライト。
 * 認証ページ・初期設定フローでは表示しない（(auth) レイアウトには含めない）。
 * モバイル（767px以下）でも表示しない。同じリンク群と©はハンバーガーメニュー（MobileMenu）が担う（§3.5）。
 */
import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { COPYRIGHT, FOOTER_LEGAL_NAV, FOOTER_SERVICE_NAV, FOOTER_SUPPORT_NAV, SERVICE_TAGLINE, type NavItem } from './nav';

function LinkGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div>
      <p className="mb-3 text-md font-medium text-text-tertiary">{title}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-md text-text-muted transition-colors duration-[120ms] hover:text-text-primary">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-16 hidden border-t border-border-divider bg-bg-base md:block">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 md:px-6">
        <Logo />
        <p className="mt-2 text-md text-text-muted">{SERVICE_TAGLINE}</p>

        <div className="my-8 border-t border-border-divider" />

        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:max-w-[480px]">
          <LinkGroup title="サービス" items={FOOTER_SERVICE_NAV} />
          <LinkGroup title="サポート" items={FOOTER_SUPPORT_NAV} />
        </div>

        <div className="my-8 border-t border-border-divider" />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <ul className="flex flex-col gap-2 md:flex-row md:gap-5">
            {FOOTER_LEGAL_NAV.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-md text-text-muted transition-colors duration-[120ms] hover:text-text-primary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-md text-text-faint">{COPYRIGHT}</p>
        </div>
      </div>
    </footer>
  );
}
