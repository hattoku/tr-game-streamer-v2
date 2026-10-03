/**
 * マイリスト一覧（`fetchMylistEntries`）の取得フック。TOPのマイリストセクションとマイリストページで共用する。
 * iOS Safari でタブ/アプリ切替・bfcache 復帰をまたぐと Firestore の接続が黙って切れ、SDK が再接続するまで
 * getDocs が解決しないことがあり、読み込み中表示のまま止まる事象があったため、以下で自力回復させる:
 * - 1回あたり TIMEOUT_MS でタイムアウトし、1回だけ自動リトライする。最終的に失敗したら `error` を立てる
 *   （呼び出し側は「空」ではなくエラー表示にする）
 * - getDocs は中止できないため、タイムアウトした古いリクエストが後から成功した場合もその結果を採用する
 *   （より新しいリクエストの結果が既に反映済みなら破棄）
 * - 画面復帰（visibilitychange / bfcache の pageshow）時に、未取得のまま STALE_MS 以上経過 or エラーなら再取得する
 * 次回再現時に原因を切り分けられるよう、遅延・タイムアウト時は console.warn で所要時間と可視状態を残す。
 */
'use client';

import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { fetchMylistEntries, type MylistEntry } from '@/lib/mylist-entries';

const TIMEOUT_MS = 15_000;
const STALE_MS = 15_000;
const SLOW_LOG_MS = 5_000;
const MAX_ATTEMPTS = 2;

interface State {
  uid: string | null;
  entries: MylistEntry[] | null;
  error: boolean;
}

export function useMylistEntries(uid: string | null) {
  const [state, setState] = useState<State>({ uid: null, entries: null, error: false });
  const seqRef = useRef(0);
  const appliedSeqRef = useRef(0);
  const startedAtRef = useRef(0);
  const uidRef = useRef(uid);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const load = useCallback((targetUid: string, reason: string) => {
    const seq = ++seqRef.current;
    const startedAt = Date.now();
    startedAtRef.current = startedAt;

    const attempt = (n: number) => {
      let settled = false;
      const fail = (cause: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        console.warn('マイリストの読み込みに失敗しました', {
          reason,
          attempt: n,
          elapsedMs: Date.now() - startedAt,
          visibility: document.visibilityState,
          cause,
        });
        if (n < MAX_ATTEMPTS) {
          attempt(n + 1);
        } else if (uidRef.current === targetUid && appliedSeqRef.current < seq) {
          setState((s) => ({ uid: targetUid, entries: s.uid === targetUid ? s.entries : null, error: true }));
        }
      };
      const timer = setTimeout(() => fail('timeout'), TIMEOUT_MS);

      fetchMylistEntries(targetUid).then(
        (entries) => {
          settled = true;
          clearTimeout(timer);
          const elapsedMs = Date.now() - startedAt;
          if (elapsedMs > SLOW_LOG_MS) {
            console.warn('マイリストの読み込みに時間がかかりました', { reason, attempt: n, elapsedMs, visibility: document.visibilityState });
          }
          // タイムアウト後に遅れて成功した場合も採用する（より新しい結果が反映済みなら破棄）
          if (uidRef.current !== targetUid || appliedSeqRef.current >= seq) return;
          appliedSeqRef.current = seq;
          setState({ uid: targetUid, entries, error: false });
        },
        (e) => fail(e),
      );
    };
    attempt(1);
  }, []);

  useEffect(() => {
    uidRef.current = uid;
    if (!uid) return;
    // 別ユーザーの取得結果が混ざらないよう、それまでのリクエストより新しいものだけを採用対象にする
    appliedSeqRef.current = seqRef.current;
    load(uid, 'mount');

    const retryIfStuck = (reason: string) => {
      const s = stateRef.current;
      const loaded = s.uid === uid && s.entries !== null && !s.error;
      if (loaded) return;
      const failed = s.uid === uid && s.error;
      if (failed || Date.now() - startedAtRef.current >= STALE_MS) load(uid, reason);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') retryIfStuck('visible');
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) retryIfStuck('pageshow');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [uid, load]);

  /** 呼び出し側での楽観更新・再取得結果の反映用。進行中の古いリクエストの結果では上書きしない */
  const setEntries = useCallback((action: SetStateAction<MylistEntry[] | null>) => {
    appliedSeqRef.current = seqRef.current;
    setState((s) => ({
      uid: s.uid,
      entries: typeof action === 'function' ? action(s.entries) : action,
      error: false,
    }));
  }, []);

  const current = state.uid === uid;
  const entries = current ? state.entries : null;
  return {
    entries,
    /** 取得できないまま最終的に失敗した（取得済みの一覧があるときは false） */
    error: current && state.error && entries === null,
    setEntries,
  };
}
