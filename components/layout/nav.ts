/**
 * ヘッダー・フッター・ボトムタブバーで共有するナビゲーション定義
 * （共通 uiコンポーネント フロント 仕様書 §2.4, §2.6, §2.7, §3.3）。
 * 遷移先の一部はフェーズ3以降で実装されるページ。未実装の間は 404 または準備中ページで受ける
 * （wiki/sources/2026-09-11-phase2.5-design-plan.md §4 ステップ2）。
 */

import { COLLECTIONS_ENABLED } from '@/lib/feature-flags';

/** まとめ（/collections）の項目。まとめ機能の取り下げ（2026-11-01、UI仕様書 v2.0）で COLLECTIONS_ENABLED が false の間は外す */
const COLLECTIONS_HREF = '/collections';
const withoutCollections = <T extends { href: string }>(items: T[]): T[] =>
  COLLECTIONS_ENABLED ? items : items.filter((item) => item.href !== COLLECTIONS_HREF);

export interface NavItem {
  label: string;
  href: string;
}

/** グローバルナビゲーション（PC、§2.4）。アクティブ判定は href のプレフィクス一致 */
// リブランディング段階5（UI仕様書 v2.1）でチャンネルを先頭にした
export const GLOBAL_NAV: NavItem[] = withoutCollections([
  { label: 'チャンネルから探す', href: '/channels' },
  { label: '再生リストを探す', href: '/playlists' },
  { label: 'ゲームから探す', href: '/games' },
  { label: 'まとめ', href: COLLECTIONS_HREF },
]);

/** ログイン済みユーザー向けリンク（PC、§2.6） */
export const USER_NAV: NavItem[] = [
  { label: 'マイリスト', href: '/mylist' },
  { label: '視聴履歴', href: '/history' },
];

/** フッター「サービス」グループ（§3.3）。モバイルの「さがす」タブ列（§2.7）も同じラベルを使う */
export const FOOTER_SERVICE_NAV: NavItem[] = withoutCollections([
  { label: 'チャンネル名から探す', href: '/channels' },
  { label: '再生リストを探す', href: '/playlists' },
  { label: 'ゲームタイトルから探す', href: '/games' },
  { label: 'まとめを探す', href: COLLECTIONS_HREF },
]);

/** モバイル「さがす」セクションのタブ列（§2.7）。2行ラベル: main を大きく、sub を小さく表示 */
export interface SearchTab {
  href: string;
  main: string;
  sub: string;
}

export const SEARCH_TABS: SearchTab[] = withoutCollections([
  { href: '/channels', main: 'チャンネル名', sub: 'から探す' },
  { href: '/playlists', main: '再生リスト', sub: 'を探す' },
  { href: '/games', main: 'ゲームタイトル', sub: 'から探す' },
  { href: COLLECTIONS_HREF, main: 'まとめ', sub: 'を探す' },
]);

/** 後方互換: フッターと同じ href 群 */
export const SEARCH_TAB_NAV: NavItem[] = FOOTER_SERVICE_NAV;

/** フッター「サポート」グループ（§3.3） */
export const FOOTER_SUPPORT_NAV: NavItem[] = [
  { label: '初めての方へ', href: '/about' },
  { label: '実況者・事務所の方へ', href: '/creators' },
  { label: 'お問い合わせ', href: '/contact' },
  { label: 'このサイトについて', href: '/site-info' },
];

/** フッター法的リンク（§3.3） */
export const FOOTER_LEGAL_NAV: NavItem[] = [
  { label: '利用規約', href: '/terms' },
  { label: 'プライバシーポリシー', href: '/privacy' },
];

/** TOPのキャッチコピーとフッターのサービス説明（ページ top 仕様書 §4.2 v2.2、UI仕様書 §3.2） */
export const SERVICE_TAGLINE = '人気のゲーム実況者のシリーズを、最初から・続きから。';
export const COPYRIGHT = '© 2026 発見&納得コミュニケーションズ';

/**
 * アカウント作成への導線。仕様上は `/signup` だが、専用ページはフェーズ3以降のため
 * 当面はログインページの新規登録モードへ送る（計画書 §7 項目2）。
 */
export const SIGNUP_HREF = '/login?mode=signup';

/** 現在のパスがナビ項目のプレフィクスに一致するか（§2.4 アクティブ判定） */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** ボトムタブバーのセクション（§2.7）。アクティブ判定のプレフィクスを持つ */
export type BottomTabKey = 'home' | 'mylist' | 'search' | 'mypage';

export interface BottomTab {
  key: BottomTabKey;
  label: string;
  /** ログイン済み時の遷移先 */
  href: string;
  /** 未ログイン時の遷移先（省略時は href と同じ） */
  guestHref?: string;
  /** アクティブ判定のプレフィクス */
  prefixes: string[];
}

export const BOTTOM_TABS: BottomTab[] = [
  { key: 'home', label: 'ホーム', href: '/', prefixes: [] },
  // マイリスト（2026-09-12 ユーザー決定で「タイムライン」を置き換え）。未ログイン時はログインページへ
  { key: 'mylist', label: 'マイリスト', href: '/mylist', guestHref: '/login', prefixes: ['/mylist'] },
  // 遷移先はチャンネル（UI仕様書 v2.0 §2.7、段階5で実装）
  { key: 'search', label: 'さがす', href: '/channels', prefixes: ['/channels', '/playlists', '/games', ...(COLLECTIONS_ENABLED ? [COLLECTIONS_HREF] : [])] },
  // 未ログイン時はアカウント作成フローへ（§2.7）
  // 遷移先は項目一覧のマイページ（2026-11-14 ユーザー決定、ページ マイページ 仕様書）。そこから辿る先のページを開いている間もアクティブにする
  {
    key: 'mypage',
    label: 'マイページ',
    href: '/mypage',
    guestHref: SIGNUP_HREF,
    prefixes: ['/mypage', '/history', '/notifications', '/playlists/proposals', '/contact/history', '/settings', '/profile'],
  },
];

export function activeBottomTab(pathname: string): BottomTabKey | null {
  if (pathname === '/') return 'home';
  // 一番長く一致したプレフィクスのタブにする（/playlists/proposals は「さがす」の /playlists ではなくマイページ）
  let best: { key: BottomTabKey; length: number } | null = null;
  for (const tab of BOTTOM_TABS) {
    for (const p of tab.prefixes) {
      if (isActivePath(pathname, p) && (!best || p.length > best.length)) best = { key: tab.key, length: p.length };
    }
  }
  return best?.key ?? null;
}

/** 「さがす」タブ列を出す一覧ページ（下層ページでは出さない、§2.7） */
export function isSearchListPage(pathname: string): boolean {
  return SEARCH_TAB_NAV.some((item) => item.href === pathname);
}
