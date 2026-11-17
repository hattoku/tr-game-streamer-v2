// API Route で共用するリクエストボディの読み込み。

/** リクエストボディをオブジェクトとして読む。壊れたJSON・オブジェクト以外は null（呼び出し側で 400 にする） */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const body: unknown = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
