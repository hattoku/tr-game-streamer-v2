// 掲載状態の判定ルール（純粋な関数。巡回のサーバー処理と、確認画面の「判定の言葉」モーダルの両方から使う）。
// 管理_Ai運営者 コンテンツ収集機能仕様書 §10.4（判定の順）・§10.5（除外語・非ゲーム語）・§10.11（理由の値）。
// 言葉の表は app_settings/listing_rules（Firestore データモデル設計書 §3.28）。無いときは DEFAULT_LISTING_RULES を使う。
import { normalizeForMatch } from './exploration-rules';
import type { ListingStatus } from './listing';

export interface ListingRules {
  /** 除外語（`excluded` にする言葉。ゲーム実況だがシリーズとして扱わない） */
  excludedWords: string[];
  /** 非ゲーム語（`non_game` にする言葉） */
  nonGameWords: string[];
  /** これ未満は `too_short` */
  minVideoCount: number;
}

/** 初期値（§10.5。2026-11-01 ユーザーから一任されたたたき台＋段階3までの除外語） */
export const DEFAULT_LISTING_RULES: ListingRules = {
  excludedWords: [
    '単発', '切り抜き', 'まとめ動画', 'ダイジェスト', 'ハイライト', '名場面', 'ショート', 'Shorts', '#shorts',
    '配信アーカイブ', '生放送', 'メンバー限定', '告知', 'お知らせ',
  ],
  nonGameWords: [
    '雑談', '歌ってみた', '歌枠', '弾いてみた', '踊ってみた', '演奏', 'オリジナル曲', 'MV', 'Vlog', 'ブイログ', '料理',
    '食レポ', '食べてみた', '飲んでみた', '旅行', '開封', '買ってきた', 'ラジオ', '対談', 'ドッキリ', '大喜利', '実写',
    'くだらない', 'オフ会', '筋トレ', 'ASMR',
  ],
  minVideoCount: 10,
};

/** 言葉の表の上限（モーダルの入力と API の検証で共用） */
export const MAX_RULE_WORDS = 200;
export const MAX_RULE_WORD_LENGTH = 30;

/** 掲載方法（`exploration_channels.publishMode`）。無いものは確認してから掲載として扱う（既定。§10.2） */
export type PublishMode = 'confirm' | 'auto';

export function publishModeOf(data: { publishMode?: unknown } | undefined | null): PublishMode {
  return data?.publishMode === 'auto' ? 'auto' : 'confirm';
}

/** Firestore の値を言葉の表として読む（壊れた値は初期値に戻す） */
export function parseListingRules(data: Record<string, unknown> | undefined | null): ListingRules {
  const words = (value: unknown, fallback: string[]) =>
    Array.isArray(value) ? cleanWords(value.filter((v): v is string => typeof v === 'string')) : fallback;
  const min = data?.minVideoCount;
  return {
    excludedWords: words(data?.excludedWords, DEFAULT_LISTING_RULES.excludedWords),
    nonGameWords: words(data?.nonGameWords, DEFAULT_LISTING_RULES.nonGameWords),
    minVideoCount: typeof min === 'number' && Number.isInteger(min) && min >= 1 && min <= 100 ? min : DEFAULT_LISTING_RULES.minVideoCount,
  };
}

/** 前後の空白を落とし、照合できない（記号だけ等）・長すぎる・重複する言葉を除く */
export function cleanWords(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of words) {
    const word = raw.trim();
    const key = normalizeForMatch(word);
    if (!key || word.length > MAX_RULE_WORD_LENGTH || seen.has(key)) continue;
    seen.add(key);
    result.push(word);
  }
  return result.slice(0, MAX_RULE_WORDS);
}

function findWord(normalizedTitle: string, words: string[]): string | null {
  for (const word of words) {
    const key = normalizeForMatch(word);
    if (key && normalizedTitle.includes(key)) return word;
  }
  return null;
}

export interface ListingJudgement {
  status: ListingStatus;
  /** `listingReason`（§10.11） */
  reason: string;
}

/**
 * 新しく取り込んだ再生リストの掲載状態を決める（§10.4 の順。最初に当たったもの）。
 * 「自動で掲載」のチャンネルでルールに当たらなかったものは `listed` を返す。動画一覧を取ってから掲載にするのは呼び出し側
 * （巡回では `unconfirmed`＋`auto_pending` で作り、動画一覧を取り終えてから `listed` にする。§10.11）。
 */
export function judgeListing(playlist: { title: string; itemCount: number }, rules: ListingRules, mode: PublishMode): ListingJudgement {
  const title = normalizeForMatch(playlist.title);
  const excluded = findWord(title, rules.excludedWords);
  if (excluded) return { status: 'excluded', reason: `word:${excluded}` };
  const nonGame = findWord(title, rules.nonGameWords);
  if (nonGame) return { status: 'non_game', reason: `word:${nonGame}` };
  if (playlist.itemCount < rules.minVideoCount) return { status: 'too_short', reason: 'too_short' };
  return mode === 'auto' ? { status: 'listed', reason: 'auto' } : { status: 'unconfirmed', reason: 'confirm' };
}

/** 判定の理由の表示（収集候補レビューUI仕様書 §8.6） */
export function describeListingReason(params: {
  status: string;
  reason: string | null;
  setBy: string | null;
  videoCount: number;
  rules: ListingRules;
}): string {
  const { status, reason, videoCount } = params;
  if (reason?.startsWith('word:')) {
    const word = reason.slice('word:'.length);
    return status === 'non_game' ? `非ゲーム語「${word}」` : status === 'excluded' ? `除外語「${word}」` : `言葉「${word}」`;
  }
  switch (reason) {
    case 'too_short':
      return `${params.rules.minVideoCount}本未満（${videoCount}本）`;
    case 'confirm':
      return 'ルールに当たらず確認待ち';
    case 'auto_pending':
      return '自動で掲載する予定（動画の取得待ち）';
    case 'auto':
      return '自動で掲載';
    case 'candidate_rejected':
      return '収集候補で却下済み';
    case 'migration':
      return '移行で掲載';
    case 'channel_excluded':
      return 'チャンネルを掲載から外した';
    case 'opt_out':
      return 'チャンネルの掲載を止めた（本人の申し出）';
    case 'admin':
      return '管理者が決定';
    default:
      return reason ?? '';
  }
}
