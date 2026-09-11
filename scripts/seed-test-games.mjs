// フェーズ2 開発用テスト`games`データの投入スクリプト。
//
// 使い方:
//   node scripts/seed-test-games.mjs --target=stg
//   node scripts/seed-test-games.mjs --target=prod
//
// 事前準備: scripts/seed-master-data.mjs と同様（gcloud auth application-default login）。
// genres/themes/tagsが投入済みであることが前提（npm run seed:master:* を先に実行）。
//
// 冪等性: 既存ゲームは`title`で照合し、存在すればスキップする。
import { initFirestore } from './lib/firebase-admin.mjs';
import { TEST_GAMES } from './data/test-games.mjs';

function parseTarget() {
  const arg = process.argv.find((a) => a.startsWith('--target='));
  const target = arg?.split('=')[1];
  if (target !== 'prod' && target !== 'stg') {
    throw new Error('--target=prod または --target=stg を指定してください。');
  }
  return target;
}

async function loadNameToIdMap(db, collectionName) {
  const snapshot = await db.collection(collectionName).get();
  const map = new Map();
  snapshot.docs.forEach((doc) => map.set(doc.data().name, doc.id));
  return map;
}

async function seedTestGames(db) {
  const existing = await db.collection('games').get();
  const existingTitles = new Set(existing.docs.map((d) => d.data().title));

  const genreIdByName = await loadNameToIdMap(db, 'genres');
  const themeIdByName = await loadNameToIdMap(db, 'themes');
  const tagIdByName = await loadNameToIdMap(db, 'tags');

  const toCreate = TEST_GAMES.filter((g) => !existingTitles.has(g.title));

  const missingRefs = [];
  const batch = db.batch();
  for (const game of toCreate) {
    const genreId = genreIdByName.get(game.genre) ?? null;
    if (!genreId) missingRefs.push(`genre "${game.genre}" (${game.title})`);

    const themeIds = game.themes.map((name) => themeIdByName.get(name)).filter(Boolean);
    if (themeIds.length !== game.themes.length) missingRefs.push(`themes of "${game.title}"`);

    const gameTagIds = game.tags.map((name) => tagIdByName.get(name)).filter(Boolean);
    if (gameTagIds.length !== game.tags.length) missingRefs.push(`tags of "${game.title}"`);

    const ref = db.collection('games').doc();
    batch.set(ref, {
      rakutenItemCode: null,
      rakutenItemName: null,
      title: game.title,
      packageImageUrl: null,
      rakutenUrl: null,
      description: null,
      isAiGeneratedDescription: false,
      platforms: game.platforms,
      genreId,
      genreName: game.genre,
      themeIds,
      gameTagIds,
      gameTagsFixed: [],
      playlistCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  if (missingRefs.length > 0) {
    throw new Error(
      `マスタ参照が解決できませんでした。genres/themes/tagsの投入状況を確認してください:\n` +
        missingRefs.map((m) => `  - ${m}`).join('\n'),
    );
  }

  if (toCreate.length > 0) await batch.commit();

  console.log(
    `games: 既存${existingTitles.size}件 / 新規作成${toCreate.length}件（全${TEST_GAMES.length}件）`,
  );
}

async function main() {
  const target = parseTarget();
  const { db, projectId } = initFirestore(target);
  console.log(`投入先プロジェクト: ${projectId}`);

  await seedTestGames(db);

  console.log('完了');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
