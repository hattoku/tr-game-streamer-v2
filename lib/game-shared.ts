// ゲームタイトルまわりでクライアントとサーバーが共有する定数・純粋関数
// （ページ 再生リストを追加する 仕様書 §9.2、管理 マスタ管理仕様書 §7.1）。
// firebase-admin・楽天APIのキーには触れないこと（クライアントからも読むため）。

// 楽天ブックスのゲーム機種一覧（表記も楽天の`hardware`値に合わせ、商品情報からの自動セットが
// そのまま照合できるようにする）＋テストデータで実績のあるSteam。メーカー別に並べて探しやすくする。
// 自由入力ではなく固定候補にして手入力表記のブレを防ぐ（2026-09-22、5機種から拡充）
export const PLATFORM_OPTIONS = [
  'Nintendo Switch',
  'Nintendo Switch 2',
  'Wii U',
  'Wii',
  'ニンテンドー3DS',
  'ニンテンドーDS',
  'PS5',
  'PS4',
  'PS3',
  'PS2',
  'PS Vita',
  'PSP',
  'Xbox Series X',
  'Xbox One',
  'Xbox 360',
  'Steam',
  'おもちゃ',
  'その他',
];

/** 別名（games.aliases）の上限（マスタ管理仕様書 §7.1 v2.9） */
export const MAX_GAME_ALIASES = 10;
export const MAX_GAME_ALIAS_LENGTH = 50;

/** カンマ・読点・改行区切りの入力を別名の配列にする（空・重複・長すぎるものは落とし、上限件数で切る） */
export function parseAliases(input: unknown): string[] {
  const raw = Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,、，\n]/) : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const alias = v.trim();
    if (!alias || alias.length > MAX_GAME_ALIAS_LENGTH || seen.has(alias)) continue;
    seen.add(alias);
    result.push(alias);
    if (result.length >= MAX_GAME_ALIASES) break;
  }
  return result;
}

/**
 * 検索照合用の正規化: 全角半角（NFKC）・大文字小文字・カタカナ→ひらがな・空白と記号の違いを無視する。
 * 「スマブラ」「すまぶら」「ｽﾏﾌﾞﾗ」を同じものとして扱うため
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\p{P}\p{S}ー]/gu, '');
}

/** ゲームタイトル（タイトル名＋別名）が検索語に部分一致するか */
export function matchesGameQuery(game: { title: string; aliases?: string[] }, query: string): boolean {
  const q = normalizeForSearch(query);
  if (!q) return true;
  return [game.title, ...(game.aliases ?? [])].some((name) => normalizeForSearch(name).includes(q));
}

// 文字2-gramの集合（似た名前の判定用）
function bigrams(text: string): Set<string> {
  const set = new Set<string>();
  if (text.length === 1) set.add(text);
  for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
  return set;
}

/** 2つの名前の似ている度合い（0〜1）。どちらかがもう一方を含めば1、それ以外は2-gramのDice係数 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeForSearch(a);
  const nb = normalizeForSearch(b);
  if (!na || !nb) return 0;
  if (na.includes(nb) || nb.includes(na)) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  let overlap = 0;
  for (const g of ga) if (gb.has(g)) overlap++;
  return (2 * overlap) / (ga.size + gb.size);
}

/**
 * 新しいゲームタイトル名に似た登録済みゲームタイトル（§9.2「登録済みのこちらではありませんか？」）。
 * タイトル名・別名のうち一番近いもので比べ、しきい値以上を近い順に返す
 */
export function findSimilarGames<T extends { title: string; aliases?: string[] }>(name: string, games: T[], limit = 3): T[] {
  if (normalizeForSearch(name).length < 2) return [];
  return games
    .map((g) => ({ g, score: Math.max(...[g.title, ...(g.aliases ?? [])].map((n) => nameSimilarity(name, n))) }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.g);
}
