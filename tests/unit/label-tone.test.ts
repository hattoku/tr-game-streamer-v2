import { describe, expect, it } from 'vitest';
import {
  inquiryStatusTone,
  noticeStatusTone,
  notificationTypeTone,
  proposalStatusTone,
  workflowStatusTone,
} from '@/lib/label-tone-shared';

describe('状態ラベルの色の対応（デザイントークン仕様書 §5.4）', () => {
  it('お問い合わせ: 未対応＝赤／対応中＝青／保留中＝アンバー／対応済み＝緑（4つとも別の色）', () => {
    const tones = ['open', 'in_progress', 'on_hold', 'resolved'].map(inquiryStatusTone);
    expect(tones).toEqual(['danger', 'info', 'warning', 'success']);
    expect(new Set(tones).size).toBe(4);
  });

  it('お問い合わせ: 知らない値は未対応（赤）にそろえる', () => {
    expect(inquiryStatusTone('unknown')).toBe('danger');
  });

  it('審査ワークフロー: 審査中＝アンバー／承認＝緑／却下＝赤', () => {
    expect(['pending', 'approved', 'rejected'].map(workflowStatusTone)).toEqual(['warning', 'success', 'danger']);
  });

  it('通知の種類: お知らせ＝青／再生リスト新着＝緑', () => {
    expect(notificationTypeTone('notice')).toBe('info');
    expect(notificationTypeTone('series_new_episode')).toBe('success');
  });

  it('提案履歴: 確認待ち＝アンバー／承認系＝緑／見送り＝色なし（赤にしない）', () => {
    expect(proposalStatusTone('reviewing')).toBe('warning');
    expect(proposalStatusTone('approved')).toBe('success');
    expect(proposalStatusTone('rejected')).toBe('neutral');
  });

  it('お知らせ管理: 下書き＝色なし／公開中＝緑／非公開＝アンバー', () => {
    expect(['draft', 'published', 'unpublished'].map(noticeStatusTone)).toEqual(['neutral', 'success', 'warning']);
  });
});
