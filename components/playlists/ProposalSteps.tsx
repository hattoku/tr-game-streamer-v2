/**
 * 再生リスト提案のステップ表示「① 提案する → ② 運営が確認 → ③ さがすに公開」（共通 uiコンポーネント フロント 仕様書 §2.11、
 * ページ 再生リストを追加する 仕様書 §9）。提案画面（①）・完了画面（②いまここ）・提案履歴（提案ごとの状態）で使う。
 * - `current`: 今いる段（1〜3）。それより前の段は完了扱い（チェック）
 * - `rejected`: 見送り。②を警告色の「見送り」にして③は薄く出す
 * - `hereLabel`: 今いる段の下に「いまここ」を付ける
 */
import { CheckIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

const STEPS = ['提案する', '運営が確認', 'さがすに公開'] as const;

export function ProposalSteps({
  current,
  rejected = false,
  hereLabel = false,
  className,
}: {
  current: 1 | 2 | 3;
  rejected?: boolean;
  hereLabel?: boolean;
  className?: string;
}) {
  return (
    <ol className={cn('flex items-start', className)} aria-label="提案から公開までの流れ">
      {STEPS.map((label, i) => {
        const step = i + 1;
        const isRejectedStep = rejected && step === 2;
        const done = !isRejectedStep && step < current;
        const active = !rejected && step === current;
        const muted = rejected ? step === 3 : step > current;
        return (
          <li key={label} className="flex flex-1 items-start" aria-current={active || isRejectedStep ? 'step' : undefined}>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full text-md font-semibold',
                  active && 'bg-gradient-primary text-white shadow-primary',
                  done && 'bg-bg-selected text-toast-success',
                  isRejectedStep && 'bg-bg-selected text-input-error',
                  muted && 'bg-bg-btn text-text-muted',
                )}
              >
                {done ? <CheckIcon size={14} /> : isRejectedStep ? <XIcon size={14} /> : step}
              </span>
              <span
                className={cn(
                  'text-md leading-tight',
                  active ? 'font-semibold text-text-primary' : isRejectedStep ? 'font-semibold text-input-error' : done ? 'text-text-secondary' : 'text-text-muted',
                )}
              >
                {isRejectedStep ? '見送り' : label}
              </span>
              {hereLabel && (active || isRejectedStep) && <span className="text-xs text-text-tertiary">いまここ</span>}
            </div>
            {step < STEPS.length && (
              <span
                aria-hidden
                className={cn('mt-[13px] h-px w-4 shrink-0 sm:w-8', step < current && !rejected ? 'bg-text-tertiary' : 'bg-border-divider')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
