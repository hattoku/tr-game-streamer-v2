/**
 * コンテンツエリアの幅制約（共通 ページレイアウト 仕様書 §3, §4）。
 * 最大幅 1400px・中央寄せ、モバイル（767px以下）は左右 16px。
 * PC の左右余白は仕様書に指定が無いため 24px とした。
 */
import type { ComponentProps } from 'react';
import { cn } from '../ui/cn';

export function PageContainer({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cn('mx-auto w-full max-w-[1400px] px-4 md:px-6', className)} {...rest} />;
}
