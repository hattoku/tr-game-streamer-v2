import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { fetchPlaylistItems, YouTubeApiError } from '@/lib/youtube';
import { PLAYLIST_PROPOSAL_TYPE } from '@/lib/proposal-shared';

// 再生リスト登録提案の審査詳細に出す動画一覧（管理 審査ワークフロー仕様書 §14.4）。
// YouTube へ移らずに中身（ゲームが混ざっていないか等）を確かめるため、提案の再生リストの動画を都度取得して返す。
// 返すのは表示に要るサムネ・タイトル・動画IDだけ（審査中の判断材料なので保存はしない）。
export async function GET(request: NextRequest, { params }: { params: Promise<{ workflowId: string }> }) {
  const auth = await requireAdmin(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const { workflowId } = await params;
  const snap = await adminDb.collection('workflows').doc(workflowId).get();
  const data = snap.data();
  if (!data || data.type !== PLAYLIST_PROPOSAL_TYPE) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  const playlistId = data.proposalData?.youtubePlaylistId as string | undefined;
  if (!playlistId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    const items = await fetchPlaylistItems(playlistId);
    return NextResponse.json({
      videos: items.map((i) => ({ youtubeVideoId: i.youtubeVideoId, title: i.title, thumbnailUrl: i.thumbnailUrl })),
    });
  } catch (e) {
    const message = e instanceof YouTubeApiError ? e.message : 'youtube_api_error';
    return NextResponse.json({ error: 'youtube_api_error', message }, { status: 502 });
  }
}
