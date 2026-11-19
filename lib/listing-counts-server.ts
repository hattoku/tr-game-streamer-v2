// 件数（games.playlistCount・channels.playlistCount・tags.usagePlaylistCount、genres・themes の gameTitleCount）を
// 書き込む共通の処理（サーバー専用）。増減の計算は lib/listing-counts.ts。
// 件数を動かす処理（登録・掲載の切り替え・ゲームの付け外し・タグの付け外し・ゲームタイトルの登録と編集）は、
// 自分で increment を書かず、ここを通す。
//
// 使い方（トランザクションは「読み取りがすべて先」なので2段階に分けている）:
//   const counts = await prepareCountWrites(readerOf(tx), playlistCountDeltas(before, after), { channelSeed });
//   …（ほかの読み取り）…
//   tx.update(playlistRef, …);
//   counts.write(tx);
// 消されたゲーム・タグ（ドキュメントが無いもの）は飛ばす（update するとトランザクション・バッチごと失敗するため）。
// チャンネルページ（channels）が無いときは、channelSeed を渡していて増やす場合だけ作る（初めての掲載・登録）。
import { FieldValue, type DocumentReference, type DocumentSnapshot, type Transaction, type WriteBatch } from 'firebase-admin/firestore';
import { adminDb } from './firebase-admin';
import type { GameMasterCountDeltas, PlaylistCountDeltas } from './listing-counts';

export type CountReader = (refs: DocumentReference[]) => Promise<DocumentSnapshot[]>;
export type CountWriter = Transaction | WriteBatch;

/** トランザクションの中で読む */
export function readerOf(tx: Transaction): CountReader {
  return (refs) => (refs.length > 0 ? tx.getAll(...refs) : Promise.resolve([]));
}

/** トランザクションの外で読む（バッチで書くとき） */
export const directReader: CountReader = (refs) => (refs.length > 0 ? adminDb.getAll(...refs) : Promise.resolve([]));

// Transaction と WriteBatch は同じ形の update・set を持つが、型の上では合併型のまま呼べないので分けて呼ぶ
function update(writer: CountWriter, ref: DocumentReference, data: Record<string, unknown>) {
  if ('getAll' in writer) writer.update(ref, data);
  else writer.update(ref, data);
}

function create(writer: CountWriter, ref: DocumentReference, data: Record<string, unknown>) {
  if ('getAll' in writer) writer.set(ref, data);
  else writer.set(ref, data);
}

/** 初めて掲載・登録するチャンネルの、チャンネルページ（channels）を作るときの中身 */
export interface ChannelSeed {
  name: string;
  iconUrl: string;
  description?: string | null;
}

/** channels の新しいドキュメント（再生リストの登録と、巡回で取り込んだ再生リストの初めての掲載で同じ形） */
export function newChannelPageDoc(youtubeChannelId: string, seed: ChannelSeed, playlistCount: number, now: Date) {
  return {
    youtubeChannelId,
    name: seed.name,
    iconUrl: seed.iconUrl,
    description: seed.description ?? null,
    isAiGeneratedDescription: false,
    subscriberCount: null,
    playlistCount,
    registeredAt: now,
    lastFetchedAt: null,
  };
}

export interface PreparedCountWrites {
  write(writer: CountWriter): void;
}

const NOTHING: PreparedCountWrites = { write: () => undefined };

/** 再生リストの件数の書き込みを用意する（増減のある games・channels・tags を読む） */
export async function prepareCountWrites(
  read: CountReader,
  deltas: PlaylistCountDeltas,
  options: { channelSeed?: ChannelSeed | null; now?: Date } = {},
): Promise<PreparedCountWrites> {
  const targets: Array<{ ref: DocumentReference; field: string; delta: number; kind: 'game' | 'channel' | 'tag' }> = [];
  for (const [id, delta] of deltas.games) targets.push({ ref: adminDb.collection('games').doc(id), field: 'playlistCount', delta, kind: 'game' });
  for (const [id, delta] of deltas.channels) targets.push({ ref: adminDb.collection('channels').doc(id), field: 'playlistCount', delta, kind: 'channel' });
  for (const [id, delta] of deltas.tags) targets.push({ ref: adminDb.collection('tags').doc(id), field: 'usagePlaylistCount', delta, kind: 'tag' });
  if (targets.length === 0) return NOTHING;

  const snaps = await read(targets.map((t) => t.ref));
  const exists = new Set(snaps.filter((s) => s.exists).map((s) => s.ref.path));
  return {
    write(writer) {
      for (const t of targets) {
        if (exists.has(t.ref.path)) {
          update(writer, t.ref, { [t.field]: FieldValue.increment(t.delta) });
        } else if (t.kind === 'channel' && t.delta > 0 && options.channelSeed) {
          create(writer, t.ref, newChannelPageDoc(t.ref.id, options.channelSeed, t.delta, options.now ?? new Date()));
        }
      }
    },
  };
}

/**
 * ゲームタイトルの件数（genres・themes の gameTitleCount）を書く。マスタは消さない運用なので、存在の確認はしない
 * （ジャンル・テーマの実在は lib/admin-game-input.ts で確かめてから呼ぶ）。
 */
export function writeGameMasterCounts(writer: CountWriter, deltas: GameMasterCountDeltas): void {
  for (const [id, delta] of deltas.genres) update(writer, adminDb.collection('genres').doc(id), { gameTitleCount: FieldValue.increment(delta) });
  for (const [id, delta] of deltas.themes) update(writer, adminDb.collection('themes').doc(id), { gameTitleCount: FieldValue.increment(delta) });
}
