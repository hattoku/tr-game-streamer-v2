// 配信者（チャンネル）の名前・アイコンの取り直し（サーバー専用）。共通 YouTube定期取得仕様書 第4章。
// 配信者が YouTube でアイコンや名前を変えても、プレミテは保存したときのまま持ち続けていた（2026-11-17 の確認）。
// 毎日の巡回の最初に、プレミテが持っているチャンネル全部を channels.list でまとめて確認し、
// 変わっていたら、チャンネルページ・掲載チャンネル・そのチャンネルの再生リストを書き換える。
// YouTube API 規約の30日ルール（§8.4・§4.4）のうち、チャンネル名・アイコンの取り直しもこれで満たす。
import type { DocumentReference } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import { fetchChannelSnippets, YouTubeApiError, type ChannelSnippet } from './youtube';

const WRITE_CHUNK_SIZE = 400;
const FETCH_CHUNK_SIZE = 50;
/** YouTube のチャンネルIDの形（UC＋22文字）。形の崩れたIDが混じると同じ50件のまとまりが毎回 400 で失敗するため、確認から外す */
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/;

export interface ChannelProfileRefreshResult {
  /** YouTube で確認したチャンネルの数 */
  checked: number;
  /** 名前かアイコンが変わっていたチャンネルの数 */
  changed: number;
  /** YouTube で見つからなかった（削除・停止された）チャンネルの数。書き換えずに残す */
  notFound: number;
  /** 書き換えたドキュメントの数（チャンネルページ・掲載チャンネル・再生リストの合計） */
  updatedDocs: number;
}

export interface ChannelProfileRefreshOutcome {
  result: ChannelProfileRefreshResult;
  /** 途中で出た YouTube のエラー（最初の1件）。出なければ null */
  error: YouTubeApiError | null;
}

interface StoredProfile {
  ref: DocumentReference;
  channelId: string;
  name: string;
  iconUrl: string;
  nameField: string;
  iconField: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 保存している値と YouTube の今の値を比べ、変わった項目だけの書き換え内容を返す（YouTube 側が空の項目は書き換えない） */
export function profileUpdate(stored: Pick<StoredProfile, 'name' | 'iconUrl' | 'nameField' | 'iconField'>, latest: Pick<ChannelSnippet, 'name' | 'iconUrl'>): Record<string, string> | null {
  const update: Record<string, string> = {};
  if (latest.name && latest.name !== stored.name) update[stored.nameField] = latest.name;
  if (latest.iconUrl && latest.iconUrl !== stored.iconUrl) update[stored.iconField] = latest.iconUrl;
  return Object.keys(update).length > 0 ? update : null;
}

/**
 * プレミテが持っているチャンネルの名前・アイコンを YouTube の今の値に合わせる。
 * 対象はチャンネルページ（channels）・掲載チャンネル（exploration_channels、チャンネルが確定したもの）・
 * 再生リスト（playlists。掲載停止で YouTube 由来の項目を消したものは除く）。
 * 新着通知・提案・申請に入っている名前・アイコンは、その時点の記録なので書き換えない（表示側で、読めない画像は人のアイコンに切り替える）。
 * 50件のまとまりで YouTube のエラーが出たらそのまとまりだけ飛ばし、クォータ切れならそこでやめる。どちらも取れた分は書き換え、エラーを返す。
 * Firestore のエラーは呼び出し元へ投げる。
 */
export async function refreshChannelProfiles(isQuotaExceeded: (e: YouTubeApiError) => boolean): Promise<ChannelProfileRefreshOutcome> {
  const [channelsSnap, explorationSnap, playlistsSnap] = await Promise.all([
    adminDb.collection('channels').select('name', 'iconUrl').get(),
    adminDb.collection('exploration_channels').select('youtubeChannelId', 'channelTitle', 'channelIconUrl').get(),
    adminDb.collection('playlists').select('channelId', 'channelName', 'channelIconUrl', 'youtubeDataRemovedAt').get(),
  ]);

  const stored: StoredProfile[] = [];
  for (const d of channelsSnap.docs) {
    stored.push({ ref: d.ref, channelId: d.id, name: str(d.get('name')), iconUrl: str(d.get('iconUrl')), nameField: 'name', iconField: 'iconUrl' });
  }
  for (const d of explorationSnap.docs) {
    const channelId = str(d.get('youtubeChannelId'));
    if (!channelId) continue; // チャンネルがまだ確定していない
    stored.push({ ref: d.ref, channelId, name: str(d.get('channelTitle')), iconUrl: str(d.get('channelIconUrl')), nameField: 'channelTitle', iconField: 'channelIconUrl' });
  }
  for (const d of playlistsSnap.docs) {
    const channelId = str(d.get('channelId'));
    if (!channelId || d.get('youtubeDataRemovedAt')) continue;
    stored.push({ ref: d.ref, channelId, name: str(d.get('channelName')), iconUrl: str(d.get('channelIconUrl')), nameField: 'channelName', iconField: 'channelIconUrl' });
  }

  const channelIds = [...new Set(stored.map((s) => s.channelId))].filter((id) => CHANNEL_ID_PATTERN.test(id));
  const latest = new Map<string, ChannelSnippet>();
  let error: YouTubeApiError | null = null;
  let attempted = 0;
  for (let i = 0; i < channelIds.length; i += FETCH_CHUNK_SIZE) {
    const chunk = channelIds.slice(i, i + FETCH_CHUNK_SIZE);
    try {
      (await fetchChannelSnippets(chunk)).forEach((v, k) => latest.set(k, v));
      attempted += chunk.length;
    } catch (e) {
      if (!(e instanceof YouTubeApiError)) throw e;
      error ??= e;
      if (isQuotaExceeded(e)) break;
    }
  }

  const changedChannels = new Set<string>();
  const writes: Array<{ ref: DocumentReference; update: Record<string, string> }> = [];
  for (const s of stored) {
    const yt = latest.get(s.channelId);
    if (!yt) continue;
    const update = profileUpdate(s, yt);
    if (!update) continue;
    writes.push({ ref: s.ref, update });
    changedChannels.add(s.channelId);
  }
  for (let i = 0; i < writes.length; i += WRITE_CHUNK_SIZE) {
    const batch = adminDb.batch();
    writes.slice(i, i + WRITE_CHUNK_SIZE).forEach((w) => batch.update(w.ref, w.update));
    await batch.commit();
  }

  return {
    result: {
      checked: latest.size,
      changed: changedChannels.size,
      // 確認できたまとまりのうち、YouTube が返さなかったチャンネル
      notFound: attempted - latest.size,
      updatedDocs: writes.length,
    },
    error,
  };
}
