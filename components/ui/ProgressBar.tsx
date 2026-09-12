/**
 * 視聴進捗バー（共通 デザイントークン仕様書 §6.4、YouTube準拠）。
 * 高さ 2px、未視聴 #333333、視聴済み #e03030。割合テキストは表示しない
 * （動画プレーヤー仕様書「右カラム進捗バー表示」）。
 */
import { cn } from './cn';

interface ProgressBarProps {
  /** 0〜max */
  value: number;
  max?: number;
  className?: string;
  /** スクリーンリーダー向けラベル */
  label?: string;
}

export function ProgressBar({ value, max = 100, className, label = '視聴進捗' }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      className={cn('h-[2px] w-full overflow-hidden rounded-[2px] bg-progress-track', className)}
    >
      <div className="h-full bg-progress-bar" style={{ width: `${percent}%` }} />
    </div>
  );
}
