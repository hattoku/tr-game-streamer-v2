// 一覧 API（/api/catalog/*）の回数制限。サーバー専用。共通 一覧のサーバー側検索 仕様書 §3.5。
//
// Cloud Run のインスタンスごとのメモリで数える簡易な制限（外部の保存先は使わない）。インスタンスが増えると
// その分だけ通る数も増えるが、一覧は索引（メモリ）を引くだけで安いため、「1人の連打でインスタンスのCPUが埋まる」
// ことを防ぐ目的には足りる。人が普通に使う量（キーワードを打ちながらの検索、ページ送り）には当たらない値にしてある。

/** 1分間にひとつの接続元から通す数（約4回/秒。キーワード入力は300msのデバウンスがあるため、人の操作ではほぼ届かない） */
export const PER_CLIENT_LIMIT = 240;
/** 1分間にインスタンス全体で通す数。接続元の特定をすり抜けて送られた場合の歯止め */
export const PER_INSTANCE_LIMIT = 3000;
const WINDOW_MS = 60_000;
/** 数えている接続元がこれを超えたら、期限切れを掃除する */
const MAX_TRACKED_CLIENTS = 5000;

interface Counter {
  count: number;
  resetAt: number;
}

const globalForLimit = globalThis as unknown as { __puremiteRateLimit?: { clients: Map<string, Counter>; instance: Counter } };

function store() {
  return (globalForLimit.__puremiteRateLimit ??= { clients: new Map(), instance: { count: 0, resetAt: 0 } });
}

function hit(counter: Counter, now: number, limit: number): boolean {
  if (now >= counter.resetAt) {
    counter.count = 0;
    counter.resetAt = now + WINDOW_MS;
  }
  counter.count += 1;
  return counter.count <= limit;
}

/**
 * 接続元の見分け方。Firebase Hosting（Fastly）が付ける `fastly-client-ip` は利用者が偽装できないので最優先にする。
 * 無ければ `x-forwarded-for` の先頭（直接 Cloud Run を呼ぶ場合など。偽装されうるため、インスタンス全体の上限が歯止めになる）。
 */
export function clientKey(headers: Headers): string {
  const fastly = headers.get('fastly-client-ip')?.trim();
  if (fastly) return fastly;
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

/** 通してよければ null。超えていれば何秒後に再試行できるか（Retry-After に入れる秒数）を返す */
export function checkRateLimit(headers: Headers, now = Date.now()): number | null {
  const { clients, instance } = store();

  if (clients.size > MAX_TRACKED_CLIENTS) {
    for (const [key, c] of clients) if (now >= c.resetAt) clients.delete(key);
    // 掃除しても多いなら全部捨てる（メモリを守る。次の1分は数え直しになる）
    if (clients.size > MAX_TRACKED_CLIENTS) clients.clear();
  }

  const key = clientKey(headers);
  const client = clients.get(key) ?? { count: 0, resetAt: 0 };
  clients.set(key, client);

  const clientOk = hit(client, now, PER_CLIENT_LIMIT);
  const instanceOk = hit(instance, now, PER_INSTANCE_LIMIT);
  if (clientOk && instanceOk) return null;
  const resetAt = !clientOk ? client.resetAt : instance.resetAt;
  return Math.max(1, Math.ceil((resetAt - now) / 1000));
}
