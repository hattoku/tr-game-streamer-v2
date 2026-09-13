// NGワード（スパム・勧誘系の最小セット）の初期投入スクリプト。
//
// 使い方:
//   node scripts/seed-ng-words.mjs --target=stg
//   node scripts/seed-ng-words.mjs --target=prod
//
// 差別語・侮蔑語・暴力表現等の追加はこのスクリプトでは行わない。運営者が
// Firebaseコンソールから`ng_words`コレクションへ直接追加すること（scripts/data/ng-words.mjs参照）。
// 冪等性: 既存ドキュメントは`word`で照合し、存在すればスキップする。
import { initFirestore } from './lib/firebase-admin.mjs';
import { NG_WORDS } from './data/ng-words.mjs';

function parseTarget() {
  const arg = process.argv.find((a) => a.startsWith('--target='));
  const target = arg?.split('=')[1];
  if (target !== 'prod' && target !== 'stg') {
    throw new Error('--target=prod または --target=stg を指定してください。');
  }
  return target;
}

async function main() {
  const target = parseTarget();
  const { db, projectId } = initFirestore(target);
  console.log(`投入先プロジェクト: ${projectId}`);

  const existing = await db.collection('ng_words').get();
  const existingWords = new Set(existing.docs.map((d) => d.data().word));
  const toCreate = NG_WORDS.filter((w) => !existingWords.has(w));

  const batch = db.batch();
  for (const word of toCreate) {
    const ref = db.collection('ng_words').doc();
    batch.set(ref, { word, createdBy: 'system', createdAt: new Date() });
  }
  if (toCreate.length > 0) await batch.commit();

  console.log(`ng_words: 既存${existingWords.size}件 / 新規作成${toCreate.length}件（全${NG_WORDS.length}件）`);
  console.log('完了');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
