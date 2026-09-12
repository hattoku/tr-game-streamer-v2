/**
 * className を結合する小さなヘルパー（clsx 等の依存を増やさないための自前実装）。
 * falsy な値は無視する。
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
