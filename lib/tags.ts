import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface TagInfo {
  id: string;
  name: string;
  origin: 'operator' | 'user';
  createdAt: number;
  usageGameCount: number;
  usagePlaylistCount: number;
}

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

export interface ResolvedTag {
  id: string;
  name: string;
  fixed: boolean;
}

/**
 * タグIDリストを表示順（1. 編集不可タグ、2. 編集可能タグ＝登録日が古い順）に解決する
 * （ページ ゲームタイトル 詳細仕様書「ゲームに付けられたタグ」節）。
 */
export function resolveTags(tagIds: string[], fixedTagIds: string[], tagsMap: Map<string, TagInfo>): ResolvedTag[] {
  const fixedSet = new Set(fixedTagIds);
  const resolved = tagIds
    .map((id) => tagsMap.get(id))
    .filter((t): t is TagInfo => !!t)
    .map((t) => ({ id: t.id, name: t.name, fixed: fixedSet.has(t.id), createdAt: t.createdAt }));

  const fixed = resolved.filter((t) => t.fixed);
  const editable = resolved.filter((t) => !t.fixed).sort((a, b) => a.createdAt - b.createdAt);
  return [...fixed, ...editable].map(({ id, name, fixed: f }) => ({ id, name, fixed: f }));
}
