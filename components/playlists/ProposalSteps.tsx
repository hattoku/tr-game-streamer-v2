/**
 * 提案・申請のステップ表示「① 提案する → ② 運営が確認 → ③ さがすに公開」（共通 uiコンポーネント フロント 仕様書 §2.11、
 * ページ 再生リストを追加する 仕様書 §9）。提案画面（①）・完了画面（②）・提案履歴（提案ごとの状態）で使う。
 * 「いまここ」の文字は付けず、見た目だけで今の段がわかるようにする（v1.22）。
 * - 3つの丸を1本の線でつなぎ、済んだ区間の線を赤で塗る（配送状況のような進み具合の表示）
 * - 済んだ段は赤いチェック、今の段は赤い丸に光の輪（動きを減らす設定では輪を止める）、まだの段は灰色
 * - `current`: 今いる段（1〜3）。それより前の段は完了扱い。3（公開済み）は最後の段まで済んだ扱いで、全部チェックにする
 * - `rejected`: 見送り。②を警告色の×と「見送り」にして③は薄く、②→③の線は点線にする
 */
import { CheckIcon, XIcon } from '@/components/ui/icons';
import { cn } from '@/components/ui/cn';

const STEPS = ['提案する', '運営が確認', 'さがすに公開'] as const;
/** チャンネル申請のステップ表示（ページ チャンネルを申請する 仕様書 §4） */
export const CHANNEL_APPLICATION_STEPS = ['申請する', '運営が確認', 'チャンネルに公開'] as const;

type StepState = 'done' | 'current' | 'rejected' | 'upcoming';

export function ProposalSteps({
  current,
  rejected = false,
  className,
  labels = STEPS,
}: {
  current: 1 | 2 | 3;
  rejected?: boolean;
  className?: string;
  labels?: readonly [string, string, string];
}) {
  const finished = !rejected && current === 3;
  const stateOf = (step: number): StepState => {
    if (rejected) return step === 1 ? 'done' : step === 2 ? 'rejected' : 'upcoming';
    if (step < current || finished) return 'done';
    return step === current ? 'current' : 'upcoming';
  };
  // 線の区間（①→②、②→③）。済んだ区間は赤、見送りの①→②は灰色、見送り後の②→③は点線
  const segmentClass = (from: number) => {
    if (rejected) return from === 1 ? 'bg-text-muted' : 'border-t-2 border-dashed border-border-control bg-transparent';
    return from < current ? 'bg-progress-bar' : 'bg-progress-track';
  };

  return (
    <ol className={cn('relative grid grid-cols-3', className)} aria-label="提案から公開までの流れ" data-testid="proposal-steps">
      {/* 丸の中心どうしをつなぐ線（列の中央 1/6〜5/6）。丸の後ろに敷く */}
      <span aria-hidden className="pointer-events-none absolute inset-x-[16.667%] top-[13px] flex h-0.5">
        <span className={cn('h-full flex-1 rounded-l-full', segmentClass(1))} />
        <span className={cn('h-full flex-1 rounded-r-full', segmentClass(2))} />
      </span>
      {labels.map((label, i) => {
        const step = i + 1;
        const state = stateOf(step);
        const isLast = step === labels.length;
        return (
          <li
            key={label}
            className="relative flex min-w-0 flex-col items-center gap-1.5 text-center"
            aria-current={state === 'current' || state === 'rejected' ? 'step' : undefined}
            data-state={state}
          >
            <span className="relative flex size-7 shrink-0 items-center justify-center">
              {state === 'current' && (
                <span aria-hidden className="absolute inset-0 rounded-full bg-brand-primary/40 motion-safe:animate-ping" />
              )}
              <span
                className={cn(
                  'relative flex size-7 items-center justify-center rounded-full text-md font-semibold',
                  // 線が丸の下に透けないよう、薄い色の丸はカード地の色を下に敷く
                  state === 'current' && 'bg-gradient-primary text-white shadow-primary ring-4 ring-brand-primary/20',
                  state === 'done' &&
                    (finished && isLast
                      ? 'bg-gradient-primary text-white shadow-primary'
                      : 'bg-bg-card text-brand-primary shadow-[inset_0_0_0_1.5px_var(--color-brand-primary)]'),
                  state === 'rejected' && 'bg-bg-card text-input-error shadow-[inset_0_0_0_1.5px_var(--color-input-error)]',
                  state === 'upcoming' && 'bg-bg-btn text-text-muted',
                )}
              >
                {state === 'done' ? <CheckIcon size={14} /> : state === 'rejected' ? <XIcon size={14} /> : step}
              </span>
            </span>
            <span
              className={cn(
                'text-md leading-tight',
                state === 'current' && 'font-semibold text-text-primary',
                state === 'rejected' && 'font-semibold text-input-error',
                state === 'done' && (finished && isLast ? 'font-semibold text-text-primary' : 'text-text-secondary'),
                state === 'upcoming' && 'text-text-muted',
              )}
            >
              {state === 'rejected' ? '見送り' : label}
              {state === 'current' && <span className="sr-only">（現在の段階）</span>}
              {state === 'done' && <span className="sr-only">（完了）</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
