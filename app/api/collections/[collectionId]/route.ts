import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { COLLECTION_PLAYLISTS_MAX } from '@/lib/collections-shared';
import { arePublicPlaylists, fetchCreatorSnapshot, parseCollectionFields, readJsonObject } from '@/lib/collections-server';

// まとめの編集・削除（ページ 再生リスト まとめ機能仕様書 §4.2・§4.6）。作成者本人のみ。
// PATCH は2形態:
// - フォーム保存: title/description/visibility/showSpoiler/playlistIds をまとめて置き換える
//   （作成者名・アイコンの非正規化コピーもこのときだけ取り直す）
// - 「まとめに追加する」ダイアログ（§4.1）: { addPlaylistId } / { removePlaylistId } で1件だけ追加・削除する
//   （再生リストは1件以上必須のため、最後の1件は外せない）。10件上限の判定と更新はトランザクションで行う

type Params = { params: Promise<{ collectionId: string }> };

class CollectionError extends Error {
  constructor(public code: string, public status: number) {
    super(code);
  }
}

async function loadOwnCollection(request: NextRequest, params: Params['params']) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth;
  const { collectionId } = await params;
  const ref = adminDb.collection('collections').doc(collectionId);
  const snap = await ref.get();
  if (!snap.exists) return { errorResponse: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  if (snap.data()?.userId !== auth.uid) return { errorResponse: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  return { uid: auth.uid, ref };
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const loaded = await loadOwnCollection(request, params);
  if ('errorResponse' in loaded) return loaded.errorResponse;
  const { uid, ref } = loaded;
  const body = await readJsonObject(request);
  if (!body) return NextResponse.json({ error: 'invalid_body' }, { status: 400 });

  const addId = typeof body.addPlaylistId === 'string' && body.addPlaylistId ? body.addPlaylistId : null;
  const removeId = typeof body.removePlaylistId === 'string' && body.removePlaylistId ? body.removePlaylistId : null;
  if (addId || removeId) {
    if (addId && !(await arePublicPlaylists([addId]))) {
      return NextResponse.json({ error: 'playlist_not_found' }, { status: 400 });
    }
    try {
      const next = await adminDb.runTransaction(async (tx) => {
        const playlistIds = ((await tx.get(ref)).data()?.playlistIds as string[] | undefined) ?? [];
        let updated = playlistIds;
        if (addId && !playlistIds.includes(addId)) {
          if (playlistIds.length >= COLLECTION_PLAYLISTS_MAX) throw new CollectionError('playlist_limit', 409);
          updated = [...playlistIds, addId];
        } else if (removeId && playlistIds.includes(removeId)) {
          if (playlistIds.length <= 1) throw new CollectionError('last_playlist', 409);
          updated = playlistIds.filter((p) => p !== removeId);
        }
        if (updated !== playlistIds) tx.update(ref, { playlistIds: updated, updatedAt: new Date() });
        return updated;
      });
      return NextResponse.json({ playlistIds: next });
    } catch (e) {
      if (e instanceof CollectionError) return NextResponse.json({ error: e.code }, { status: e.status });
      throw e;
    }
  }

  const fields = await parseCollectionFields(body);
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  await ref.update({ ...fields, ...(await fetchCreatorSnapshot(uid)), updatedAt: new Date() });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const loaded = await loadOwnCollection(request, params);
  if ('errorResponse' in loaded) return loaded.errorResponse;
  await loaded.ref.delete();
  return NextResponse.json({ ok: true });
}
