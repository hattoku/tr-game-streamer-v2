// 一覧 API の回数制限（lib/rate-limit.ts）。共通 一覧のサーバー側検索 仕様書 §3.5。
import { describe, expect, it } from 'vitest';
import { PER_CLIENT_LIMIT, checkRateLimit, clientKey } from '@/lib/rate-limit';

const headersOf = (init: Record<string, string>) => new Headers(init);

describe('clientKey（接続元の見分け方）', () => {
  it('fastly-client-ip を最優先にし、無ければ x-forwarded-for の先頭', () => {
    expect(clientKey(headersOf({ 'fastly-client-ip': '1.1.1.1', 'x-forwarded-for': '2.2.2.2' }))).toBe('1.1.1.1');
    expect(clientKey(headersOf({ 'x-forwarded-for': ' 3.3.3.3 , 4.4.4.4' }))).toBe('3.3.3.3');
    expect(clientKey(headersOf({}))).toBe('unknown');
  });
});

describe('checkRateLimit（接続元ごと1分間に PER_CLIENT_LIMIT 回）', () => {
  it('上限までは通し、超えたら再試行までの秒数を返し、1分たてば数え直す', () => {
    const headers = headersOf({ 'fastly-client-ip': '10.0.0.1' });
    const start = 1_000_000;
    for (let i = 0; i < PER_CLIENT_LIMIT; i++) expect(checkRateLimit(headers, start)).toBeNull();
    expect(checkRateLimit(headers, start + 30_000)).toBe(30);
    // 別の接続元は数えが別
    expect(checkRateLimit(headersOf({ 'fastly-client-ip': '10.0.0.2' }), start + 30_000)).toBeNull();
    expect(checkRateLimit(headers, start + 60_000)).toBeNull();
  });
});
