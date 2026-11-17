// 一覧のサーバー側検索の入力の読み方（lib/catalog-shared.ts）。共通 一覧のサーバー側検索 仕様書 §3・§4.1。
import { describe, expect, it } from 'vitest';
import {
  CATALOG_PAGE_SIZE,
  MAX_FILTER_IDS,
  MAX_KEYWORD_LENGTH,
  PLAYLIST_SORTS,
  latestVideoMillis,
  normalizeForSearch,
  paginate,
  parseEnum,
  parseIdList,
  parseKeyword,
  parsePage,
} from '@/lib/catalog-shared';

describe('normalizeForSearch（§4.1）', () => {
  it('全角・半角、大文字・小文字、カタカナ・ひらがなの違いを無視する', () => {
    expect(normalizeForSearch('ゼルダ')).toBe(normalizeForSearch('ぜるだ'));
    expect(normalizeForSearch('ＭＡＲＩＯ')).toBe('mario');
  });

  it('前後と連続する空白を詰める', () => {
    expect(normalizeForSearch('  マリオ　　カート ')).toBe('まりお かーと');
  });
});

describe('parseIdList', () => {
  it('カンマ区切りを読み、空・重複を除く', () => {
    expect(parseIdList('a, b,,a , c')).toEqual(['a', 'b', 'c']);
    expect(parseIdList(null)).toEqual([]);
    expect(parseIdList('')).toEqual([]);
  });

  it(`最大 ${MAX_FILTER_IDS} 件、長すぎる ID は捨てる`, () => {
    const many = Array.from({ length: MAX_FILTER_IDS + 3 }, (_, i) => `t${i}`).join(',');
    expect(parseIdList(many)).toHaveLength(MAX_FILTER_IDS);
    expect(parseIdList(`ok,${'x'.repeat(201)}`)).toEqual(['ok']);
  });
});

describe('parsePage / parseEnum / parseKeyword', () => {
  it('ページは1以上の整数、読めなければ1', () => {
    expect(parsePage('3')).toBe(3);
    for (const bad of ['0', '-1', '1.5', 'abc', null]) expect(parsePage(bad)).toBe(1);
  });

  it('並び順は決まった値だけ、それ以外は既定', () => {
    expect(parseEnum('mylist', PLAYLIST_SORTS, 'score')).toBe('mylist');
    expect(parseEnum('random', PLAYLIST_SORTS, 'score')).toBe('score');
    expect(parseEnum(null, PLAYLIST_SORTS, 'score')).toBe('score');
  });

  it(`キーワードは ${MAX_KEYWORD_LENGTH} 文字に切る`, () => {
    expect(parseKeyword('あ'.repeat(MAX_KEYWORD_LENGTH + 10))).toHaveLength(MAX_KEYWORD_LENGTH);
    expect(parseKeyword(null)).toBe('');
  });
});

describe('paginate', () => {
  const list = Array.from({ length: 45 }, (_, i) => i);

  it('1ページ分を切り出し、全件数とページ数を返す', () => {
    expect(paginate(list, 2)).toEqual({ items: list.slice(CATALOG_PAGE_SIZE, CATALOG_PAGE_SIZE * 2), total: 45, page: 2, pageCount: 3 });
  });

  it('範囲外のページは最後（または最初）に丸める', () => {
    expect(paginate(list, 99).page).toBe(3);
    expect(paginate(list, 99).items).toEqual(list.slice(40));
    expect(paginate(list, 0).page).toBe(1);
  });

  it('0件でもページ数は1', () => {
    expect(paginate([], 1)).toEqual({ items: [], total: 0, page: 1, pageCount: 1 });
  });
});

describe('latestVideoMillis（Timestamp と ISO 文字列の両方を読む）', () => {
  it('Timestamp（toMillis を持つもの）', () => {
    expect(latestVideoMillis({ toMillis: () => 1700000000000 })).toBe(1700000000000);
  });

  it('ISO 文字列', () => {
    expect(latestVideoMillis('2026-11-01T00:00:00Z')).toBe(Date.UTC(2026, 10, 1));
  });

  it('読めない値は null', () => {
    expect(latestVideoMillis('not a date')).toBeNull();
    expect(latestVideoMillis(null)).toBeNull();
    expect(latestVideoMillis(123)).toBeNull();
  });
});
