/**
 * 新規のゲーム名の収集候補について、楽天ブックスの検索結果をサーバーで先に用意しておく
 * （管理 AI運営者向け収集候補レビューUI仕様書 v2.3 §3.7）。探索APIの後に続けて呼ぶ。
 * 画面の自動検索（ブラウザで1件ずつ）を待たずに済むようにするためのもので、残った分は画面の自動検索が続きを拾う。
 * 楽天APIの1秒1回に合わせて1件ずつ順に検索し、期限が来たらやめる。
 */
import { adminDb } from './firebase-admin';
import { guessGame, normalizeForMatch } from './exploration-rules';
import { MAX_GAME_TITLE_LENGTH, searchRakutenForGameTitle } from './collection-game';
import { RakutenApiError } from './rakuten';

const RAKUTEN_INTERVAL_MS = 1100;
/** 1件の検索（0件のときの検索し直しを含め最大3回）にかかる時間の見込み。これより期限が近ければ始めない */
const PER_ITEM_BUDGET_MS = 5_000;
/** 楽天APIが続けて失敗したら（障害・キーの不備など）、残りは画面の自動検索に任せてやめる */
const MAX_CONSECUTIVE_FAILURES = 3;

export interface RakutenPrefetchSummary {
  searched: number;
  failed: number;
  /** 期限までに検索できず残った件数 */
  remaining: number;
}

export async function prefetchRakutenSearches(deadline: number): Promise<RakutenPrefetchSummary> {
  const [pendingSnap, gamesSnap] = await Promise.all([
    adminDb.collection('collection_candidates').where('status', '==', 'pending').get(),
    adminDb.collection('games').get(),
  ]);
  const games = gamesSnap.docs.map((d) => ({ id: d.id, title: (d.data().title as string) ?? '' }));
  // 画面の自動検索と同じ対象: 推定なし（今のゲームタイトルでも推定できない）で、ゲーム名があり、まだ検索していないもの
  // 新しく見つかった候補（この探索で追加したもの）から先に検索する
  const docs = [...pendingSnap.docs].sort((a, b) => (b.data().collectedAt?.toMillis?.() ?? 0) - (a.data().collectedAt?.toMillis?.() ?? 0));
  const targets = docs.filter((d) => {
    const c = d.data();
    const title = ((c.gameQuery as string) ?? '').trim();
    return !c.rakutenSearch && !c.guessedGameId && title && title.length <= MAX_GAME_TITLE_LENGTH && normalizeForMatch(title) && !guessGame(c.playlistTitle as string, games);
  });

  const summary: RakutenPrefetchSummary = { searched: 0, failed: 0, remaining: targets.length };
  let consecutiveFailures = 0;
  for (const doc of targets) {
    if (Date.now() + PER_ITEM_BUDGET_MS > deadline || consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
    const title = (doc.data().gameQuery as string).trim();
    try {
      const result = await searchRakutenForGameTitle(title);
      await doc.ref.update({ rakutenSearch: { title, query: result.query, items: result.items, searchedAt: new Date() } });
      summary.searched++;
      consecutiveFailures = 0;
    } catch (e) {
      if (!(e instanceof RakutenApiError)) throw e;
      console.error('収集候補の楽天ブックス検索（先読み）に失敗', doc.id, e);
      summary.failed++;
      consecutiveFailures++;
    }
    summary.remaining--;
    await new Promise((resolve) => setTimeout(resolve, RAKUTEN_INTERVAL_MS));
  }
  return summary;
}
