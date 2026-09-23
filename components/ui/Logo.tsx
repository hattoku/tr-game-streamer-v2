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
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <Link href="/" aria-label="プレミテ トップページ" className={cn('inline-flex items-center gap-2', className)}>
      <span
        className="inline-flex items-center justify-center rounded-[6px] bg-gradient-primary text-white shadow-logo"
        style={{ width: 26, height: 26 }}
      >
        <PlayIcon size={15} />
      </span>
      <span className="whitespace-nowrap text-xl font-semibold text-text-primary">プレミテ</span>
    </Link>
  );
}
