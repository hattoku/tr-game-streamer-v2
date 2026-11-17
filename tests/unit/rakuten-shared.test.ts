// 楽天ブックス連携の純粋な関数（lib/rakuten-shared.ts）。
// 管理 マスタ管理仕様書 §7.1（商品名の簡易正規化）、収集候補レビューUI仕様書 v2.3 §3.7（商品の照合）。
import { describe, expect, it } from 'vitest';
import { matchRakutenItem, normalizeRakutenBooksItemUrl, normalizeRakutenGameTitle, toMasterThemeName } from '@/lib/rakuten-shared';

describe('normalizeRakutenBooksItemUrl', () => {
  it('商品ページのURLは計測パラメータを外し、末尾スラッシュ付きの形にする', () => {
    expect(normalizeRakutenBooksItemUrl('https://books.rakuten.co.jp/rb/17654321/?l-id=search')).toBe('https://books.rakuten.co.jp/rb/17654321/');
    expect(normalizeRakutenBooksItemUrl(' http://books.rakuten.co.jp/rb/123 ')).toBe('https://books.rakuten.co.jp/rb/123/');
  });

  it('楽天ブックスの商品ページ以外は null', () => {
    expect(normalizeRakutenBooksItemUrl('https://item.rakuten.co.jp/rb/123/')).toBeNull();
    expect(normalizeRakutenBooksItemUrl('https://books.rakuten.co.jp/search?g=006')).toBeNull();
    expect(normalizeRakutenBooksItemUrl('ftp://books.rakuten.co.jp/rb/123/')).toBeNull();
    expect(normalizeRakutenBooksItemUrl('ゼルダ')).toBeNull();
  });
});

describe('normalizeRakutenGameTitle（§7.1: 特典・版・機種の表記を外す）', () => {
  it('【】の特典表記と、特典を並べた丸括弧を外す', () => {
    expect(normalizeRakutenGameTitle('【楽天ブックス限定特典+特典】ゼルダの伝説 時のオカリナ(特典アイテム未定+【早期購入外付特典】)')).toBe(
      'ゼルダの伝説 時のオカリナ',
    );
  });

  it('版と機種の表記を外す', () => {
    expect(normalizeRakutenGameTitle('大乱闘スマッシュブラザーズ SPECIAL 通常版 [Nintendo Switch]')).toBe('大乱闘スマッシュブラザーズ SPECIAL');
    expect(normalizeRakutenGameTitle('ELDEN RING PS5版')).toBe('ELDEN RING');
    expect(normalizeRakutenGameTitle('ペルソナ5 ザ・ロイヤル (限定版)')).toBe('ペルソナ5 ザ・ロイヤル');
  });

  it('表記が無ければそのまま', () => {
    expect(normalizeRakutenGameTitle('ポケットモンスター スカーレット')).toBe('ポケットモンスター スカーレット');
  });
});

describe('matchRakutenItem（§3.7: ゲーム名の商品とみなせるもの）', () => {
  it('版・機種を外した商品名がゲーム名と同じものを選ぶ（表記ゆれは無視）', () => {
    const items = [{ title: 'ゼルダの伝説 攻略本' }, { title: 'ゼルダの伝説 通常版 [Nintendo Switch]' }];
    expect(matchRakutenItem(items, 'ゼルダの伝説')).toBe(items[1]);
  });

  it('完全一致が無ければ、ゲーム名で始まり付け足しが続く商品', () => {
    const items = [{ title: 'デッドライジング トリプルパック' }];
    expect(matchRakutenItem(items, 'デッドライジング')).toBe(items[0]);
  });

  it('続きが数字・英字＋数字・ローマ数字なら別の作品として選ばない', () => {
    expect(matchRakutenItem([{ title: 'デッドライジング2' }], 'デッドライジング')).toBeNull();
    expect(matchRakutenItem([{ title: 'バイオハザード RE:2' }], 'バイオハザード')).toBeNull();
    expect(matchRakutenItem([{ title: 'ファイナルファンタジー VII' }], 'ファイナルファンタジー')).toBeNull();
  });

  it('ゲーム名が4文字未満なら前方一致は使わない', () => {
    expect(matchRakutenItem([{ title: 'MOTHER オリジナルサウンド' }], 'MOT')).toBeNull();
  });

  it('ゲーム名が空なら null', () => {
    expect(matchRakutenItem([{ title: 'ゼルダ' }], '・・')).toBeNull();
  });
});

describe('toMasterThemeName', () => {
  it('別名にしているテーマだけ置き換える', () => {
    expect(toMasterThemeName('アドベンチャー')).toBe('アドベンチャー（一般）');
    expect(toMasterThemeName('ホラー')).toBe('ホラー');
  });
});
