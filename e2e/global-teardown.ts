// 実行後: テストで作ったデータを消す（テストが失敗しても必ず実行される）
import { cleanupE2eData } from './support/cleanup';

export default async function globalTeardown() {
  const removed = await cleanupE2eData();
  console.log(`[e2e] テストデータを削除しました（お問い合わせ ${removed.inquiries} 件・通知 ${removed.notifications} 件・収集候補 ${removed.candidates} 件・ゲームタイトル ${removed.games} 件）`);
}
