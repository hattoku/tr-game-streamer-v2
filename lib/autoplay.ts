/**
 * ページ遷移後の自動再生（音声あり）が可能な環境かどうかの判定（マイリスト機能仕様書 §5.3）。
 *
 * WebKit 系（iOS / iPadOS の全ブラウザ、macOS の Safari）は、音声ありの再生を「ユーザー操作の
 * ハンドラ内で同期的に呼ばれた再生命令」にしか許可しない。マイリストのボタン押下 → ページ遷移 →
 * Firestore 読み込み → プレーヤー準備 の後では条件を満たせず、自動再生は必ずブロックされる
 * （2026-09-24 iOS Safari 実機で確認）。Chromium 系・Firefox はページ内遷移でもクリックの
 * ユーザー操作が引き継がれるため再生できる。
 * 判定は UA ベースの推定のため、誤判定で自動再生が失敗しても遷移先は通常の待機表示に戻る
 * （動画プレーヤー仕様書「自動再生」）。
 */
import { useSyncExternalStore } from 'react';

function detect(): boolean {
  const ua = navigator.userAgent;
  // iPadOS はデスクトップ版 Safari と同じ "Macintosh" の UA を名乗るため、タッチ点数で見分ける
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return false;
  const isDesktopSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|Android/.test(ua);
  return !isDesktopSafari;
}

const subscribe = () => () => {};

/** ページ遷移後に音声ありで自動再生できる見込みがあるか。サーバーレンダリング時は false（控えめな表示）を返す */
export function useCanAutoplayAfterNavigation(): boolean {
  return useSyncExternalStore(subscribe, detect, () => false);
}
