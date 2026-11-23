// 状態ラベルの色の対応表（デザイントークン仕様書 §5.4）。画面ごとに色を決めず、ここに集める。
// 同じ言葉（お問い合わせの状態など）は管理側・ユーザー側で同じ色になる。
export type LabelTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

/** お問い合わせの状態（未対応＝赤／対応中＝青／保留中＝アンバー／対応済み＝緑） */
export function inquiryStatusTone(status: string): LabelTone {
  switch (status) {
    case 'in_progress':
      return 'info';
    case 'on_hold':
      return 'warning';
    case 'resolved':
      return 'success';
    default:
      return 'danger';
  }
}

/** 審査ワークフローの状態（審査中＝アンバー／承認＝緑／却下＝赤） */
export function workflowStatusTone(status: string): LabelTone {
  return status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning';
}

/** 通知の種類（お知らせ＝青／再生リスト新着＝緑） */
export function notificationTypeTone(type: string): LabelTone {
  return type === 'notice' ? 'info' : 'success';
}

/** ユーザーに見せる提案・申請の状態（確認待ち＝アンバー／公開済み・承認・反映済み＝緑／見送り＝グレー） */
export function proposalStatusTone(status: 'reviewing' | 'approved' | 'rejected'): LabelTone {
  return status === 'reviewing' ? 'warning' : status === 'approved' ? 'success' : 'neutral';
}

/** お知らせ管理の状態（下書き＝グレー／公開中＝緑／非公開＝アンバー） */
export function noticeStatusTone(status: string): LabelTone {
  return status === 'published' ? 'success' : status === 'unpublished' ? 'warning' : 'neutral';
}
