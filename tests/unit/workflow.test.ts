// 審査ワークフローの種別をまたぐ処理（lib/workflow-shared.ts）と、審査結果の通知文・変更の提案のまとめ方。
// 管理 審査ワークフロー仕様書 §3（状態と共通の操作）・§4（種別ごと）・§5（画面）。
import { describe, expect, it } from 'vitest';
import {
  APPROVING_LOCK_MS,
  countPendingWorkflows,
  decidedStatus,
  decisionHistoryEntry,
  isApprovingLocked,
  isPendingStatus,
  MAX_OPERATOR_MEMO_LENGTH,
  normalizeDecisionComment,
  normalizeOperatorMemo,
  reviewResultNotification,
  workflowStatusLabel,
} from '@/lib/workflow-shared';
import { gameProposalResultMessage, playlistProposalResultMessage } from '@/lib/proposal-shared';
import { channelApplicationResultMessage } from '@/lib/channel-application-shared';
import { changeGroupKey, changeGroupMajority, groupChangeProposals, type ChangeProposalItem } from '@/lib/change-proposal-shared';

describe('状態（§3.1）', () => {
  it('reviewing_lv1・reviewing_lv2 だけが審査中', () => {
    expect(isPendingStatus('reviewing_lv1')).toBe(true);
    expect(isPendingStatus('reviewing_lv2')).toBe(true);
    expect(isPendingStatus('approved')).toBe(false);
    expect(isPendingStatus('rejected')).toBe(false);
    expect(isPendingStatus(undefined)).toBe(false);
  });

  it('表示名は 審査中／承認／却下', () => {
    expect(workflowStatusLabel('reviewing_lv1')).toBe('審査中');
    expect(workflowStatusLabel('reviewing_lv2')).toBe('審査中');
    expect(workflowStatusLabel('approved')).toBe('承認');
    expect(workflowStatusLabel('rejected')).toBe('却下');
  });

  it('承認で approved、却下で rejected にする', () => {
    expect(decidedStatus('approve')).toBe('approved');
    expect(decidedStatus('reject')).toBe('rejected');
  });
});

describe('承認処理中の印（§3.3）', () => {
  const now = 1_000_000_000;
  it('印が無ければ（0）有効ではない', () => {
    expect(isApprovingLocked(0, now)).toBe(false);
  });
  it('2分以内の印は有効、2分を過ぎたら取り直してよい', () => {
    expect(isApprovingLocked(now - 1000, now)).toBe(true);
    expect(isApprovingLocked(now - APPROVING_LOCK_MS + 1, now)).toBe(true);
    expect(isApprovingLocked(now - APPROVING_LOCK_MS, now)).toBe(false);
  });
});

describe('運営メモ・コメント（§3.2・§3.5）', () => {
  it('運営メモは前後の空白を除き、1,000文字で切る。空なら null、文字列でなければ不正（undefined）', () => {
    expect(normalizeOperatorMemo('  メモ  ')).toBe('メモ');
    expect(normalizeOperatorMemo('   ')).toBeNull();
    expect(normalizeOperatorMemo('あ'.repeat(MAX_OPERATOR_MEMO_LENGTH + 5))).toHaveLength(MAX_OPERATOR_MEMO_LENGTH);
    expect(normalizeOperatorMemo(undefined)).toBeUndefined();
    expect(normalizeOperatorMemo(123)).toBeUndefined();
  });

  it('承認・却下のコメントは空なら null', () => {
    expect(normalizeDecisionComment(' 理由 ')).toBe('理由');
    expect(normalizeDecisionComment('  ')).toBeNull();
    expect(normalizeDecisionComment(null)).toBeNull();
  });

  it('履歴の1件は step2History の形（isAI: false、種別ごとの項目を足せる）', () => {
    const now = new Date('2026-11-17T00:00:00Z');
    expect(decisionHistoryEntry({ now, uid: 'admin1', action: 'reject', comment: 'メモ' })).toEqual({
      executedAt: now,
      operatorId: 'admin1',
      isAI: false,
      action: 'rejected',
      comment: 'メモ',
    });
    expect(decisionHistoryEntry({ now, uid: 'admin1', action: 'approve', comment: null, extra: { approveAction: 'relink' } })).toMatchObject({
      action: 'approved',
      approveAction: 'relink',
    });
  });
});

describe('審査結果の通知（§3.4・§4）', () => {
  const now = new Date('2026-11-17T00:00:00Z');
  it('通知は review_result で未読。遷移先の再生リストが無ければ null', () => {
    expect(reviewResultNotification({ userId: 'u1', workflowId: 'w1', message: 'm', now })).toEqual({
      userId: 'u1',
      type: 'review_result',
      workflowId: 'w1',
      playlistId: null,
      playlistTitle: '',
      message: 'm',
      isRead: false,
      createdAt: now,
    });
  });

  it('再生リスト登録提案: 承認は公開、却下は定型の理由を添える', () => {
    expect(playlistProposalResultMessage('実況A', 'approve', null)).toBe('再生リスト「実況A」の提案が承認され、公開されました');
    expect(playlistProposalResultMessage('実況A', 'reject', 'ゲーム実況の再生リストではない')).toBe(
      '再生リスト「実況A」の提案は見送りになりました（ゲーム実況の再生リストではない）',
    );
  });

  it('ゲームタイトル登録提案: 承認は再生リストに登録、却下は見送り', () => {
    expect(gameProposalResultMessage('ゲームB', 'approve')).toBe('ゲームタイトル「ゲームB」の提案が承認され、再生リストに登録されました');
    expect(gameProposalResultMessage('ゲームB', 'reject')).toContain('ゲームタイトル「ゲームB」の提案は見送りになりました');
  });

  it('チャンネル申請: 承認は順に公開、却下は定型の理由を添える', () => {
    expect(channelApplicationResultMessage('チャンネルC', 'approve', null)).toBe(
      'チャンネル「チャンネルC」の申請が承認されました。再生リストは運営の確認のあと順に公開します',
    );
    expect(channelApplicationResultMessage('チャンネルC', 'reject', 'その他（掲載の基準に合わない）')).toBe(
      'チャンネル「チャンネルC」の申請は見送りになりました（その他（掲載の基準に合わない））',
    );
  });
});

function item(id: string, status: string, submittedAt: number, reportData: Record<string, unknown>, submittedBy = 'u'): ChangeProposalItem {
  return { id, status, submittedAt, submittedBy, reportData };
}

describe('変更の提案のまとめ方（§4.5・§5.1）', () => {
  it('審査中は同じ対象、処理済みは同じ処理でまとめる', () => {
    expect(changeGroupKey(item('a', 'reviewing_lv1', 1, { targetKey: 'playlist:P1' }), true)).toBe('pending:playlist:P1');
    expect(changeGroupKey(item('b', 'approved', 1, { targetKey: 'playlist:P1', decisionId: 'a' }), false)).toBe('decided:a');
    expect(changeGroupKey(item('c', 'approved', 1, { targetKey: 'playlist:P1' }), false)).toBe('decided:c');
  });

  it('1行に人数・いちばん多い理由・対象名を出し、リンク先は最も古い提案', () => {
    const rows = groupChangeProposals(
      [
        item('w2', 'reviewing_lv1', 20, { targetKey: 'playlist:P1', targetType: 'playlist', targetName: '実況A', reason: 'not_game' }),
        item('w1', 'reviewing_lv1', 10, { targetKey: 'playlist:P1', targetType: 'playlist', targetName: '実況A', reason: 'mixed_games' }),
        item('w3', 'reviewing_lv1', 30, { targetKey: 'playlist:P1', targetType: 'playlist', targetName: '実況A', reason: 'not_game' }),
        item('w4', 'approved', 5, { targetKey: 'playlist:P1', targetType: 'playlist', targetName: '実況A', reason: 'wrong_game', decisionId: 'w4' }),
      ],
      isPendingStatus,
    );
    expect(rows).toHaveLength(2);
    const pending = rows.find((r) => r.status === 'reviewing_lv1')!;
    expect(pending).toMatchObject({ id: 'w1', count: 3, submittedAt: 10 });
    expect(pending.summary).toBe('変更の提案（再生リスト）3人 — ゲーム実況の再生リストではない — 「実況A」');
    expect(rows.find((r) => r.status === 'approved')).toMatchObject({ id: 'w4', count: 1 });
  });

  it('ゲームは選んだ項目のうち最も多いものを出す', () => {
    const [row] = groupChangeProposals(
      [
        item('g1', 'reviewing_lv1', 1, { targetKey: 'game:G1', targetType: 'game', targetName: 'ゲームB', fields: ['title', 'image'] }),
        item('g2', 'reviewing_lv1', 2, { targetKey: 'game:G1', targetType: 'game', targetName: 'ゲームB', fields: ['image'] }),
      ],
      isPendingStatus,
    );
    expect(row.summary).toBe('変更の提案（ゲーム）2人 — パッケージ画像 — 「ゲームB」');
  });

  it('多数派: いちばん多い理由・ゲーム（同数なら先のもの）と、最初に書かれた新しいゲーム名', () => {
    const base = { reason: null, proposedGameId: null, proposedGameName: null, proposedGameTitle: null };
    expect(changeGroupMajority([])).toEqual({ reason: null, game: null, newGameTitle: null });
    expect(
      changeGroupMajority([
        { ...base, reason: 'wrong_game', proposedGameId: 'G2', proposedGameName: 'ゲーム2' },
        { ...base, reason: 'wrong_game', proposedGameId: 'G3', proposedGameName: 'ゲーム3', proposedGameTitle: '新ゲーム' },
        { ...base, reason: 'not_game', proposedGameId: 'G3', proposedGameName: 'ゲーム3（別名）' },
      ]),
    ).toEqual({ reason: 'wrong_game', game: { id: 'G3', title: 'ゲーム3' }, newGameTitle: '新ゲーム' });
    expect(changeGroupMajority([{ ...base, reason: 'a' }, { ...base, reason: 'b' }]).reason).toBe('a');
  });
});

describe('未処理の件数（§5.3）', () => {
  it('通報はレビューの通報＋変更の提案（対象ごとに1件）、提案は3種別。処理済みは数えない', () => {
    expect(
      countPendingWorkflows([
        { id: '1', type: 'review_report', status: 'reviewing_lv1' },
        { id: '2', type: 'playlist_report', status: 'reviewing_lv1', reportData: { targetKey: 'playlist:P1' } },
        { id: '3', type: 'playlist_report', status: 'reviewing_lv1', reportData: { targetKey: 'playlist:P1' } },
        { id: '4', type: 'channel_report', status: 'reviewing_lv1', reportData: { targetKey: 'channel:C1' } },
        { id: '5', type: 'playlist_register', status: 'reviewing_lv1' },
        { id: '6', type: 'game_title_register', status: 'reviewing_lv1' },
        { id: '7', type: 'channel_application', status: 'reviewing_lv1' },
        { id: '8', type: 'playlist_register', status: 'approved' },
        { id: '9', type: 'unknown_type', status: 'reviewing_lv1' },
      ]),
    ).toEqual({ reports: 3, proposals: 3, total: 6 });
  });
});
