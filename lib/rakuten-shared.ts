// 楽天ブックス連携のうち、秘密情報に触れない純粋関数（クライアント/サーバー共用）。
// 商品ページURLの検証・正規化、商品名の簡易正規化、マスタ名称への変換。
//
// lib/rakuten.ts（サーバー専用。RAKUTEN_APPLICATION_ID等を参照する）から切り離しているのは、
// GameCreateModal（クライアント）でも入力URLの妥当性判定に使うため。秘密情報には一切触れない。

// 楽天ブックスの商品ページURL（https://books.rakuten.co.jp/rb/<商品番号>/ 形式。末尾スラッシュや
// `?l-id=...` 等の計測パラメータの有無は問わない）を検証し、計測パラメータを除いた正規形を返す。
// 該当しないURLならnull
export function normalizeRakutenBooksItemUrl(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (parsed.hostname !== 'books.rakuten.co.jp') return null;
  const match = parsed.pathname.match(/^\/rb\/(\d+)\/?$/);
  if (!match) return null;
  return `https://books.rakuten.co.jp/rb/${match[1]}/`;
}

// 楽天ブックスの商品名から、ゲームタイトル名として不要な特典・限定版・版・機種の表記を取り除く簡易正規化。
// 例: 「【楽天ブックス限定特典+特典】ゼルダの伝説 時のオカリナ(特典アイテム未定+【早期購入外付特典】…)」
//     → 「ゼルダの伝説 時のオカリナ」
//     「大乱闘スマッシュブラザーズ SPECIAL 通常版 [Nintendo Switch]」→「大乱闘スマッシュブラザーズ SPECIAL」
// あくまでフォームの初期値用（管理者がそのまま編集でき、元の商品名も並べて見せる）で、ページ ゲームタイトル 詳細 仕様書 §7が
// 想定するAIによる正規化案とは別物。プレミテは機種違いを1つのゲームとして扱い機種は別欄で持つため、
// 版（「通常版」「Switch版」「限定版」等）と機種名も削る（2026-10-25、管理 マスタ管理仕様書 §7.1 v2.9）
const PLATFORM_WORDS = [
  'Nintendo Switch 2',
  'Nintendo Switch',
  'ニンテンドースイッチ',
  'Switch2',
  'Switch',
  'ニンテンドー3DS',
  'ニンテンドーDS',
  '3DS',
  'Wii U',
  'PlayStation ?5',
  'PlayStation ?4',
  'PlayStation Vita',
  'PS5',
  'PS4',
  'PS3',
  'PS Vita',
  'PSVita',
  'Xbox Series X\\|S',
  'Xbox Series X',
  'Xbox One',
];
const PLATFORM_PATTERN = PLATFORM_WORDS.join('|');

export function normalizeRakutenGameTitle(rakutenTitle: string): string {
  return (
    rakutenTitle
      .normalize('NFKC')
      // 【…】ブロック（限定特典・セット等の商品種別表記）は入れ子の有無に関わらず全て除去
      .replace(/【[^【】]*】/g, '')
      // 特典・同梱・付属の内容を列挙した丸括弧を除去
      .replace(/\([^()]*(?:特典|同梱|付き|付属)[^()]*\)/g, '')
      // 角括弧・山括弧の注記（[Nintendo Switch] 等）は中身を問わず除去
      .replace(/\[[^\[\]]*\]|<[^<>]*>|〔[^〔〕]*〕/g, '')
      // 版の表記（丸括弧つき・単独とも）: 通常版・限定版・Switch版・ダウンロード版 など
      .replace(/\(([^()]*版|[^()]*エディション|[^()]*Edition)\)/gi, '')
      .replace(new RegExp(`(?:${PLATFORM_PATTERN})\\s*版`, 'gi'), '')
      .replace(/(?:通常|限定|初回限定|初回|特装|豪華|数量限定|ダウンロード|パッケージ|廉価|ベスト価格)版/g, '')
      // 機種名（単独の語として末尾・先頭に付いているもの）
      .replace(new RegExp(`(?:^|\\s|-|/)(?:${PLATFORM_PATTERN})(?=$|\\s|-|/)`, 'gi'), ' ')
      .replace(/\(\s*\)/g, '')
      .replace(/[\s\-/／・]+$/g, '')
      .replace(/^[\s\-/／・]+/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// 楽天ブックスのテーマ名のうち、プレミテのthemesマスタ（document/master/ゲームジャンル・テーママスタ
// 初期データ.md）で別名にしているもの。ジャンル名・その他のテーマ名は楽天と同一
const THEME_NAME_ALIASES: Record<string, string> = {
  アドベンチャー: 'アドベンチャー（一般）',
};

// 楽天ブックスのテーマ名をthemesマスタの名称に変換する
export function toMasterThemeName(rakutenThemeName: string): string {
  return THEME_NAME_ALIASES[rakutenThemeName] ?? rakutenThemeName;
}
