// チャンネル起点の再生リスト探索の本体（サーバー専用）。
// 管理_Ai運営者 コンテンツ収集機能仕様書 v3.0 §3.2〜3.5。探索API（管理画面のボタン・Cloud Scheduler）から呼ぶ。
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { extractGameQuery, findExcludeWord, guessGame, matchTitleTagNames, MIN_VIDEO_COUNT } from './exploration-rules';
import { fetchChannelPlaylists, getQuotaConsumed, resetQuotaCounter, YouTubeApiError } from './youtube';
import { addCollectionQuotaUsage } from './collection-quota';

/** 運営者タグ（origin: operator）の名前→ID。タグ候補・チャンネル単位タグはこの範囲に限る（§3.5） */
export async function fetchOperatorTagIdsByName(): Promise<Map<string, string>> {
  const snap = await adminDb.collection('tags').where('origin', '==', 'operator').get();
  return new Map(snap.docs.map((d) => [d.data().name as string, d.id]));
}

async function existingIds(refs: DocumentReference[]): Promise<Set<string>> {
  const found = new Set<string>();
  const CHUNK = 100;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const snaps = await adminDb.getAll(...refs.slice(i, i + CHUNK));
    snaps.forEach((s) => {
      if (s.exists) found.add(s.id);
    });
  }
  return found;
}

export interface ExploreSummary {
  processedChannels: number;
  playlistsFetched: number;
  candidatesFound: number;
  skippedByFilter: number;
  skippedExisting: number;
  quotaConsumed: number;
  errors: Array<{ explorationChannelId: string; message: string }>;
  status: 'success' | 'partial' | 'error';
}

/**
 * 探索対象チャンネル（status: active）の再生リストを取得し、ハードフィルタを通ったものを
 * collection_candidates（ドキュメントID＝再生リストID）に保存する。
 * explorationChannelId を渡すとそのチャンネルだけを探索する。
 */
export async function exploreChannels(options: {
  trigger: 'manual' | 'cron';
  executedBy: string | null;
  explorationChannelId?: string;
}): Promise<ExploreSummary> {
  const executedAt = new Date();
  resetQuotaCounter();

  const channelDocs: DocumentSnapshot[] = options.explorationChannelId
    ? [await adminDb.collection('exploration_channels').doc(options.explorationChannelId).get()]
    : (await adminDb.collection('exploration_channels').where('status', '==', 'active').get()).docs;
  const channels = channelDocs.filter((d) => d.exists && d.data()!.status === 'active' && d.data()!.youtubeChannelId);

  const [gamesSnap, operatorTags] = await Promise.all([adminDb.collection('games').get(), fetchOperatorTagIdsByName()]);
  const games = gamesSnap.docs.map((d) => ({ id: d.id, title: (d.data().title as string) ?? '' }));

  const summary: ExploreSummary = {
    processedChannels: 0,
    playlistsFetched: 0,
    candidatesFound: 0,
    skippedByFilter: 0,
    skippedExisting: 0,
    quotaConsumed: 0,
    errors: [],
    status: 'success',
  };

  // 途中で想定外のエラー（Firestore の書き込み失敗等）が起きても、そこまでのクォータ消費と実行ログは必ず残す
  let fatalError: unknown = null;
  try {
    for (const channelDoc of channels) {
      const channel = channelDoc.data()!;
      let playlists;
      try {
        playlists = await fetchChannelPlaylists(channel.youtubeChannelId as string);
      } catch (e) {
        summary.errors.push({
          explorationChannelId: channelDoc.id,
          message: e instanceof YouTubeApiError ? e.message : 'youtube_api_error',
        });
        continue;
      }
      summary.processedChannels++;
      summary.playlistsFetched += playlists.length;

      const passed = playlists.filter((p) => {
        if (p.itemCount < MIN_VIDEO_COUNT || !p.isPublic || findExcludeWord(p.title)) {
          summary.skippedByFilter++;
          return false;
        }
        return true;
      });

      const ids = passed.map((p) => p.youtubePlaylistId);
      const [registered, candidated] = await Promise.all([
        existingIds(ids.map((id) => adminDb.collection('playlists').doc(id))),
        existingIds(ids.map((id) => adminDb.collection('collection_candidates').doc(id))),
      ]);
      const fresh = passed.filter((p) => !registered.has(p.youtubePlaylistId) && !candidated.has(p.youtubePlaylistId));
      summary.skippedExisting += passed.length - fresh.length;

      const BATCH_LIMIT = 400;
      for (let i = 0; i < fresh.length; i += BATCH_LIMIT) {
        const batch = adminDb.batch();
        for (const p of fresh.slice(i, i + BATCH_LIMIT)) {
          const guessed = guessGame(p.title, games);
          const titleTagIds = matchTitleTagNames(p.title)
            .map((name) => operatorTags.get(name))
            .filter((id): id is string => !!id);
          batch.set(adminDb.collection('collection_candidates').doc(p.youtubePlaylistId), {
            playlistId: p.youtubePlaylistId,
            playlistTitle: p.title,
            channelId: p.channelId,
            channelTitle: p.channelTitle,
            explorationChannelId: channelDoc.id,
            thumbnailUrl: p.thumbnailUrl,
            videoCount: p.itemCount,
            playlistPublishedAt: p.publishedAt ? new Date(p.publishedAt) : null,
            guessedGameId: guessed?.id ?? null,
            guessedGameTitle: guessed?.title ?? null,
            gameQuery: extractGameQuery(p.title),
            titleTagIds,
            source: 'channel',
            status: 'pending',
            collectedAt: executedAt,
            reviewedAt: null,
            reviewedBy: null,
            reviewComment: null,
            registeredPlaylistId: null,
          });
        }
        await batch.commit();
      }
      summary.candidatesFound += fresh.length;

      await channelDoc.ref.update({ lastExploredAt: executedAt, lastFoundCount: fresh.length, updatedAt: executedAt });
    }
  } catch (e) {
    fatalError = e;
    summary.errors.push({ explorationChannelId: '', message: e instanceof Error ? e.message : 'unexpected_error' });
  } finally {
    summary.quotaConsumed = getQuotaConsumed();
    await addCollectionQuotaUsage(summary.quotaConsumed);
    if (summary.errors.length > 0) {
      summary.status = summary.processedChannels > 0 && !fatalError ? 'partial' : 'error';
    }
    await adminDb.collection('collection_batch_logs').add({
      executedAt,
      trigger: options.trigger,
      executedBy: options.executedBy,
      ...summary,
    });
  }
  if (fatalError) throw fatalError;

  return summary;
}
