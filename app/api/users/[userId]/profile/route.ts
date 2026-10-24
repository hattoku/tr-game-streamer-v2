import { NextRequest, NextResponse } from 'next/server';
import { getOptionalUid, requireUser } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonObject, toCollectionJson } from '@/lib/collections-server';
import { normalizeWatchStatus, WATCH_STATUS_ORDER } from '@/components/ui/Chip';
import { validateProfileInput, type ProfileJson, type ProfilePlaylistJson } from '@/lib/profile-shared';

// 公開プロフィール（ページ 設定 プロフィール仕様書、まとめ機能仕様書 §9.1）。ログイン不要。
// users・mylist は firestore.rules で本人のみ読めるため、Admin SDK で読んで公開してよいフィールドだけを返す
// （email 等は返さない。2026-10-12 ユーザー決定でルールは緩めない）。
// マイリスト・レビュー履歴は本人以外には公開設定（isMylistPublic / isReviewHistoryPublic）に従い、OFF なら null。
// 統計・ジャンル分布は公開設定にかかわらず返す（§2.1）。
// どのクエリも userId の等価条件のみ（並び替えはメモリ内）で複合インデックスは不要。

const GENRES_TOP = 3;

type Params = { params: Promise<{ userId: string }> };

const millis = (v: unknown) => (v as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null;

export async function GET(request: NextRequest, { params }: Params) {
  const { userId } = await params;
  const userSnap = await adminDb.collection('users').doc(userId).get();
  const userData = userSnap.data();
  if (!userSnap.exists || !userData || userData.isBanned === true) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const isSelf = (await getOptionalUid(request)) === userId;
  const isMylistPublic = userData.isMylistPublic !== false;
  const isReviewHistoryPublic = userData.isReviewHistoryPublic !== false;

  const [reviewSnap, mylistSnap, collectionSnap] = await Promise.all([
    adminDb.collection('reviews').where('userId', '==', userId).get(),
    adminDb.collection('mylist').where('userId', '==', userId).get(),
    adminDb.collection('collections').where('userId', '==', userId).where('visibility', '==', 'public').get(),
  ]);

  // 星評価・視聴ステータス・コメントのいずれかがある投稿をレビューとして数える（§5.3）。
  // 通報で非表示のレビューは本人のプロフィールでも数えない（管理 審査ワークフロー仕様書 §3.1）
  const reviewDocs = reviewSnap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(({ data }) => data.isHidden !== true)
    .filter(({ data }) => data.starRating != null || normalizeWatchStatus(data.watchStatus) != null || !!(data.comment as string | null)?.trim());
  const mylistDocs = mylistSnap.docs.map((d) => d.data());
  const collections = collectionSnap.docs
    .map((d) => toCollectionJson(d.id, d.data()))
    .sort((a, b) => a.sortOrder - b.sortOrder || (b.createdAt ?? 0) - (a.createdAt ?? 0));

  // 再生リストはマイリスト・レビュー・まとめサムネイルの分をまとめて1回で引く。非公開・削除済みは除外する
  const playlistIds = [
    ...new Set([
      ...reviewDocs.map((r) => r.data.playlistId as string),
      ...mylistDocs.map((m) => m.playlistId as string),
      ...collections.flatMap((c) => c.playlistIds.slice(0, 3)),
    ]),
  ].filter(Boolean);
  const playlistSnaps = playlistIds.length
    ? await adminDb.getAll(...playlistIds.map((id) => adminDb.collection('playlists').doc(id)))
    : [];
  const playlistById = new Map<string, ProfilePlaylistJson>();
  for (const s of playlistSnaps) {
    const p = s.data();
    if (!s.exists || !p || p.isPublic !== true) continue;
    playlistById.set(s.id, {
      id: s.id,
      title: p.title ?? '',
      thumbnailUrl: p.thumbnailUrl ?? '',
      videoCount: p.videoCount ?? 0,
      gameId: p.gameId ?? null,
      gameName: p.gameName ?? '',
      score: p.score ?? null,
    });
  }

  // ジャンル分布（§6.2）: レビューした再生リストのゲームタイトルを重複除去し、ゲームのジャンルごとに数える。
  // ゲームは単一ジャンル（games.genreId / genreName）のため、件数＝そのジャンルのゲームタイトル数
  const reviewedGameIds = [
    ...new Set(reviewDocs.map((r) => playlistById.get(r.data.playlistId as string)?.gameId).filter((id): id is string => !!id)),
  ];
  const gameSnaps = reviewedGameIds.length
    ? await adminDb.getAll(...reviewedGameIds.map((id) => adminDb.collection('games').doc(id)))
    : [];
  const genreCounts = new Map<string, number>();
  for (const g of gameSnaps) {
    const name = g.data()?.genreName as string | undefined;
    if (name) genreCounts.set(name, (genreCounts.get(name) ?? 0) + 1);
  }
  const genres = [...genreCounts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
    .slice(0, GENRES_TOP);

  const watchStatusCounts = WATCH_STATUS_ORDER.map((status) => ({
    status,
    count: mylistDocs.filter((m) => normalizeWatchStatus(m.watchStatus) === status).length,
  })).filter((c) => c.count > 0);

  const mylist =
    isSelf || isMylistPublic
      ? mylistDocs
          .flatMap((m) => {
            const playlist = playlistById.get(m.playlistId as string);
            return playlist ? [{ playlist, watchStatus: normalizeWatchStatus(m.watchStatus), addedAt: millis(m.createdAt) }] : [];
          })
          .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
      : null;

  const reviews =
    isSelf || isReviewHistoryPublic
      ? reviewDocs
          .flatMap(({ id, data }) => {
            const playlist = playlistById.get(data.playlistId as string);
            if (!playlist) return [];
            return [
              {
                id,
                playlist,
                starRating: (data.starRating as number | null) ?? null,
                watchStatus: normalizeWatchStatus(data.watchStatus),
                comment: (data.comment as string | null)?.trim() || null,
                hasSpoiler: data.hasSpoiler === true,
                postedAt: millis(data.postedAt),
                updatedAt: millis(data.updatedAt),
              },
            ];
          })
          .sort((a, b) => (b.postedAt ?? 0) - (a.postedAt ?? 0))
      : null;

  const collectionThumbnailById: Record<string, string> = {};
  for (const id of collections.flatMap((c) => c.playlistIds.slice(0, 3))) {
    const p = playlistById.get(id);
    if (p) collectionThumbnailById[id] = p.thumbnailUrl;
  }

  const body: ProfileJson = {
    user: {
      userId,
      displayName: (userData.displayName as string | undefined) || 'ユーザー',
      bio: (userData.bio as string | undefined)?.trim() || null,
      profileImageUrl: (userData.profileImageUrl as string | undefined) || null,
      accountCreatedAt: millis(userData.accountCreatedAt),
      isMylistPublic,
      isReviewHistoryPublic,
    },
    isSelf,
    stats: {
      reviewCount: reviewDocs.length,
      helpfulCount: reviewDocs.reduce((sum, r) => sum + ((r.data.helpfulCount as number | undefined) ?? 0), 0),
      watchStatusCounts,
    },
    genres,
    mylist,
    reviews,
    collections,
    collectionThumbnailById,
  };
  return NextResponse.json(body);
}

// プロフィール編集（§9。表示名・自己紹介）。本人のみ。
// 表示名が変わったら、自分の reviews・collections の非正規化コピー（userDisplayName）も新しい名前に揃える
// （2026-10-12 ユーザー決定。投稿者名・作成者名からプロフィールへリンクするため、リンク先と表示名を食い違わせない）。
// 更新対象は userId の等価条件のみで引くため複合インデックスは不要。
export async function PATCH(request: NextRequest, { params }: Params) {
  const { userId } = await params;
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  if (auth.uid !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await readJsonObject(request);
  if (!body || typeof body.displayName !== 'string' || typeof body.bio !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (Object.keys(validateProfileInput({ displayName: body.displayName, bio: body.bio })).length > 0) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const displayName = body.displayName.trim();
  const bio = body.bio.trim();

  const userRef = adminDb.collection('users').doc(userId);
  const userData = (await userRef.get()).data();
  if (!userData || userData.isBanned === true) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  await userRef.update({ displayName, bio });

  if (userData.displayName !== displayName) {
    const [reviewSnap, collectionSnap] = await Promise.all([
      adminDb.collection('reviews').where('userId', '==', userId).get(),
      adminDb.collection('collections').where('userId', '==', userId).get(),
    ]);
    // 個々の書き込み失敗は BulkWriter の既定リトライ後に握り潰す（未処理 rejection にしない）。取り残した分は古い名前のまま残るが、
    // 次に表示名を変えたとき（userDisplayName が異なる分）か、そのレビュー・まとめを保存し直したときに揃う
    let failed = 0;
    const writer = adminDb.bulkWriter();
    for (const d of [...reviewSnap.docs, ...collectionSnap.docs]) {
      if (d.data().userDisplayName !== displayName) {
        writer.update(d.ref, { userDisplayName: displayName }).catch(() => {
          failed += 1;
        });
      }
    }
    await writer.close();
    if (failed > 0) console.error(`[profile PATCH] userDisplayName の更新に ${failed} 件失敗 (uid=${userId})`);
  }

  return NextResponse.json({ displayName, bio: bio || null });
}
