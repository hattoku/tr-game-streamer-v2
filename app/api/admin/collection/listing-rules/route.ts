import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { loadListingRules } from '@/lib/channel-sweep';
import { cleanWords, judgeListing, parseListingRules, publishModeOf, type PublishMode } from '@/lib/listing-rules';
import { unlistPlaylist } from '@/lib/listing-server';

// 判定の言葉の表（app_settings/listing_rules）の保存と、判定し直しのAPI（管理者専用。収集候補レビューUI仕様書 §8.4・§8.6）。
//   { action: 'save', excludedWords, nonGameWords, minVideoCount }   保存（次の巡回から効く）
//   { action: 'rejudge' }   自動で決めた（listingSetBy: auto）再生リストを、保存済みの表で判定し直す。人が決めたものは変えない
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.action === 'save') {
    const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : null);
    const excluded = strings(body.excludedWords);
    const nonGame = strings(body.nonGameWords);
    const min = body.minVideoCount;
    if (!excluded || !nonGame || typeof min !== 'number' || !Number.isInteger(min) || min < 1 || min > 100) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const rules = parseListingRules({ excludedWords: cleanWords(excluded), nonGameWords: cleanWords(nonGame), minVideoCount: min });
    await adminDb.collection('app_settings').doc('listing_rules').set({ ...rules, updatedAt: new Date(), updatedBy: auth.uid });
    return NextResponse.json({ ok: true, rules });
  }

  if (body.action === 'rejudge') {
    const rules = await loadListingRules();
    const modes = new Map<string, PublishMode>();
    const snap = await adminDb.collection('playlists').where('listingSetBy', '==', 'auto').get();
    const changed = { unconfirmed: 0, non_game: 0, excluded: 0, too_short: 0 };
    for (const doc of snap.docs) {
      const data = doc.data();
      const status = data.listingStatus as string;
      if (status === 'channel_off' || data.isPublic !== true) continue;
      const channelId = data.explorationChannelId as string | null;
      if (channelId && !modes.has(channelId)) {
        const ch = await adminDb.collection('exploration_channels').doc(channelId).get();
        modes.set(channelId, publishModeOf(ch.data()));
      }
      const judged = judgeListing({ title: (data.title as string) ?? '', itemCount: (data.videoCount as number) ?? 0 }, rules, 'confirm');
      // 掲載方法が「自動」のチャンネルで確認待ちになるものは、次の巡回で自動掲載にするため auto_pending にする
      const next =
        judged.status === 'unconfirmed' && channelId && modes.get(channelId) === 'auto' ? { status: 'unconfirmed' as const, reason: 'auto_pending' } : judged;
      if (status === 'listed') {
        // 掲載中のものは、ルールに当たるようになったときだけ外す
        if (next.status === 'unconfirmed') continue;
      } else if (status === next.status && data.listingReason === next.reason) {
        continue;
      }
      const result = await unlistPlaylist(doc.id, next.status as 'unconfirmed' | 'non_game' | 'excluded' | 'too_short', { setBy: 'auto', reason: next.reason });
      if (result.ok && result.changed) changed[next.status as keyof typeof changed]++;
    }
    return NextResponse.json({ changed });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
