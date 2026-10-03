/**
 * 再生リスト詳細ページのキーボードショートカット（動画プレーヤー仕様書「キーボード操作」）。
 * YouTube の動画ページのショートカットに合わせ、IFrame API で実現できるものだけを扱う。
 * プレーヤー（iframe）内にフォーカスがある間は keydown が親ページに届かないため、
 * YouTube 自身のショートカットが効き、ここでの処理とは二重にならない。
 */
'use client';

import { useEffect, useRef } from 'react';

export type ShortcutAction =
  | { type: 'togglePlay' }
  | { type: 'seekBy'; seconds: number }
  | { type: 'seekToFraction'; fraction: number }
  | { type: 'volumeBy'; delta: number }
  | { type: 'toggleMute' }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'fullscreen' }
  | { type: 'theater' }
  | { type: 'help' };

/**
 * ショートカット一覧モーダルの表示用（キー判定は resolveAction で行う）。
 * keys は「どれか1つを押す」の並び。'Shift+N' のような '+' 区切りは同時押し
 */
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['Space', 'K'], label: '再生 / 一時停止' },
  { keys: ['J'], label: '10秒戻す' },
  { keys: ['L'], label: '10秒進める' },
  { keys: ['←'], label: '5秒戻す' },
  { keys: ['→'], label: '5秒進める' },
  { keys: ['↑'], label: '音量を上げる' },
  { keys: ['↓'], label: '音量を下げる' },
  { keys: ['M'], label: 'ミュート / ミュート解除' },
  { keys: ['0〜9'], label: '動画の 0%〜90% の位置へ移動' },
  { keys: ['Home'], label: '先頭へ移動' },
  { keys: ['End'], label: '末尾へ移動' },
  { keys: ['Shift+N'], label: '次の動画' },
  { keys: ['Shift+P'], label: '前の動画' },
  { keys: ['F'], label: '全画面表示 / 解除' },
  { keys: ['T'], label: 'シアターモード / 解除' },
  { keys: ['?'], label: 'ショートカット一覧を表示' },
];

// 押しっぱなし（キーリピート）で連続して効かせるキー。それ以外はリピートを無視する
const REPEATABLE = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'j', 'l']);

function resolveAction(e: KeyboardEvent): ShortcutAction | null {
  // Shift+/ は配列によらず e.key が '?' になる
  if (e.key === '?') return { type: 'help' };
  const key = e.key.toLowerCase();
  if (e.shiftKey) {
    if (key === 'n') return { type: 'next' };
    if (key === 'p') return { type: 'prev' };
    return null;
  }
  switch (key) {
    case ' ':
    case 'k':
      return { type: 'togglePlay' };
    case 'j':
      return { type: 'seekBy', seconds: -10 };
    case 'l':
      return { type: 'seekBy', seconds: 10 };
    case 'arrowleft':
      return { type: 'seekBy', seconds: -5 };
    case 'arrowright':
      return { type: 'seekBy', seconds: 5 };
    case 'arrowup':
      return { type: 'volumeBy', delta: 5 };
    case 'arrowdown':
      return { type: 'volumeBy', delta: -5 };
    case 'm':
      return { type: 'toggleMute' };
    case 'home':
      return { type: 'seekToFraction', fraction: 0 };
    case 'end':
      return { type: 'seekToFraction', fraction: 1 };
    case 'f':
      return { type: 'fullscreen' };
    case 't':
      return { type: 'theater' };
  }
  // 0〜9（テンキーも NumLock 時は e.key が数字になる）
  if (/^[0-9]$/.test(key)) return { type: 'seekToFraction', fraction: Number(key) / 10 };
  return null;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.closest('input, textarea, select') !== null;
}

/**
 * `onKey` が true を返したら（＝ショートカットとして処理したら）既定動作を止める。
 * ボタンにフォーカスが残っていても Space はボタンの起動ではなく再生/一時停止として扱う（YouTube と同じ）。
 */
export function usePlayerShortcuts({ enabled, onKey }: { enabled: boolean; onKey: (action: ShortcutAction) => boolean }) {
  // ハンドラはレンダーごとに変わるため最新を ref に入れ、リスナーは一度だけ登録する
  const onKeyRef = useRef(onKey);
  useEffect(() => {
    onKeyRef.current = onKey;
  });

  useEffect(() => {
    if (!enabled) return;
    // Space で再生/一時停止したか。Firefox はボタンの Space 起動を keyup で行うため、keyup 側でも止める
    let spaceHandled = false;
    const keyupHandler = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !spaceHandled) return;
      spaceHandled = false;
      e.preventDefault();
    };
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' && !e.repeat) spaceHandled = false;
      if (e.defaultPrevented || e.isComposing) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target)) return;
      // モーダル・メニューが開いている間は効かせない（Radix はポータルに出すため、フォーカス位置ではなく存在で判定）。
      // 閉じるアニメーション中も DOM に残るため data-state="open" のものだけを見る（閉じた直後のキーを取りこぼさない）
      if (document.querySelector(':is([role="dialog"], [role="alertdialog"], [role="menu"])[data-state="open"]')) return;
      const action = resolveAction(e);
      if (!action) return;
      if (e.repeat && !REPEATABLE.has(e.key.toLowerCase())) {
        // 押しっぱなしの Space でページがスクロールしないよう、直前に再生/一時停止として処理した場合だけ止める。
        // それ以外（再生開始前の Home/End など）は既定動作をそのまま通す
        if (e.key === ' ' && spaceHandled) e.preventDefault();
        return;
      }
      if (onKeyRef.current(action)) {
        e.preventDefault();
        if (e.key === ' ') spaceHandled = true;
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('keyup', keyupHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('keyup', keyupHandler);
    };
  }, [enabled]);
}
