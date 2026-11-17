// コンテンツ収集の判定ルール（lib/playlist-title-rules.ts）。
// 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3.3（除外語）・§3.4（ゲームの推定）・§3.5（タイトル由来のタグ）。
import { describe, expect, it } from 'vitest';
import { extractGameQuery, findExcludeWord, guessGame, matchTitleTagNames, normalizeForMatch } from '@/lib/playlist-title-rules';

describe('normalizeForMatch（§3.4: NFKC・小文字化・空白と記号の除去）', () => {
  it('全角英数を半角に、大文字を小文字にし、空白と記号を落とす', () => {
    expect(normalizeForMatch('ＦＩＮＡＬ　Fantasy・VII！')).toBe('finalfantasyvii');
    expect(normalizeForMatch('【ゼルダの伝説】 #1')).toBe('ゼルダの伝説1');
  });

  it('記号だけなら空文字', () => {
    expect(normalizeForMatch('！？・ 　#')).toBe('');
  });
});

describe('findExcludeWord（§3.3）', () => {
  it('除外語を含むとその語を返す（表記ゆれは正規化して照合）', () => {
    expect(findExcludeWord('【切り抜き】面白シーン')).toBe('切り抜き');
    expect(findExcludeWord('#SHORTS 集')).toBe('shorts');
  });

  it('含まなければ null', () => {
    expect(findExcludeWord('バイオハザード4 初見実況')).toBeNull();
  });
});

describe('guessGame（§3.4: 最も長く一致した登録済みゲーム）', () => {
  const games = [
    { id: 'g1', title: 'ゼルダの伝説' },
    { id: 'g2', title: 'ゼルダの伝説 ティアーズ オブ ザ キングダム' },
    { id: 'g3', title: 'FF' },
    { id: 'g4', title: 'マリオカート8 デラックス' },
  ];

  it('複数当たるときは長く一致した方', () => {
    expect(guessGame('【ゼルダの伝説ティアーズオブザキングダム】初見実況 #1', games)?.id).toBe('g2');
  });

  it('短い方だけ当たるときは短い方', () => {
    expect(guessGame('ゼルダの伝説 ブレスオブザワイルド 実況', games)?.id).toBe('g1');
  });

  it('全角・半角や空白の違いを無視する', () => {
    expect(guessGame('マリオカート８デラックス 実況', games)?.id).toBe('g4');
  });

  it('正規化して2文字以下のゲーム名は誤一致を避けて使わない', () => {
    expect(guessGame('FF 実況プレイ', games)).toBeNull();
  });

  it('どれにも当たらなければ null', () => {
    expect(guessGame('スプラトゥーン3 実況', games)).toBeNull();
    expect(guessGame('何か', [])).toBeNull();
  });
});

describe('extractGameQuery（§3.4: 推定できなかったときの楽天検索語）', () => {
  it('括弧の中身を優先する', () => {
    expect(extractGameQuery('【バイオハザード RE:4】初見プレイ #1')).toBe('バイオハザード RE:4');
  });

  it('飾りの語だけの括弧は飛ばして次を使う', () => {
    expect(extractGameQuery('【ゆっくり実況】【スーパーマリオ オデッセイ】Part1')).toBe('スーパーマリオ オデッセイ');
  });

  it('括弧が無ければ #・Part・第N話 より前を使う', () => {
    expect(extractGameQuery('ポケモン スカーレット #1')).toBe('ポケモン スカーレット');
    expect(extractGameQuery('星のカービィ Part12')).toBe('星のカービィ');
    expect(extractGameQuery('ドラクエ11 第3話')).toBe('ドラクエ11');
  });

  it('飾りの語（実況プレイ等）を落とす', () => {
    expect(extractGameQuery('ホロウナイト 実況プレイ #5')).toBe('ホロウナイト');
  });

  it('50文字に切る', () => {
    expect(extractGameQuery('あ'.repeat(80))).toHaveLength(50);
  });
});

describe('matchTitleTagNames（§3.5）', () => {
  it('語句に対応するタグ名を、ルールの定義順・重複なしで返す', () => {
    expect(matchTitleTagNames('【初見】縛りプレイでRTA ゆっくり実況 初見')).toEqual(['初見プレイ', '縛りプレイ', 'RTA', 'ゆっくり']);
  });

  it('同じタグになる別の語句は1つにまとまる', () => {
    expect(matchTitleTagNames('2人で協力 コラボ実況')).toEqual(['協力プレイ', '複数人プレイ']);
  });

  it('当たらなければ空', () => {
    expect(matchTitleTagNames('ふつうの実況')).toEqual([]);
  });
});
