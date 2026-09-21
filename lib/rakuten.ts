// 楽天ブックスゲーム検索API（BooksGame/Search, version:2017-04-04）連携基盤（サーバー専用）。
//
// ゲームタイトル登録時のパッケージ画像検索（フェーズ4.5ステップ8）に利用する。lib/youtube.tsと
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
import { RAKUTEN_APPLICATION_ID, RAKUTEN_ACCESS_KEY } from './constants';

const API_URL = 'https://openapi.rakuten.co.jp/services/api/BooksGame/Search/20170404';

// アプリ登録時の「Allowed websites」に含まれるドメイン（サーバー間通信のため実行環境に関わらず固定）
const REQUEST_ORIGIN = 'https://puremite.net';

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
}

interface BooksGameApiResponse {
  Items?: BooksGameApiItem[];
}

interface BooksGameApiErrorResponse {
  errors?: { errorCode?: number; errorMessage?: string };
  error_description?: string;
}

// ゲームタイトル名で検索する。booksGenreId未指定時のデフォルト値「006」（楽天ブックスの
// ゲームジャンル直下）が自動的に適用されるため、ゲーム以外のジャンルは混入しない。
export async function searchRakutenGames(title: string): Promise<RakutenGameSearchResult[]> {
  if (!RAKUTEN_APPLICATION_ID || !RAKUTEN_ACCESS_KEY) {
    throw new RakutenApiError('RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY が設定されていません（.env.local参照）。');
  }

  const url = new URL(API_URL);
  url.searchParams.set('applicationId', RAKUTEN_APPLICATION_ID);
  url.searchParams.set('accessKey', RAKUTEN_ACCESS_KEY);
  url.searchParams.set('title', title);
  url.searchParams.set('hits', '10');
  // 在庫状況(availability)が空文字のタイトルがあり、既定のoutOfStockFlag=0だと除外されてしまう
  // （2026-09-21、エルデンリング等の実データで確認）。パッケージ画像取得が目的で購入可否は
  // 問わないため、常に品切れ等も含めて検索する
  url.searchParams.set('outOfStockFlag', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');

  const res = await fetch(url, {
    headers: { Referer: `${REQUEST_ORIGIN}/`, Origin: REQUEST_ORIGIN },
  });
  if (!res.ok) {
    let reason = '';
    try {
      const body: BooksGameApiErrorResponse = await res.json();
      reason = body?.errors?.errorMessage ?? body?.error_description ?? '';
    } catch {
      // レスポンスがJSONでない場合はreasonなしで続行
    }
    throw new RakutenApiError(`楽天ブックスAPI呼び出しに失敗しました${reason ? `: ${reason}` : ''}`, res.status);
  }

  const data: BooksGameApiResponse = await res.json();
  return (data.Items ?? [])
    .filter((item): item is BooksGameApiItem & { title: string } => Boolean(item.title))
    .map((item) => ({
      jan: item.jan ? String(item.jan) : '',
      title: item.title,
      hardware: item.hardware ?? '',
      label: item.label ?? '',
      salesDate: item.salesDate ?? '',
      itemUrl: item.itemUrl ?? '',
      imageUrl: item.largeImageUrl || item.mediumImageUrl || item.smallImageUrl || '',
    }));
}
