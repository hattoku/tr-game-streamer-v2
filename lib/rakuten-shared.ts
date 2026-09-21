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

// 楽天ブックスの商品名から、ゲームタイトル名として不要な特典・限定版表記を取り除く簡易正規化。
// 例: 「【楽天ブックス限定特典+特典】ゼルダの伝説 時のオカリナ(特典アイテム未定+【早期購入外付特典】…)」
//     → 「ゼルダの伝説 時のオカリナ」
// あくまでフォームの初期値用（管理者がそのまま編集できる）で、ページ ゲームタイトル 詳細 仕様書 §7が
// 想定するAIによる正規化案とは別物。判定に迷う括弧（「(通常版)」等）は残す
export function normalizeRakutenGameTitle(rakutenTitle: string): string {
  return (
    rakutenTitle
      // 【…】ブロック（限定特典・セット等の商品種別表記）は入れ子の有無に関わらず全て除去
      .replace(/【[^【】]*】/g, '')
      // 特典・同梱・付属の内容を列挙した丸括弧（全角/半角）を除去
      .replace(/[(（][^()（）]*(?:特典|同梱|付き|付属)[^()（）]*[)）]/g, '')
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
