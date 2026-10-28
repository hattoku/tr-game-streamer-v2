// 運営者タグのカテゴリ別グルーピング（ページ ゲームタイトル 詳細 仕様書 §8.5）。タグ編集モーダルと、
// 管理画面の探索対象チャンネルのタグ設定（収集候補レビューUI仕様書 v2.0 §6.4）で共用する。
// カテゴリは Firestore に保存しておらず、scripts/data/tags.mjs（各「初期登録データ一覧.md」の構成）を正とする。
import type { TagInfo } from './tags';
import { GAME_TITLE_TAG_CATEGORIES, PLAYLIST_TAG_CATEGORIES } from '@/scripts/data/tags.mjs';

/** 件数が多く、初期状態では折りたたむカテゴリ（ゲームタイトルの「IP系」35件。§8.5） */
export const COLLAPSED_CATEGORIES = new Set(['IP系']);

export interface TagCategoryGroup {
  category: string;
  tags: TagInfo[];
}

/** 運営者タグをカテゴリ別に並べる。対象（再生リスト/ゲーム）のカテゴリに無い運営者タグは「その他」へ */
export function groupOperatorTags(allTags: TagInfo[], targetType: 'playlist' | 'game'): TagCategoryGroup[] {
  const operatorByName = new Map(allTags.filter((t) => t.origin === 'operator').map((t) => [t.name, t]));
  const own = targetType === 'playlist' ? PLAYLIST_TAG_CATEGORIES : GAME_TITLE_TAG_CATEGORIES;
  const other = targetType === 'playlist' ? GAME_TITLE_TAG_CATEGORIES : PLAYLIST_TAG_CATEGORIES;
  const ownNames = new Set(own.flatMap((c) => c.tags));
  // もう一方の対象専用のタグ（例: 再生リストに「ポケモン」）は出さない。両方にあるタグ（長編など）は ownNames 側で出る
  const otherOnlyNames = new Set(other.flatMap((c) => c.tags).filter((n) => !ownNames.has(n)));

  const groups: TagCategoryGroup[] = own.map((c) => ({
    category: c.category,
    tags: c.tags.map((name) => operatorByName.get(name)).filter((t): t is TagInfo => !!t),
  }));
  const rest = [...operatorByName.values()]
    .filter((t) => !ownNames.has(t.name) && !otherOnlyNames.has(t.name))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  if (rest.length > 0) groups.push({ category: 'その他', tags: rest });
  return groups.filter((g) => g.tags.length > 0);
}
