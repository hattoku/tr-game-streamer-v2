// コンテンツ収集（チャンネル起点の再生リスト探索）の判定ルール。
// 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3.3（除外語）・§3.4（ゲームの推定）・§3.5（タイトル由来のタグ）。
// 探索API（サーバー）と収集候補画面（クライアント。候補保存後に増えたゲームタイトルでの再推定）の
// 両方から使うため、Firestore や YouTube API に依存しない純粋な関数だけを置く。

/**
 * ハードフィルタの最小動画数（これ未満は除外。§3.3）。v3.1 で 3 → 10 本に引き上げた
 * （有名チャンネル3つで候補が441件になり承認しきれなかったため、見応えのあるシリーズを優先する）
 */
export const MIN_VIDEO_COUNT = 10;

/** タイトルに含まれていたら除外する語（§3.3）。比較は normalizeForMatch 後の部分一致 */
export const EXCLUDE_WORDS = [
  '切り抜き',
  '歌ってみた',
  '踊ってみた',
  'ショート',
  'shorts',
  '配信アーカイブ',
  '生放送',
  'メンバー限定',
  'ASMR',
  'Vlog',
  'MV',
  '料理',
  '単発',
];

/** タイトルの語句 → 付与するタグ名（運営者タグのみ。§3.5） */
export const TITLE_TAG_RULES: ReadonlyArray<{ words: string[]; tag: string }> = [
  { words: ['初見'], tag: '初見プレイ' },
  { words: ['縛り'], tag: '縛りプレイ' },
  { words: ['RTA'], tag: 'RTA' },
  { words: ['ノーダメ'], tag: 'ノーダメージ' },
  { words: ['低レベル'], tag: '低レベルクリア' },
  { words: ['全実績', 'トロコン', 'トロフィーコンプ'], tag: '全実績解除' },
  { words: ['やり込み'], tag: 'やり込みプレイ' },
  { words: ['ゆっくり'], tag: 'ゆっくり' },
  { words: ['VOICEROID', 'ボイロ', 'ゆかり', '琴葉'], tag: 'VOICEROID' },
  { words: ['ノーカット'], tag: 'ノーカット' },
  { words: ['字幕'], tag: '字幕・テロップ充実' },
  { words: ['協力'], tag: '協力プレイ' },
  { words: ['対戦'], tag: '対戦メイン' },
  { words: ['考察'], tag: '考察メイン' },
  { words: ['攻略'], tag: '攻略メイン' },
  { words: ['解説'], tag: '解説メイン' },
  { words: ['二人', '2人', '三人', '3人', '4人', '複数人', 'コラボ'], tag: '複数人プレイ' },
];

/** 照合用の正規化: NFKC・小文字化・空白と記号の除去（§3.4） */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

const NORMALIZED_EXCLUDE_WORDS = EXCLUDE_WORDS.map(normalizeForMatch);

/** 除外語を含むタイトルなら、その語を返す（含まなければ null） */
export function findExcludeWord(title: string): string | null {
  const normalized = normalizeForMatch(title);
  const index = NORMALIZED_EXCLUDE_WORDS.findIndex((w) => normalized.includes(w));
  return index >= 0 ? EXCLUDE_WORDS[index] : null;
}

export interface GameForMatch {
  id: string;
  title: string;
}

/**
 * 再生リストタイトルから登録済みゲームタイトルを推定する（§3.4）。
 * 正規化したゲームタイトルがタイトルに含まれるもののうち、最も長く一致したものを返す。
 * 正規化後2文字以下のゲームタイトルは誤一致を避けるため対象外。
 */
export function guessGame<T extends GameForMatch>(playlistTitle: string, games: readonly T[]): T | null {
  const normalizedTitle = normalizeForMatch(playlistTitle);
  let best: T | null = null;
  let bestLength = 0;
  for (const game of games) {
    const normalizedGame = normalizeForMatch(game.title);
    if (normalizedGame.length <= 2) continue;
    if (normalizedGame.length > bestLength && normalizedTitle.includes(normalizedGame)) {
      best = game;
      bestLength = normalizedGame.length;
    }
  }
  return best;
}

// ゲーム名ではない飾りの語（括弧の中身が「ゆっくり実況」等だけのときはゲーム名として使わない）
const DECORATION_PATTERN =
  /(ゲーム)?実況(プレイ)?|プレイ動画|ゆっくり|初見|縛り(プレイ)?|ボイロ|VOICEROID|字幕(付き)?|ホラーゲーム|ゲーム|生配信|配信|最終回|完結|総集編|シリーズ|全\d+話|\d+人/gi;

function stripDecoration(text: string): string {
  // 先頭の「ー」は飾りだが、末尾の「ー」は長音（ホラー・ゲームなど）なので落とさない
  return text.replace(DECORATION_PATTERN, '').replace(/^[\s・:：\-ー]+|[\s・:：\-]+$/g, '').trim();
}

/**
 * 推定できなかったときに楽天ブックス検索へ渡す「ゲーム名らしい部分」を抜き出す（§3.4）。
 * 括弧（【】［］[]「」『』）で囲まれた部分を優先し（飾りの語だけの括弧は飛ばす）、
 * 無ければ括弧の外の「#」「Part」「第N話」等より前を使う。
 */
export function extractGameQuery(playlistTitle: string): string {
  const title = playlistTitle.normalize('NFKC').trim();
  for (const match of title.matchAll(/[【\[「『]([^】\]」』]+)[】\]」』]/g)) {
    const inner = stripDecoration(match[1]);
    if (inner.length >= 2) return inner.slice(0, 50);
  }
  const outside = title.replace(/[【\[「『][^】\]」』]*[】\]」』]/g, ' ');
  const head = stripDecoration(outside.split(/#|part\s*\d|第\s*\d+\s*[話回]|\d+\s*[話回]|\|/i)[0]);
  if (head.length >= 2) return head.slice(0, 50);
  return title.slice(0, 50);
}

/** タイトルの語句から付与するタグ名を返す（§3.5。重複なし、ルール定義順） */
export function matchTitleTagNames(playlistTitle: string): string[] {
  const normalized = normalizeForMatch(playlistTitle);
  const names: string[] = [];
  for (const rule of TITLE_TAG_RULES) {
    if (rule.words.some((w) => normalized.includes(normalizeForMatch(w))) && !names.includes(rule.tag)) {
      names.push(rule.tag);
    }
  }
  return names;
}
