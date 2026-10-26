import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { searchRakutenGames, RakutenApiError } from '@/lib/rakuten';

// 楽天ブックスゲーム検索API（ログインユーザー向け）。再生リスト提案のゲームタイトル選択モーダルで、
// 登録済みに無いゲームの候補を出すのに使う（ページ 再生リストを追加する 仕様書 §9.2）。
// 管理者用の /api/admin/games/rakuten-search と同じ検索だが、一般ユーザーが叩けるため利用回数を絞る。
// 楽天APIは全体で1リクエスト/秒の制限がある（lib/rakuten.ts）。友人規模を想定し、インスタンスごとの
// メモリ上でユーザー単位に「前回から1.5秒以上」「1時間に60回まで」を見る（インスタンスをまたいだ厳密な制限ではない）。
const MIN_INTERVAL_MS = 1500;
const HOURLY_LIMIT = 60;
const MAX_QUERY_LENGTH = 100;
const recentRequests = new Map<string, number[]>();

// 1時間より古い記録しか無いユーザーを時々捨てる（Map が増え続けないように）
let lastSweep = 0;
function sweep(now: number) {
  if (now - lastSweep < 10 * 60 * 1000) return;
  lastSweep = now;
  for (const [uid, history] of recentRequests) {
    if (now - (history[history.length - 1] ?? 0) >= 60 * 60 * 1000) recentRequests.delete(uid);
  }
}

function isRateLimited(uid: string, now: number): boolean {
  sweep(now);
  const history = (recentRequests.get(uid) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  const last = history[history.length - 1] ?? 0;
  if (now - last < MIN_INTERVAL_MS || history.length >= HOURLY_LIMIT) {
    recentRequests.set(uid, history);
    return true;
  }
  history.push(now);
  recentRequests.set(uid, history);
  return false;
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const title = request.nextUrl.searchParams.get('title')?.trim() ?? '';
  if (!title || title.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ error: 'title_required' }, { status: 400 });
  }
  if (isRateLimited(auth.uid, Date.now())) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  try {
    const results = await searchRakutenGames(title);
    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof RakutenApiError) {
      console.error('楽天ブックスAPI検索失敗', e);
      return NextResponse.json({ error: 'rakuten_api_error' }, { status: e.status === 429 ? 429 : 502 });
    }
    throw e;
  }
}
