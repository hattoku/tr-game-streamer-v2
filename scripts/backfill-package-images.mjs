// 既存ゲームタイトル（packageImageUrlが未設定のもの）に、楽天ブックスゲーム検索APIで
// パッケージ画像を後付けするワンショットスクリプト（フェーズ4.5ステップ8の続き）。
// `scripts/data/test-games.mjs`由来のテストデータ5件（seed時にpackageImageUrl: nullで投入）を
// 想定しているが、条件は「packageImageUrlが無い」ことなので、他の経路で作られた
// 画像なしゲームにも同様に使える。
//
// 使い方:
//   node scripts/backfill-package-images.mjs --target=stg          # 候補を表示するだけ（既定はdry-run）
//   node scripts/backfill-package-images.mjs --target=stg --apply  # 実際にFirestoreへ書き込む
//   node scripts/backfill-package-images.mjs --target=prod --apply
//
// マッチング方針: タイトル名で検索した結果には、ゲーム本編以外の周辺グッズ（キャリングケース・
// 文房具等）も混ざる（楽天ブックスの`booksGenreId`既定値006はホビー系全般を含むため、ゲーム
// ソフトに限定できていない）。誤ったグッズの画像を掴まないよう、既存の`platforms`フィールドと
// 検索結果の`hardware`が一致する候補のみを採用する。一致candidateが無いタイトルはスキップし、
// 手動確認が必要な旨を出力する（冪等性: packageImageUrlが既に設定されているゲームはそもそも
// 対象に含めないため、何度実行しても安全）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initFirestore } from './lib/firebase-admin.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = 'https://openapi.rakuten.co.jp/services/api/BooksGame/Search/20170404';
const REQUEST_ORIGIN = 'https://puremite.net';

// タイトル名検索では自動照合できなかったもの（platformsの表記が実物パッケージのhardwareと
// 食い違う、または楽天ブックス側の検索インデックスに乗っていない等）を、ユーザーが楽天ブックスの
// サイトで目視確認したJANコードで人力補完する（2026-09-21）。JAN検索はavailability/genreの
// 曖昧さの影響を受けないため、この場合はhardwareの自動照合をスキップして無条件に採用する。
const MANUAL_JAN_OVERRIDES = {
  'ゼルダの伝説 ティアーズ オブ ザ キングダム': '4902370550979',
  'モンスターハンターライズ': '4976219115803',
  'エルデンリング': '4949776441067',
};

function parseArgs() {
  const target = process.argv.find((a) => a.startsWith('--target='))?.split('=')[1];
  if (target !== 'prod' && target !== 'stg') {
    throw new Error('--target=prod または --target=stg を指定してください。');
  }
  const apply = process.argv.includes('--apply');
  return { target, apply };
}

function loadEnvLocal() {
  const path = join(__dirname, '..', '.env.local');
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

async function searchRakutenGames(title, env) {
  const url = new URL(API_URL);
  url.searchParams.set('applicationId', env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set('accessKey', env.RAKUTEN_ACCESS_KEY);
  url.searchParams.set('title', title);
  url.searchParams.set('hits', '10');
  // availabilityが空文字のタイトルは既定のoutOfStockFlag=0だと除外される（lib/rakuten.ts参照）
  url.searchParams.set('outOfStockFlag', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');

  const res = await fetch(url, { headers: { Referer: `${REQUEST_ORIGIN}/`, Origin: REQUEST_ORIGIN } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`楽天API呼び出し失敗 (${res.status}): ${body?.errors?.errorMessage ?? ''}`);
  }
  const data = await res.json();
  return data.Items ?? [];
}

// 「Nintendo Switch」「PS5」のような表記ゆれを緩く許容する正規化（大文字小文字・空白差異のみ）
function normalize(s) {
  return (s ?? '').toLowerCase().replace(/\s+/g, '');
}

async function searchRakutenByJan(jan, env) {
  const url = new URL(API_URL);
  url.searchParams.set('applicationId', env.RAKUTEN_APPLICATION_ID);
  url.searchParams.set('accessKey', env.RAKUTEN_ACCESS_KEY);
  url.searchParams.set('jan', jan);
  url.searchParams.set('outOfStockFlag', '1');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');

  const res = await fetch(url, { headers: { Referer: `${REQUEST_ORIGIN}/`, Origin: REQUEST_ORIGIN } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`楽天API呼び出し失敗 (${res.status}): ${body?.errors?.errorMessage ?? ''}`);
  }
  const data = await res.json();
  return data.Items ?? [];
}

async function main() {
  const { target, apply } = parseArgs();
  const env = loadEnvLocal();
  if (!env.RAKUTEN_APPLICATION_ID || !env.RAKUTEN_ACCESS_KEY) {
    throw new Error('.env.local に RAKUTEN_APPLICATION_ID / RAKUTEN_ACCESS_KEY がありません。');
  }

  const { db, projectId } = initFirestore(target);
  console.log(`対象プロジェクト: ${projectId}（${apply ? '書き込みあり' : 'dry-run、--applyで実際に書き込み'}）`);

  const snap = await db.collection('games').where('packageImageUrl', '==', null).get();
  console.log(`packageImageUrl未設定のゲーム: ${snap.size}件`);

  // 短時間に連続アクセスすると429（一定時間利用不可）になるため、リクエスト間隔を空ける
  let first = true;
  for (const doc of snap.docs) {
    if (!first) await new Promise((r) => setTimeout(r, 2000));
    first = false;

    const game = doc.data();
    const platforms = (game.platforms ?? []).map(normalize);

    const manualJan = MANUAL_JAN_OVERRIDES[game.title];
    if (manualJan) {
      let janItems;
      try {
        janItems = await searchRakutenByJan(manualJan, env);
      } catch (e) {
        console.log(`- [${game.title}] JAN検索エラー: ${e.message}`);
        continue;
      }
      const janMatched = janItems[0];
      if (!janMatched) {
        console.log(`- [${game.title}] JAN ${manualJan} で検索したが見つかりませんでした`);
        continue;
      }
      const imageUrl = janMatched.largeImageUrl || janMatched.mediumImageUrl || janMatched.smallImageUrl || '';
      console.log(`- [${game.title}] (手動JAN指定) → "${janMatched.title}" (${janMatched.hardware}) ${imageUrl}`);
      if (apply) {
        await doc.ref.update({
          packageImageUrl: imageUrl,
          rakutenUrl: janMatched.itemUrl ?? null,
          rakutenItemCode: janMatched.jan ? String(janMatched.jan) : null,
          rakutenItemName: janMatched.title ?? null,
          updatedAt: new Date(),
        });
      }
      continue;
    }

    let items;
    try {
      items = await searchRakutenGames(game.title, env);
    } catch (e) {
      console.log(`- [${game.title}] 検索エラー: ${e.message}`);
      continue;
    }

    let matched = items.find((item) => platforms.includes(normalize(item.hardware)));

    // 「スカーレット・バイオレット」のような同時発売2作品名は、楽天ブックスでは各バージョンが
    // 別商品として登録されているため完全一致では引っかからない。「・」区切りの1つ目だけで再検索する
    if (!matched && game.title.includes('・')) {
      await new Promise((r) => setTimeout(r, 2000));
      const shortTitle = game.title.split('・')[0].trim();
      try {
        const retryItems = await searchRakutenGames(shortTitle, env);
        matched = retryItems.find((item) => platforms.includes(normalize(item.hardware)));
        if (matched) items = retryItems;
      } catch (e) {
        console.log(`- [${game.title}] 再検索エラー: ${e.message}`);
      }
    }

    if (!matched) {
      console.log(`- [${game.title}] 一致する候補なし（${items.length}件中、platforms=${game.platforms?.join('/')}）。手動確認してください`);
      continue;
    }

    const imageUrl = matched.largeImageUrl || matched.mediumImageUrl || matched.smallImageUrl || '';
    console.log(`- [${game.title}] → "${matched.title}" (${matched.hardware}) ${imageUrl}`);

    if (apply) {
      await doc.ref.update({
        packageImageUrl: imageUrl,
        rakutenUrl: matched.itemUrl ?? null,
        rakutenItemCode: matched.jan ? String(matched.jan) : null,
        rakutenItemName: matched.title ?? null,
        updatedAt: new Date(),
      });
    }
  }

  console.log('完了');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
