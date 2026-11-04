// 運営者タグ（origin: operator）の名前→ID（サーバー専用）。タグ候補・チャンネル単位タグはこの範囲に限る
// （管理_Ai運営者 コンテンツ収集機能仕様書 §3.5）。
import { adminDb } from './firebase-admin';

export async function fetchOperatorTagIdsByName(): Promise<Map<string, string>> {
  const snap = await adminDb.collection('tags').where('origin', '==', 'operator').get();
  return new Map(snap.docs.map((d) => [d.data().name as string, d.id]));
}
