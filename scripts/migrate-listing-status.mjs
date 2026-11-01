// 掲載状態（playlists.listingStatus）の一回だけの移行スクリプト（リブランディング段階3）。
// コンテンツ収集機能仕様書 §10.9、Firestore データモデル設計書 §3.2・§3.32、リブランディング検討 項目10。
//
// やること:
//   1. 既存の再生リスト（listingStatus が無いもの）の所属チャンネルごとに、掲載する／非表示にするを決めて書き込む。
//      掲載するチャンネル → listed（listingSetBy: admin）。--off に挙げたチャンネル → channel_off（消さない。
//      previousListingStatus に listed を残す）。
//   2. 掲載するチャンネルを認定チャンネル（exploration_channels, status: active）にそろえる。
//      既にある active はそのまま（publishMode / authorizedVia が無ければ足す）。名前が同じ未特定のものは active に上げる。
//      無ければ authorizedVia: migration で作る。--off のチャンネルに active の認定があれば excluded にする。
//   3. 件数を数え直す（games.playlistCount・channels.playlistCount・tags.usagePlaylistCount は掲載中だけ数える）。
//
// 使い方（既定は確認だけ。書き込まない）:
//   node scripts/migrate-listing-status.mjs --target=stg
//   node scripts/migrate-listing-status.mjs --target=stg --off=UCxxxx,UCyyyy --apply
//   node scripts/migrate-listing-status.mjs --target=prod --off=... --apply   ← 本番に反映する前に、必ず stg と同じ内容で確認すること
//
// 冪等性: listingStatus が既にある再生リストは変えない。件数の数え直しは何度実行しても同じ結果。
// 本番へ適用してからアプリをデプロイすること（先にデプロイすると、移行前の再生リストが検索面から消える）。
import { initFirestore } from './lib/firebase-admin.mjs';

const BATCH_SIZE = 400;

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

function parseTarget() {
  const target = arg('target');
  if (target !== 'prod' && target !== 'stg') throw new Error('--target=prod または --target=stg を指定してください。');
  return target;
}

async function commitInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_SIZE).forEach((op) => op(batch));
    await batch.commit();
  }
}

async function main() {
  const target = parseTarget();
  const apply = process.argv.includes('--apply');
  const off = new Set((arg('off') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const { db, projectId } = initFirestore(target);
  console.log(`対象プロジェクト: ${projectId}（${apply ? '書き込みあり' : '確認のみ。書き込まない'}）`);

  const [playlistsSnap, exploSnap, candidatesSnap] = await Promise.all([
    db.collection('playlists').get(),
    db.collection('exploration_channels').get(),
    db.collection('collection_candidates').select('status').get(),
  ]);
  const registeredCandidateIds = new Set(candidatesSnap.docs.filter((d) => d.data().status === 'registered').map((d) => d.id));

  // チャンネルごとの集計
  const channels = new Map();
  for (const d of playlistsSnap.docs) {
    const p = d.data();
    const c = channels.get(p.channelId) ?? { name: p.channelName ?? '', total: 0, pending: 0 };
    c.total += 1;
    if (!p.listingStatus) c.pending += 1;
    channels.set(p.channelId, c);
  }
  for (const id of off) if (!channels.has(id)) console.warn(`警告: --off のチャンネル ${id} は再生リストが見つかりません。`);

  const exploByYoutubeId = new Map(exploSnap.docs.filter((d) => d.data().youtubeChannelId).map((d) => [d.data().youtubeChannelId, d]));
  const unresolvedByName = new Map(
    exploSnap.docs.filter((d) => !d.data().youtubeChannelId && ['unresolved', 'pending_confirm'].includes(d.data().status)).map((d) => [d.data().name, d]),
  );

  console.log('\nチャンネル\t再生リスト\t未移行\t判定\t認定チャンネル');
  const now = new Date();
  const exploOps = [];
  const exploIdByChannel = new Map();
  for (const [channelId, c] of channels) {
    const listed = !off.has(channelId);
    const existing = exploByYoutubeId.get(channelId);
    let note;
    if (listed) {
      if (existing && existing.data().status === 'active') {
        exploIdByChannel.set(channelId, existing.id);
        const patch = {};
        if (!existing.data().publishMode) patch.publishMode = 'confirm';
        if (!existing.data().authorizedVia) patch.authorizedVia = 'admin';
        if (!existing.data().authorizedAt) patch.authorizedAt = existing.data().createdAt ?? now;
        note = `既存(active)${Object.keys(patch).length ? '・足す: ' + Object.keys(patch).join(',') : ''}`;
        if (Object.keys(patch).length) exploOps.push((b) => b.update(existing.ref, { ...patch, updatedAt: now }));
      } else if (existing) {
        exploIdByChannel.set(channelId, existing.id);
        note = `既存(${existing.data().status})を active に`;
        exploOps.push((b) => b.update(existing.ref, { status: 'active', publishMode: existing.data().publishMode ?? 'confirm', authorizedVia: 'migration', authorizedAt: now, updatedAt: now }));
      } else if (unresolvedByName.has(c.name)) {
        const doc = unresolvedByName.get(c.name);
        exploIdByChannel.set(channelId, doc.id);
        note = `同名の未特定(${doc.data().status})を active に`;
        exploOps.push((b) =>
          b.update(doc.ref, {
            status: 'active', youtubeChannelId: channelId, channelTitle: c.name, searchCandidates: [],
            publishMode: 'confirm', authorizedVia: 'migration', authorizedAt: now, updatedAt: now,
          }),
        );
      } else {
        const ref = db.collection('exploration_channels').doc();
        exploIdByChannel.set(channelId, ref.id);
        note = '新しく認定(migration)';
        exploOps.push((b) =>
          b.set(ref, {
            name: c.name, status: 'active', youtubeChannelId: channelId, channelTitle: c.name, channelIconUrl: null, subscriberCount: null,
            searchCandidates: [], tagIds: [], publishMode: 'confirm', authorizedVia: 'migration', authorizedAt: now,
            lastExploredAt: null, lastFoundCount: null, createdAt: now, createdBy: 'migration', updatedAt: now,
          }),
        );
      }
    } else if (existing && existing.data().status === 'active') {
      note = '認定を外す(excluded)';
      exploOps.push((b) => b.update(existing.ref, { status: 'excluded', statusNote: '段階3の移行で基準に合わないと判断', updatedAt: now }));
    } else {
      note = existing ? `既存(${existing.data().status})のまま` : '認定なし';
    }
    console.log(`${c.name}(${channelId})\t${c.total}\t${c.pending}\t${listed ? 'listed' : 'channel_off'}\t${note}`);
  }

  // 再生リスト
  const playlistOps = [];
  const finalStatus = new Map(); // playlistId -> listingStatus（件数の数え直し用）
  for (const d of playlistsSnap.docs) {
    const p = d.data();
    if (p.listingStatus) {
      finalStatus.set(d.id, p.listingStatus);
      continue;
    }
    const listed = !off.has(p.channelId);
    const status = listed ? 'listed' : 'channel_off';
    finalStatus.set(d.id, status);
    const source = p.proposedBy ? 'user_proposal' : registeredCandidateIds.has(d.id) ? 'collection_candidate' : 'admin';
    playlistOps.push((b) =>
      b.update(d.ref, {
        listingStatus: status,
        listingReason: listed ? 'migration' : 'channel_excluded',
        listingSetBy: 'admin',
        listingSetAt: now,
        previousListingStatus: listed ? null : 'listed',
        source,
        explorationChannelId: listed ? exploIdByChannel.get(p.channelId) ?? null : null,
      }),
    );
  }

  // 件数の数え直し（掲載中だけ数える）
  const [gamesSnap, channelsSnap, tagsSnap] = await Promise.all([
    db.collection('games').get(),
    db.collection('channels').get(),
    db.collection('tags').get(),
  ]);
  const gameCount = new Map();
  const channelCount = new Map();
  const tagCount = new Map();
  for (const d of playlistsSnap.docs) {
    if (finalStatus.get(d.id) !== 'listed') continue;
    const p = d.data();
    if (p.gameId) gameCount.set(p.gameId, (gameCount.get(p.gameId) ?? 0) + 1);
    channelCount.set(p.channelId, (channelCount.get(p.channelId) ?? 0) + 1);
    for (const t of new Set(p.playlistTagIds ?? [])) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
  }
  const countOps = [];
  const diffs = [];
  for (const d of gamesSnap.docs) {
    const actual = gameCount.get(d.id) ?? 0;
    if ((d.data().playlistCount ?? 0) !== actual) { diffs.push(`games/${d.data().title}: ${d.data().playlistCount ?? 0} → ${actual}`); countOps.push((b) => b.update(d.ref, { playlistCount: actual })); }
  }
  for (const d of channelsSnap.docs) {
    const actual = channelCount.get(d.id) ?? 0;
    if ((d.data().playlistCount ?? 0) !== actual) { diffs.push(`channels/${d.data().name}: ${d.data().playlistCount ?? 0} → ${actual}`); countOps.push((b) => b.update(d.ref, { playlistCount: actual })); }
  }
  for (const d of tagsSnap.docs) {
    const actual = tagCount.get(d.id) ?? 0;
    if ((d.data().usagePlaylistCount ?? 0) !== actual) { diffs.push(`tags/${d.data().name}: ${d.data().usagePlaylistCount ?? 0} → ${actual}`); countOps.push((b) => b.update(d.ref, { usagePlaylistCount: actual })); }
  }

  const listedCount = [...finalStatus.values()].filter((s) => s === 'listed').length;
  console.log(`\n再生リスト: 全${playlistsSnap.size}件のうち ${playlistOps.length}件を移行（移行後 listed ${listedCount}件・channel_off ${finalStatus.size - listedCount}件）`);
  console.log(`認定チャンネル: ${exploOps.length}件を更新・作成`);
  console.log(`件数の補正: ${countOps.length}件`);
  diffs.forEach((x) => console.log(`  ${x}`));

  if (!apply) {
    console.log('\n確認のみです。反映するには --apply を付けて再実行してください。');
    return;
  }
  await commitInChunks(db, exploOps);
  await commitInChunks(db, playlistOps);
  await commitInChunks(db, countOps);
  console.log('完了');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
