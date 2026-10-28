// 実行前: 前回の実行が途中で止まって残ったテストデータを消す
import { cleanupE2eData } from './support/cleanup';

export default async function globalSetup() {
  const removed = await cleanupE2eData();
  if (removed.inquiries > 0 || removed.candidates > 0 || removed.games > 0) {
    console.log(
      `[e2e] 前回の残りのテストデータを削除しました（お問い合わせ ${removed.inquiries} 件・通知 ${removed.notifications} 件・収集候補 ${removed.candidates} 件・ゲームタイトル ${removed.games} 件）`,
    );
  }
}
