// 詳細ページからの変更の提案の共有部分（lib/change-proposal-shared.ts）。
// ページ 詳細ページからの変更提案 仕様書 §4.2・§5.2・§6.2・§8・§9.2、管理 審査ワークフロー仕様書 §16。
import { describe, expect, it } from 'vitest';
import {
  CHANGE_APPROVE_ACTIONS,
  changeReasonLabel,
  changeRejectReasonLabel,
  changeResultMessage,
  changeTargetKey,
  defaultApproveAction,
  describeChangeReason,
  isChangeProposalType,
} from '@/lib/change-proposal-shared';

describe('種別と対象のキー', () => {
  it('変更の提案の種別だけを true にする', () => {
    expect(isChangeProposalType('game_title_edit')).toBe(true);
    expect(isChangeProposalType('channel_report')).toBe(true);
    expect(isChangeProposalType('playlist_report')).toBe(true);
    expect(isChangeProposalType('playlist_proposal')).toBe(false);
    expect(isChangeProposalType(undefined)).toBe(false);
  });

  it('同じ対象の提案をまとめるキーは「種類:ID」', () => {
    expect(changeTargetKey('playlist', 'PL123')).toBe('playlist:PL123');
  });
});

describe('defaultApproveAction（§5.4・§6.3: 理由ごとの既定の処理）', () => {
  it('チャンネルは「その他」以外なら掲載から外す', () => {
    expect(defaultApproveAction('channel', 'not_playing')).toBe('channel_excluded');
    expect(defaultApproveAction('channel', 'not_official')).toBe('channel_excluded');
    expect(defaultApproveAction('channel', 'other')).toBe('none');
  });

  it('再生リストは理由に合わせて ゲームではない／対象外／付け替え', () => {
    expect(defaultApproveAction('playlist', 'not_game')).toBe('non_game');
    expect(defaultApproveAction('playlist', 'mixed_games')).toBe('excluded');
    expect(defaultApproveAction('playlist', 'wrong_game')).toBe('relink');
    expect(defaultApproveAction('playlist', 'other')).toBe('none');
  });

  it('ゲームは自動の処理なし', () => {
    expect(defaultApproveAction('game', null)).toBe('none');
  });

  it('既定の処理は、その対象で選べる処理に含まれる', () => {
    const cases = [
      ['channel', 'not_playing'],
      ['channel', 'other'],
      ['playlist', 'not_game'],
      ['playlist', 'mixed_games'],
      ['playlist', 'wrong_game'],
      ['playlist', 'other'],
      ['game', null],
    ] as const;
    for (const [type, reason] of cases) expect(CHANGE_APPROVE_ACTIONS[type]).toContain(defaultApproveAction(type, reason));
  });
});

describe('理由の表示', () => {
  it('理由の値をラベルにする（知らない値はそのまま）', () => {
    expect(changeReasonLabel('playlist', 'wrong_game')).toBe('付いているゲームが違う');
    expect(changeReasonLabel('channel', 'not_playing')).toBe('もうゲーム実況をしていない');
    expect(changeReasonLabel('game', 'genre')).toBe('ジャンル');
    expect(changeReasonLabel('playlist', 'unknown')).toBe('unknown');
  });

  it('ゲームは選んだ項目を「・」でつなぎ、無ければ —', () => {
    expect(describeChangeReason('game', null, ['title', 'platform'])).toBe('ゲームタイトル名・機種');
    expect(describeChangeReason('game', null, [])).toBe('—');
    expect(describeChangeReason('channel', null, null)).toBe('—');
  });
});

describe('結果の通知（§8.3・§9.2）', () => {
  it('見送り理由のコードを文言にする（知らないコードは null）', () => {
    expect(changeRejectReasonLabel('already_fixed')).toBe('すでに直っています');
    expect(changeRejectReasonLabel('nope')).toBeNull();
  });

  it('承認・見送りの文面', () => {
    expect(changeResultMessage('playlist', 'ゼルダ実況', 'approve', null)).toBe('再生リスト「ゼルダ実況」への提案を反映しました。ありがとうございます');
    expect(changeResultMessage('game', 'ゼルダの伝説', 'reject', 'すでに直っています')).toBe(
      'ゲーム「ゼルダの伝説」への提案は見送りになりました（すでに直っています）',
    );
  });
});
