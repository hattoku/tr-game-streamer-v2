import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { TagInfo } from './tags-shared';

export { resolveTags, isListedTag, USER_TAG_MIN_USAGE, type TagInfo, type ResolvedTag } from './tags-shared';

/** `tags`マスタ全件をIDで引けるMapとして取得する（管理 マスタ管理仕様書 §2）。 */
export async function fetchTagsMap(): Promise<Map<string, TagInfo>> {
  const snap = await getDocs(collection(db, 'tags'));
  const map = new Map<string, TagInfo>();
  snap.docs.forEach((d) => {
    const data = d.data();
    map.set(d.id, {
      id: d.id,
      name: data.name ?? '',
      origin: data.origin === 'user' ? 'user' : 'operator',
      createdAt: (data.createdAt as { toMillis(): number } | undefined)?.toMillis?.() ?? 0,
      usageGameCount: data.usageGameCount ?? 0,
      usagePlaylistCount: data.usagePlaylistCount ?? 0,
    });
  });
  return map;
}

