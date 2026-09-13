/**
 * 星評価（共通 信頼度スコアリングシステム仕様書 §6.2、
 * ページ 再生リスト レビュー投稿機能 仕様書「星評価」節）。
 * - readOnly: 表示専用。任意の小数値（再生リストスコアの加重平均等）を
 *   §6.2 のしきい値（0.0-0.24=空 / 0.25-0.74=半 / 0.75-1.0=満）で星に変換する。
 *   0.5刻みの実値（レビュー自身の星評価）でも同じロジックで自然に一致する。
 * - 入力モード（onChange指定時）: ★0.5刻み、ホバーで動的プレビュー、クリックで確定。
 *   選択済みの値に再度ホバー→クリックでキャンセル（吹き出し表示）。
 */
'use client';

import { useState } from 'react';
import { cn } from './cn';
import { StarIcon } from './icons';

interface StarRatingProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
  'aria-label'?: string;
}

function fillFractionFor(slot: number, displayValue: number): number {
  const diff = displayValue - (slot - 1);
  if (diff <= 0) return 0;
  if (diff >= 1) return 1;
  if (diff < 0.25) return 0;
  if (diff < 0.75) return 0.5;
  return 1;
}

export function StarRating({ value, onChange, size = 20, readOnly = false, className, ...rest }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const interactive = !readOnly && !!onChange;
  const displayValue = interactive ? hover ?? value ?? 0 : value ?? 0;
  const showCancelHint = interactive && hover != null && hover === value;

  function handlePick(picked: number) {
    if (!onChange) return;
    onChange(value === picked ? null : picked);
  }

  return (
    <div
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={rest['aria-label'] ?? (value != null ? `評価 ${value.toFixed(1)}` : '評価なし')}
      className={cn('inline-flex items-center gap-[2px] text-brand-score', className)}
      onMouseLeave={() => interactive && setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((slot) => {
        const fraction = fillFractionFor(slot, displayValue);
        const isCancelSlot = showCancelHint && Math.ceil(hover!) === slot;
        return (
          <span key={slot} className="relative inline-block" style={{ width: size, height: size }}>
            <StarIcon size={size} className="absolute inset-0 text-border-control" />
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fraction * 100}%` }}>
              <StarIcon size={size} />
            </span>
            {isCancelSlot && (
              <span
                role="status"
                className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[6px] border border-surface-border bg-gradient-elevated px-2 py-1 text-sm text-text-primary shadow-elevated"
              >
                キャンセル
              </span>
            )}
            {interactive && (
              <>
                <button
                  type="button"
                  aria-label={`★${slot - 0.5}`}
                  className="absolute inset-y-0 left-0 w-1/2"
                  onMouseEnter={() => setHover(slot - 0.5)}
                  onFocus={() => setHover(slot - 0.5)}
                  onClick={() => handlePick(slot - 0.5)}
                />
                <button
                  type="button"
                  aria-label={`★${slot}`}
                  className="absolute inset-y-0 right-0 w-1/2"
                  onMouseEnter={() => setHover(slot)}
                  onFocus={() => setHover(slot)}
                  onClick={() => handlePick(slot)}
                />
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
