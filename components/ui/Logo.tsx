/**
 * サービスロゴ（共通 デザイントークン仕様書 v2.0 §8.2）。
 * ブランド赤のグラデーション面＋影の 26px 角丸四角に白い再生三角 ＋ テキスト「プレミテ」（semibold）。
 * 将来は画像ロゴに置き換える予定（同仕様書の記述どおり）。
 * ロゴのクリックで TOP へ遷移する（共通 uiコンポーネント フロント 仕様書 §2.3）。
 */
import Link from 'next/link';
import { PlayIcon } from './icons';
import { cn } from './cn';

interface LogoProps {
  /** シアターモード時など縮小表示する場合 true */
  compact?: boolean;
  className?: string;
}

export function Logo({ compact = false, className }: LogoProps) {
  const box = compact ? 18 : 26;
  return (
    <Link href="/" aria-label="プレミテ トップページ" className={cn('inline-flex items-center gap-2', className)}>
      <span
        className="inline-flex items-center justify-center rounded-[6px] bg-gradient-primary text-white shadow-logo"
        style={{ width: box, height: box }}
      >
        <PlayIcon size={compact ? 11 : 15} />
      </span>
      <span className={cn('font-semibold text-text-primary', compact ? 'text-base' : 'text-xl')}>プレミテ</span>
    </Link>
  );
}
