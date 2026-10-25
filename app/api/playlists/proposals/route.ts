import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '../../../../lib/api-auth';
import { adminDb } from '../../../../lib/firebase-admin';
import { PLAYLIST_PROPOSAL_TYPE, proposalRejectReasonLabel } from '../../../../lib/proposal-shared';

// 自分の再生リスト登録提案の一覧（提案履歴、ページ 再生リストを追加する 仕様書 §9.4）。
// workflows は rules 上本人も直接読めるが、運営メモ（operatorMemo）や内部向けの自由記述（step2History.comment）を
// 渡さないよう、表示に要る項目だけを API で返す。見送り理由は定型の文言（管理 審査ワークフロー仕様書 §14.4）のみ。
// 並び順は提案日時の新しい順（submittedBy と type の等価条件のみで引き、並べ替えはメモリ上で行う。複合インデックス不要）。
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('errorResponse' in auth) return auth.errorResponse;

  const snap = await adminDb
    .collection('workflows')
    .where('submittedBy', '==', auth.uid)
    .where('type', '==', PLAYLIST_PROPOSAL_TYPE)
    .get();

  const proposals = snap.docs
    .map((d) => {
      const data = d.data();
      const p = data.proposalData ?? {};
      const status = data.status === 'approved' ? 'approved' : data.status === 'rejected' ? 'rejected' : 'reviewing';
      const history = (data.step2History ?? []) as Array<{ executedAt?: { toMillis?: () => number } }>;
      const decided = status !== 'reviewing' ? history[history.length - 1] : undefined;
      return {
        id: d.id,
        status,
        title: (p.title as string) ?? '',
        thumbnailUrl: (p.thumbnailUrl as string) ?? '',
        channelName: (p.channelName as string) ?? '',
        channelIconUrl: (p.channelIconUrl as string) ?? '',
        videoCount: (p.itemCount as number) ?? 0,
        // 承認時に差し替えたゲームタイトルがあればそれ、無ければ提案時のゲームタイトル（新しいゲームタイトルならその名前）
        gameName: (p.approvedGameName as string) ?? (p.gameName as string) ?? (p.newGameTitle as string) ?? '',
        isNewGame: !p.gameId && !!p.newGameTitle,
        submittedAt: data.submittedAt?.toMillis?.() ?? 0,
        decidedAt: decided?.executedAt?.toMillis?.() ?? null,
        registeredPlaylistId: status === 'approved' ? ((p.registeredPlaylistId as string) ?? null) : null,
        rejectReason: status === 'rejected' ? proposalRejectReasonLabel(p.rejectReasonCode) : null,
      };
    })
    .sort((a, b) => b.submittedAt - a.submittedAt);

  return NextResponse.json({ proposals });
}
