// 楽天ブックスの商品とゲーム名の照合（lib/rakuten-shared.ts の matchRakutenItem）と、ゲーム名の抜き出し（extractGameQuery）。
// 管理 AI運営者向け収集候補レビューUI仕様書 v2.3 §3.7 の確認項目。画面を使わない（関数を直接呼ぶ）。
import { expect, test } from '@playwright/test';
import { extractGameQuery } from '../lib/exploration-rules';
import { matchRakutenItem } from '../lib/rakuten-shared';

const pick = (gameTitle: string, ...titles: string[]) => matchRakutenItem(titles.map((title) => ({ title })), gameTitle)?.title ?? null;

test('§3.7 名前が完全に一致する商品を選ぶ（版・機種・特典・空白・全角半角は無視）', () => {
  expect(pick('ソングオブホラー', 'ソング オブ ホラー')).toBe('ソング オブ ホラー');
  expect(pick('野狗子: Slitterhead', '【特典】野狗子: Slitterhead PS5版')).toBe('【特典】野狗子: Slitterhead PS5版');
  // 完全一致を、ゲーム名で始まる商品より優先する
  expect(pick('ポピープレイタイム', 'ポピープレイタイム トリプルパック　Switch版', 'ポピープレイタイム')).toBe('ポピープレイタイム');
});

test('§3.7 ゲーム名で始まり、付け足し（パック・カタカナ読み・the Best）が続く商品も選ぶ', () => {
  expect(pick('ポピープレイタイム', 'ポピープレイタイム トリプルパック　Switch版')).toBe('ポピープレイタイム トリプルパック　Switch版');
  expect(pick('零~刺青の聲~', '零 ～刺青の聲～ PlayStation2 the Best')).toBe('零 ～刺青の聲～ PlayStation2 the Best');
  const callisto = '【特典】The Callisto Protocol （カリストプロトコル） PS4版【予約外付特典】クリアファイル+【予約同梱特典】DLC「レトロな囚人キャラクター&武器用スキン/密輸ア…';
  expect(pick('The Callisto Protocol', callisto)).toBe(callisto);
  // 並び順（楽天の関連度順）で最初の1件
  expect(pick('ポピープレイタイム', 'ポピープレイタイム トリプルパック　PS5版', 'ポピープレイタイム トリプルパック　Switch版')).toBe('ポピープレイタイム トリプルパック　PS5版');
});

test('§3.7 続編・別の作品（数字・RE:2・ローマ数字）や、短いゲーム名は、前方一致で選ばない', () => {
  expect(pick('デッドライジング', 'デッドライジング2')).toBeNull();
  expect(pick('バイオハザード', 'バイオハザード RE:2')).toBeNull();
  expect(pick('ファイナルファンタジー', 'ファイナルファンタジー VII リメイク')).toBeNull();
  expect(pick('零', '零 ～刺青の聲～')).toBeNull();
});

test('§3.4 ゲーム名の末尾の長音「ー」は落とさない（ソングオブホラー → ソングオブホラ にしない）', () => {
  expect(extractGameQuery('ソングオブホラー')).toBe('ソングオブホラー');
  expect(extractGameQuery('【バイオハザード ヴィレッジ】ホラー')).toBe('バイオハザード ヴィレッジ');
});
