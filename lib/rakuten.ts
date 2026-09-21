// 楽天ブックスAPI（BooksGame/Search version:2017-04-04、BooksGenre/Search version:2012-11-28）
// 連携基盤（サーバー専用）。
//
// ゲームタイトル登録時のパッケージ画像検索（フェーズ4.5ステップ8）と、楽天ブックス商品ページURLからの
// 商品情報取得・ジャンル/テーマ/機種の自動セット（フェーズ5、2026-09-21）に利用する。lib/youtube.tsと
// 同じ方針で、専用パッケージは追加せずREST APIをfetchで直接呼び出す。
// 呼び出し元はNext.js API Route等のサーバーサイドコードに限定すること
// （RAKUTEN_APPLICATION_ID/RAKUTEN_ACCESS_KEYをブラウザに露出させないため）。
//
// **実挙動に関する注記（2026-09-20実APIで確認、公式ドキュメントの記載と異なる点）**:
// - 楽天は2026-02にAPI基盤を刷新しており、リクエストにReferer・Originヘッダー（いずれもアプリ登録時の
//   「Allowed websites」と一致するもの）が無いと`403 REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING`で
//   拒否される。サーバー間通信でブラウザ由来のRefererは無いため、本番ドメインを固定で送る。
// - `formatVersion=2`のレスポンスは`items`ではなく`Items`（先頭大文字）で返る。
// - `jan`は数値ではなく文字列で返る（ドキュメント上は`long`だが実際は`string`）。
// - レートリミットは1リクエスト/秒で、超えると`429 {"statusCode":429,"message":"Rate limit is exceeded..."}`
//   が返る（2026-09-21確認）。JAN検索→ジャンル解決のように連続で呼ぶ箇所があるため、429は1秒待って
//   1回だけ再試行する。
import { RAKUTEN_APPLICATION_ID, RAKUTEN_ACCESS_KEY } from './constants';
import { normalizeRakutenBooksItemUrl } from './rakuten-shared';

const API_BASE = 'https://openapi.rakuten.co.jp/services/api/';
const BOOKS_GAME_SEARCH = 'BooksGame/Search/20170404';
const BOOKS_GENRE_SEARCH = 'BooksGenre/Search/20121128';

// アプリ登録時の「Allowed websites」に含まれるドメイン（サーバー間通信のため実行環境に関わらず固定）
const REQUEST_ORIGIN = 'https://puremite.net';

// 429時の再試行までの待ち時間（レートリミットが1秒単位のため少し余裕を持たせる）
const RATE_LIMIT_RETRY_MS = 1100;

export class RakutenApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RakutenApiError';
    this.status = status;
  }
}

export interface RakutenGameSearchResult {
  jan: string;
  title: string;
  hardware: string;
  label: string;
  salesDate: string;
  itemUrl: string;
  imageUrl: string;
  // 楽天ブックスのジャンルID（例: 006514003001 = ゲーム/Nintendo Switch/RPG/オーソドックスRPG）。
  // 複数ジャンルに属する商品は「/」区切りで複数返るため、resolveRakutenGenreで先頭を使う
  booksGenreId: string;
}

// 楽天ブックスのゲームカテゴリ階層のうち、プレミテのマスタに対応する2階層の名称。
// genreLevel 1=ゲーム, 2=機種, 3=ジャンル（=genresマスタ）, 4=テーマ（=themesマスタ）。
// （document/master/ゲームジャンル・テーママスタ初期データ.md では楽天ブックスのルートを含めて
// 数えているため「第4階層/第5階層」と表記されているが、APIのgenreLevelでは3/4に当たる）
export interface RakutenGenreInfo {
  genreName: string;
  themeName: string;
}

// 商品ページURLから取得した商品情報。検索結果に加えてジャンル/テーマ名を解決済み
export interface RakutenGameItem extends RakutenGameSearchResult {
  genre: RakutenGenreInfo | null;
}

interface BooksGameApiItem {
  jan?: string | number;
  title?: string;
  hardware?: string;
  label?: string;
  salesDate?: string;
  itemUrl?: string;
  largeImageUrl?: string;
  mediumImageUrl?: string;
  smallImageUrl?: string;
  booksGenreId?: string;
}

interface BooksGameApiResponse {
  Items?: BooksGameApiItem[];
}

interface BooksGenreApiNode {
  booksGenreId?: string;
  booksGenreName?: string;
  genreLevel?: number;
}

interface BooksGenreApiResponse {
  current?: BooksGenreApiNode;
  parents?: BooksGenreApiNode[];
  children?: BooksGenreApiNode[];
}

interface RakutenApiErrorResponse {
  errors?: { errorCode?: number; errorMessage?: string };
  error_description?: string;
  message?: string;
}

// 楽天APIを呼び出してJSONを返す共通処理（認証パラメータ・固定ヘッダー・エラー処理・429再試行）
async function callRakutenApi<T>(api: string, params: Record<string, string>, retryOnRateLimit = true): Promise<T> {
  if (!RAKUTEN_APPLICATION_ID || !RAKUTEN_ACCESS_KEY) {
    throw new RakutenApiError('RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY が設定されていません（.env.local参照）。');
  }

  const url = new URL(API_BASE + api);
  url.searchParams.set('applicationId', RAKUTEN_APPLICATION_ID);
  url.searchParams.set('accessKey', RAKUTEN_ACCESS_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');

  const res = await fetch(url, {
    headers: { Referer: `${REQUEST_ORIGIN}/`, Origin: REQUEST_ORIGIN },
  });
  if (res.status === 429 && retryOnRateLimit) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_RETRY_MS));
    return callRakutenApi<T>(api, params, false);
  }
  if (!res.ok) {
    let reason = '';
    try {
      const body: RakutenApiErrorResponse = await res.json();
      reason = body?.errors?.errorMessage ?? body?.error_description ?? body?.message ?? '';
    } catch {
      // レスポンスがJSONでない場合はreasonなしで続行
    }
    throw new RakutenApiError(`楽天ブックスAPI呼び出しに失敗しました${reason ? `: ${reason}` : ''}`, res.status);
  }
  return res.json();
}

// BooksGame/Search APIを呼び出し、正規化した結果を返す共通処理。検索条件（title / jan）は呼び出し側が渡す
async function fetchBooksGame(params: Record<string, string>): Promise<RakutenGameSearchResult[]> {
  const data = await callRakutenApi<BooksGameApiResponse>(BOOKS_GAME_SEARCH, {
    ...params,
    hits: '10',
    // 在庫状況(availability)が空文字のタイトルがあり、既定のoutOfStockFlag=0だと除外されてしまう
    // （2026-09-21、エルデンリング等の実データで確認）。パッケージ画像取得が目的で購入可否は
    // 問わないため、常に品切れ等も含めて検索する
    outOfStockFlag: '1',
  });
  return (data.Items ?? [])
    .filter((item): item is BooksGameApiItem & { title: string } => Boolean(item.title))
    .map((item) => ({
      jan: item.jan ? String(item.jan) : '',
      title: item.title,
      hardware: item.hardware ?? '',
      label: item.label ?? '',
      salesDate: item.salesDate ?? '',
      // アフィリエイトタグは付与しない生の商品URL。アフィリエイトIDが後で変わっても保存済みの
      // URLを書き換えずに追従できるよう、タグ付けは表示時にlib/rakuten-affiliate.tsで行う
      itemUrl: item.itemUrl ?? '',
      imageUrl: item.largeImageUrl || item.mediumImageUrl || item.smallImageUrl || '',
      booksGenreId: item.booksGenreId ?? '',
    }));
}

// ゲームタイトル名で検索する。booksGenreId未指定時のデフォルト値「006」（楽天ブックスの
// ゲームジャンル直下）が自動的に適用されるため、ゲーム以外のジャンルは混入しない。
export async function searchRakutenGames(title: string): Promise<RakutenGameSearchResult[]> {
  return fetchBooksGame({ title });
}

// JANコードで検索する。通常は0件または1件（同一JANの重複掲載があれば複数件）
export async function searchRakutenGamesByJan(jan: string): Promise<RakutenGameSearchResult[]> {
  return fetchBooksGame({ jan });
}

// ジャンルIDごとの解決結果キャッシュ。楽天ブックスのカテゴリ階層は静的で件数も少ない（機種×ジャンル×
// テーマで数百件）ため、プロセス内で無期限に保持してレートリミット（1req/秒）の消費を抑える。
// 解決できなかったIDもnullで記録し、同じIDで繰り返し呼ばないようにする
const genreCache = new Map<string, RakutenGenreInfo | null>();

// 楽天ブックスのジャンルIDから、ジャンル名（genreLevel 3）とテーマ名（genreLevel 4）を解決する。
// BooksGame/Searchの`booksGenreId`は「/」区切りで複数返ることがあるため先頭のみ使う。
// 本体・周辺機器など、ジャンル階層を持たないIDや解決失敗時はnull（呼び出し側は自動セットを諦めるだけ）
export async function resolveRakutenGenre(booksGenreId: string): Promise<RakutenGenreInfo | null> {
  const id = booksGenreId.split('/')[0]?.trim() ?? '';
  if (!/^\d{3,}$/.test(id)) return null;
  if (genreCache.has(id)) return genreCache.get(id)!;

  let info: RakutenGenreInfo | null = null;
  try {
    const data = await callRakutenApi<BooksGenreApiResponse>(BOOKS_GENRE_SEARCH, { booksGenreId: id });
    const nodes = [...(data.parents ?? []), ...(data.current ? [data.current] : [])];
    const genreName = nodes.find((n) => n.genreLevel === 3)?.booksGenreName ?? '';
    const themeName = nodes.find((n) => n.genreLevel === 4)?.booksGenreName ?? '';
    if (genreName) info = { genreName, themeName };
  } catch (e) {
    // ジャンル解決は付加情報なので、失敗しても呼び出し元の本処理（画像取得等）は止めない
    console.error('楽天ブックスジャンル解決失敗', booksGenreId, e);
    return null;
  }
  genreCache.set(id, info);
  return info;
}

// 商品ページのHTMLから必要な値だけを抜き出す。正規表現ベースの最小限の抽出で、HTMLパーサーは持ち込まない
function extractMetaContent(html: string, property: string): string {
  const match = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'));
  return match ? match[1] : '';
}

// 楽天ブックスの商品ページURLから商品情報（パッケージ画像・商品名・JAN・ジャンル/テーマ等）を取得する。
//
// BooksGame/Search APIは商品番号（URLの/rb/<番号>/）での検索に対応していないため、まず商品ページを
// 取得してJANコードを読み取り、そのJANでAPIを引く（ページ ゲームタイトル 詳細 仕様書 §7の
// 「JANコードをキーとしてAPI経由で取得する」方針に沿う）。APIでヒットすれば、タイトル検索と同じ
// 形式の画像URL（thumbnail.image.rakuten.co.jp）が得られ、booksGenreIdからジャンル/テーマ名も解決する。
// APIで0件（掲載終了等）の場合は、商品ページのog:image / og:titleをそのまま使う。
//
// 注記（2026-09-21実ページで確認）: 商品ページはUser-Agentがブラウザ風でないと、実在する商品でも
// 「お探しのページが見つかりません」（HTTP 200）を返す。そのためブラウザ相当のUAを固定で送る。
// 該当しないURL・商品情報を取得できないページの場合はnullを返す。
export async function fetchRakutenGameByItemUrl(input: string): Promise<RakutenGameItem | null> {
  const itemUrl = normalizeRakutenBooksItemUrl(input);
  if (!itemUrl) return null;

  const res = await fetch(itemUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja,en;q=0.8',
    },
  });
  // 存在しない商品番号は404（「お探しのページが見つかりません」）で返る
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new RakutenApiError('楽天ブックス商品ページの取得に失敗しました', res.status);
  }
  const html = await res.text();

  // 商品ページ内の`jan="4902370554922"`属性（複数箇所にあるが同一値）、無ければ<title>末尾の
  // 「- <JAN> : ゲーム」から読み取る
  const jan = html.match(/\bjan=["'](\d{8,13})["']/)?.[1] ?? html.match(/<title>[^<]*?-\s*(\d{13})\s*:/)?.[1] ?? '';

  if (jan) {
    const results = await searchRakutenGamesByJan(jan);
    // 同一JANが複数件返る場合は、商品番号が一致するものを優先する
    const matched = results.find((r) => normalizeRakutenBooksItemUrl(r.itemUrl) === itemUrl) ?? results[0];
    if (matched) {
      const genre = matched.booksGenreId ? await resolveRakutenGenre(matched.booksGenreId) : null;
      return { ...matched, itemUrl, genre };
    }
  }

  const ogImage = extractMetaContent(html, 'og:image');
  const ogTitle = extractMetaContent(html, 'og:title');
  if (!ogImage && !ogTitle) return null;
  return { jan, title: ogTitle, hardware: '', label: '', salesDate: '', itemUrl, imageUrl: ogImage, booksGenreId: '', genre: null };
}
