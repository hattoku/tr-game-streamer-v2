// 掲載状態の判定ルール（lib/listing-rules.ts）。
// 管理_Ai運営者 コンテンツ収集機能仕様書 §10.4（判定の順）・§10.5（除外語・非ゲーム語）・§10.11（理由の値）。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LISTING_RULES,
  MAX_RULE_WORD_LENGTH,
  MAX_RULE_WORDS,
  cleanWords,
  describeListingReason,
  judgeListing,
  parseListingRules,
  publishModeOf,
  type ListingRules,
} from '@/lib/listing-rules';

const rules: ListingRules = { excludedWords: ['切り抜き', '単発'], nonGameWords: ['雑談', '歌ってみた'], minVideoCount: 10 };

describe('judgeListing（§10.4 の順で最初に当たったもの）', () => {
  it('除外語を含むと excluded（理由は word:<言葉>）', () => {
    expect(judgeListing({ title: '【切り抜き】名場面集', itemCount: 50 }, rules, 'confirm')).toEqual({
      status: 'excluded',
      reason: 'word:切り抜き',
    });
  });

  it('非ゲーム語を含むと non_game', () => {
    expect(judgeListing({ title: '深夜の雑談配信', itemCount: 50 }, rules, 'auto')).toEqual({ status: 'non_game', reason: 'word:雑談' });
  });

  it('除外語と非ゲーム語の両方を含むときは除外語が先', () => {
    expect(judgeListing({ title: '雑談 切り抜き', itemCount: 50 }, rules, 'confirm').status).toBe('excluded');
  });

  it('言葉の照合は全角・半角、大文字・小文字、空白・記号を無視する', () => {
    const r: ListingRules = { ...rules, excludedWords: ['Shorts'] };
    expect(judgeListing({ title: '＃ＳＨＯＲＴＳ まとめ', itemCount: 50 }, r, 'confirm').status).toBe('excluded');
    expect(judgeListing({ title: '歌って・みた', itemCount: 50 }, rules, 'confirm').status).toBe('non_game');
  });

  it('言葉に当たらず動画数が最小本数未満なら too_short（ちょうど最小本数は通る）', () => {
    expect(judgeListing({ title: 'ゼルダの伝説 実況', itemCount: 9 }, rules, 'auto')).toEqual({ status: 'too_short', reason: 'too_short' });
    expect(judgeListing({ title: 'ゼルダの伝説 実況', itemCount: 10 }, rules, 'auto').status).toBe('listed');
  });

  it('動画数が足りなくても言葉に当たればそちらが先', () => {
    expect(judgeListing({ title: '単発実況', itemCount: 1 }, rules, 'auto').status).toBe('excluded');
  });

  it('ルールに当たらなければ「自動で掲載」は listed（auto）、「確認してから掲載」は unconfirmed（confirm）', () => {
    const playlist = { title: 'マインクラフト 実況 Part1〜', itemCount: 30 };
    expect(judgeListing(playlist, rules, 'auto')).toEqual({ status: 'listed', reason: 'auto' });
    expect(judgeListing(playlist, rules, 'confirm')).toEqual({ status: 'unconfirmed', reason: 'confirm' });
  });

  it('初期値の言葉の表でも判定できる', () => {
    expect(judgeListing({ title: 'ASMR 囁き', itemCount: 30 }, DEFAULT_LISTING_RULES, 'auto').status).toBe('non_game');
    expect(judgeListing({ title: 'ダイジェスト版', itemCount: 30 }, DEFAULT_LISTING_RULES, 'auto').status).toBe('excluded');
  });
});

describe('publishModeOf（§10.2。無いものは確認してから掲載）', () => {
  it('auto だけが自動、それ以外は confirm', () => {
    expect(publishModeOf({ publishMode: 'auto' })).toBe('auto');
    expect(publishModeOf({ publishMode: 'confirm' })).toBe('confirm');
    expect(publishModeOf({ publishMode: 'something' })).toBe('confirm');
    expect(publishModeOf({})).toBe('confirm');
    expect(publishModeOf(null)).toBe('confirm');
    expect(publishModeOf(undefined)).toBe('confirm');
  });
});

describe('parseListingRules（壊れた値は初期値に戻す）', () => {
  it('データが無ければ初期値', () => {
    expect(parseListingRules(undefined)).toEqual(DEFAULT_LISTING_RULES);
    expect(parseListingRules(null)).toEqual(DEFAULT_LISTING_RULES);
  });

  it('配列でない言葉の表は初期値、配列なら文字列だけを使う', () => {
    const parsed = parseListingRules({ excludedWords: 'x', nonGameWords: ['料理', 1, null, '料理'] });
    expect(parsed.excludedWords).toEqual(DEFAULT_LISTING_RULES.excludedWords);
    expect(parsed.nonGameWords).toEqual(['料理']);
  });

  it('空の配列はそのまま空（言葉を全部消した状態）', () => {
    expect(parseListingRules({ excludedWords: [], nonGameWords: [] })).toMatchObject({ excludedWords: [], nonGameWords: [] });
  });

  it('最小本数は 1〜100 の整数だけ受け付ける', () => {
    expect(parseListingRules({ minVideoCount: 5 }).minVideoCount).toBe(5);
    expect(parseListingRules({ minVideoCount: 1 }).minVideoCount).toBe(1);
    expect(parseListingRules({ minVideoCount: 100 }).minVideoCount).toBe(100);
    for (const bad of [0, 101, 2.5, '5', null]) {
      expect(parseListingRules({ minVideoCount: bad }).minVideoCount).toBe(DEFAULT_LISTING_RULES.minVideoCount);
    }
  });
});

describe('cleanWords', () => {
  it('前後の空白を落とし、記号だけ・長すぎる・正規化して重複する言葉を除く', () => {
    expect(cleanWords([' 雑談 ', '！！', 'あ'.repeat(MAX_RULE_WORD_LENGTH + 1), 'ＭＶ', 'mv', '料理'])).toEqual(['雑談', 'ＭＶ', '料理']);
  });

  it(`最大 ${MAX_RULE_WORDS} 件に切る`, () => {
    const words = Array.from({ length: MAX_RULE_WORDS + 5 }, (_, i) => `言葉${i}`);
    expect(cleanWords(words)).toHaveLength(MAX_RULE_WORDS);
  });
});

describe('describeListingReason（収集候補レビューUI仕様書 §8.6）', () => {
  const base = { setBy: null, videoCount: 3, rules };

  it('言葉に当たった理由は種類ごとに言い分ける', () => {
    expect(describeListingReason({ ...base, status: 'non_game', reason: 'word:雑談' })).toBe('非ゲーム語「雑談」');
    expect(describeListingReason({ ...base, status: 'excluded', reason: 'word:単発' })).toBe('除外語「単発」');
    expect(describeListingReason({ ...base, status: 'listed', reason: 'word:単発' })).toBe('言葉「単発」');
  });

  it('本数が足りない理由は最小本数と実際の本数を出す', () => {
    expect(describeListingReason({ ...base, status: 'too_short', reason: 'too_short' })).toBe('10本未満（3本）');
  });

  it('決まった理由の値は日本語にし、知らない値はそのまま、無ければ空', () => {
    expect(describeListingReason({ ...base, status: 'unconfirmed', reason: 'confirm' })).toBe('ルールに当たらず確認待ち');
    expect(describeListingReason({ ...base, status: 'listed', reason: 'auto' })).toBe('自動で掲載');
    expect(describeListingReason({ ...base, status: 'channel_off', reason: 'opt_out' })).toBe('チャンネルの掲載を止めた（本人の申し出）');
    expect(describeListingReason({ ...base, status: 'listed', reason: 'unknown_reason' })).toBe('unknown_reason');
    expect(describeListingReason({ ...base, status: 'listed', reason: null })).toBe('');
  });
});
