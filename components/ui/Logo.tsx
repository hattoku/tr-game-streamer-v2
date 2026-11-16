/**
 * サービスロゴ（共通 デザイントークン仕様書 v2.0 §8.2）。
 * ロゴマーク（アプリアイコン・起動スプラッシュと同じ赤い二重三角、背景透過の画像）＋ テキスト「プレミテ」（semibold）。
 * マーク画像 public/icons/logo-mark.png は scripts/generate-app-icons.mjs がアプリアイコンの元画像から書き出す。
 * ヘッダー・モバイルのドロワー・フッター・認証画面のロゴはすべてこのコンポーネントを使う。
 * ロゴのクリックで TOP へ遷移する（共通 uiコンポーネント フロント 仕様書 §2.3）。
 */
import Image from 'next/image';
import Link from 'next/link';
import { cn } from './cn';

/** ロゴマークの表示サイズ（px）。画像は光彩の余白込みの正方形で、三角そのものは約8割の大きさ */
const LOGO_MARK_SIZE = 30;

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <Link href="/" aria-label="プレミテ トップページ" className={cn('inline-flex items-center gap-1.5', className)}>
      <Image
        src="/icons/logo-mark.png"
        alt=""
        width={LOGO_MARK_SIZE}
        height={LOGO_MARK_SIZE}
        // 96px の小さな PNG をそのまま配る（最適化を通すと初回表示で画像APIの往復が増えるだけ）
        unoptimized
        loading="eager"
        className="shrink-0"
      />
      <span className="whitespace-nowrap text-xl font-semibold text-text-primary">プレミテ</span>
    </Link>
  );
}
