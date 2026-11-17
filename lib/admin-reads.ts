// 管理画面・審査画面のいくつもの画面で使う読み込み（クライアント専用。管理者は rules で読める）。
// 管理画面の読み込みの決まりは lib/admin-api.ts の冒頭。画面ごとの読み込みは lib/collection-admin.ts・lib/workflow-admin.ts など。
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';

/** ゲームを選ぶ画面（GameSelectModal）に渡すゲーム（components/playlists/GameSelectModal.tsx の GameOption と同じ形） */
export interface AdminGameOption {
  id: string;
  title: string;
  packageImageUrl: string | null;
  aliases: string[];
}

/** 登録済みのゲームすべて（タイトルの五十音順） */
export async function fetchGameOptions(): Promise<AdminGameOption[]> {
  const snap = await getDocs(collection(db, 'games'));
  return snap.docs
    .map((d): AdminGameOption => {
      const data = d.data();
      return {
        id: d.id,
        title: (data.title as string) ?? '',
        packageImageUrl: (data.packageImageUrl as string | undefined) ?? null,
        aliases: (data.aliases as string[] | undefined) ?? [],
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'ja'));
}

/** 1つのゲーム（無ければ null） */
export async function fetchGame(gameId: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'games', gameId));
  return snap.exists() ? snap.data() : null;
}

export const LEFT_USER_NAME = '(退会したユーザー)';

/** ユーザーの表示名（退会していれば「(退会したユーザー)」） */
export async function fetchUserDisplayName(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', uid));
  return (snap.data()?.displayName as string | undefined) ?? LEFT_USER_NAME;
}

/** 何人かの表示名（uid → 表示名）。読めなかった人は「(退会したユーザー)」 */
export async function fetchUserDisplayNames(uids: string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(
    [...new Set(uids)].filter(Boolean).map(async (uid) => [uid, await fetchUserDisplayName(uid).catch(() => LEFT_USER_NAME)] as const),
  );
  return Object.fromEntries(entries);
}

/** プレミテのチャンネルページ（`channels`）があるチャンネルのID */
export async function fetchChannelPageIds(): Promise<Set<string>> {
  const snap = await getDocs(collection(db, 'channels'));
  return new Set(snap.docs.map((d) => d.id));
}

/** ジャンル・テーマのマスタ（並び順は画面側で決める） */
export async function fetchGenreAndThemeOptions(): Promise<{ genres: Array<{ id: string; name: string }>; themes: Array<{ id: string; name: string }> }> {
  const [genresSnap, themesSnap] = await Promise.all([getDocs(collection(db, 'genres')), getDocs(collection(db, 'themes'))]);
  const toOption = (d: { id: string; data(): Record<string, unknown> }) => ({ id: d.id, name: (d.data().name as string) ?? '' });
  return { genres: genresSnap.docs.map(toOption), themes: themesSnap.docs.map(toOption) };
}
