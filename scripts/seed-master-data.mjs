// マスタデータ（ジャンル・テーマ・タグ）の初期投入スクリプト。
//
// 使い方:
//   node scripts/seed-master-data.mjs --target=stg   # まずステージングで確認
//   node scripts/seed-master-data.mjs --target=prod
//
// 事前準備:
//   `gcloud auth application-default login` を実行し、対象Firebaseプロジェクトに対して
//   Firestoreへの書き込み権限を持つGoogleアカウントでログインしておくこと
//   （サービスアカウント鍵ファイルは使わない。scripts/lib/firebase-admin.mjs参照）。
//
// 冪等性: 既存ドキュメントは名前で照合し、存在すればスキップする。何度実行しても
// 重複作成されない（タグの連番も、新規追加分だけカウンタを消費する）。
import { initFirestore } from './lib/firebase-admin.mjs';
import { issueTagIds } from './lib/tag-id.mjs';
import { GENRES_WITH_THEMES } from './data/genres-and-themes.mjs';
import { GAME_TITLE_TAGS, PLAYLIST_TAGS } from './data/tags.mjs';

function parseTarget() {
  const arg = process.argv.find((a) => a.startsWith('--target='));
  const target = arg?.split('=')[1];
  if (target !== 'prod' && target !== 'stg') {
    throw new Error('--target=prod または --target=stg を指定してください。');
  }
  return target;
}

async function seedGenres(db) {
  const existing = await db.collection('genres').get();
  const existingNames = new Set(existing.docs.map((d) => d.data().name));

  const names = GENRES_WITH_THEMES.map((g) => g.genre);
  const toCreate = names.filter((name) => !existingNames.has(name));

  const batch = db.batch();
  for (const name of toCreate) {
    const ref = db.collection('genres').doc();
    batch.set(ref, {
      name,
      rakutenCategoryId: null,
      gameTitleCount: 0,
      createdAt: new Date(),
    });
  }
  if (toCreate.length > 0) await batch.commit();

  console.log(`genres: 既存${existingNames.size}件 / 新規作成${toCreate.length}件（全${names.length}件）`);
  return { created: toCreate.length, skipped: names.length - toCreate.length };
}

async function seedThemes(db) {
  const existing = await db.collection('themes').get();
  const existingNames = new Set(existing.docs.map((d) => d.data().name));

  // ジャンルごとのテーマ一覧を名前で重複排除してフラット化する（genres-and-themes.mjs参照）。
  const uniqueNames = [...new Set(GENRES_WITH_THEMES.flatMap((g) => g.themes))];
  const toCreate = uniqueNames.filter((name) => !existingNames.has(name));

  const batch = db.batch();
  for (const name of toCreate) {
    const ref = db.collection('themes').doc();
    batch.set(ref, {
      name,
      rakutenCategoryId: null,
      gameTitleCount: 0,
      createdAt: new Date(),
    });
  }
  if (toCreate.length > 0) await batch.commit();

  console.log(`themes: 既存${existingNames.size}件 / 新規作成${toCreate.length}件（重複排除後全${uniqueNames.length}件）`);
  return { created: toCreate.length, skipped: uniqueNames.length - toCreate.length };
}

async function seedTags(db) {
  const existing = await db.collection('tags').get();
  const existingNames = new Set(existing.docs.map((d) => d.data().name));

  // ゲームタイトルタグ・再生リストタグは共通の`tags`コレクションを使うため、
  // 名前で重複排除して1つのリストにまとめる（tags.mjsのコメント参照）。
  const uniqueNames = [...new Set([...GAME_TITLE_TAGS, ...PLAYLIST_TAGS])];
  const toCreate = uniqueNames.filter((name) => !existingNames.has(name));

  const ids = await issueTagIds(db, toCreate.length);

  const batch = db.batch();
  toCreate.forEach((name, i) => {
    const tagId = ids[i];
    const ref = db.collection('tags').doc(tagId);
    batch.set(ref, {
      tagId,
      name,
      origin: 'operator',
      usagePlaylistCount: 0,
      usageGameCount: 0,
      createdAt: new Date(),
      createdBy: null,
    });
  });
  if (toCreate.length > 0) await batch.commit();

  console.log(`tags: 既存${existingNames.size}件 / 新規作成${toCreate.length}件（重複排除後全${uniqueNames.length}件）`);
  return { created: toCreate.length, skipped: uniqueNames.length - toCreate.length };
}

async function main() {
  const target = parseTarget();
  const { db, projectId } = initFirestore(target);
  console.log(`投入先プロジェクト: ${projectId}`);

  await seedGenres(db);
  await seedThemes(db);
  await seedTags(db);

  console.log('完了');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
