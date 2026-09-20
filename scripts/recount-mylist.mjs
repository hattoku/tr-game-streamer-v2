// `playlists.mylistCount` の再集計スクリプト（HANDOFF.md 未解決事項11、フェーズ4.5ステップ3）。
//
// これまで `mylist` の作成・削除がクライアントSDK直書きで、増減処理がどこにも無かったため
// 常に0のままだった。app/api/mylist（新設）・app/api/reviews/upsert への increment 追加で
// 今後の増減は正しくなるが、既存の `mylist` ドキュメントぶんのズレはこのスクリプトで
// 数え直す必要がある。
//
// 使い方:
//   node scripts/recount-mylist.mjs --target=stg
//   node scripts/recount-mylist.mjs --target=prod
//
// 冪等性: 実際の `mylist` 件数を `playlists.mylistCount` へ都度上書きするだけなので、
// 何度実行しても結果は同じ。値が既に一致している再生リストは書き込みをスキップする。
import { initFirestore } from './lib/firebase-admin.mjs';

const BATCH_SIZE = 400; // Firestoreの1バッチ上限500に対して余裕を持たせる

function parseTarget() {
  const arg = process.argv.find((a) => a.startsWith('--target='));
  const target = arg?.split('=')[1];
  if (target !== 'prod' && target !== 'stg') {
    throw new Error('--target=prod または --target=stg を指定してください。');
  }
  return target;
}

async function recountMylist(db) {
  const [mylistSnap, playlistsSnap] = await Promise.all([db.collection('mylist').get(), db.collection('playlists').get()]);

  const actualCounts = new Map();
  mylistSnap.docs.forEach((d) => {
    const playlistId = d.data().playlistId;
    if (!playlistId) return;
    actualCounts.set(playlistId, (actualCounts.get(playlistId) ?? 0) + 1);
  });

  const mismatches = playlistsSnap.docs
    .map((d) => ({ ref: d.ref, current: d.data().mylistCount ?? 0, actual: actualCounts.get(d.id) ?? 0 }))
    .filter((row) => row.current !== row.actual);

  for (let i = 0; i < mismatches.length; i += BATCH_SIZE) {
    const chunk = mismatches.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((row) => batch.update(row.ref, { mylistCount: row.actual }));
    await batch.commit();
  }

  console.log(`playlists: 全${playlistsSnap.size}件中 ${mismatches.length}件のmylistCountを補正しました。`);
}

async function main() {
  const target = parseTarget();
  const { db, projectId } = initFirestore(target);
  console.log(`対象プロジェクト: ${projectId}`);

  await recountMylist(db);

  console.log('完了');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
