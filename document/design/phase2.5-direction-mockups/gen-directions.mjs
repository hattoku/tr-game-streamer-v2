// 方向性モックアップ生成: 黒ベース＋ブランド赤を共通にし、2色目と面の質感を4方向で描く
// 使い方: node gen-directions.mjs <出力ディレクトリ>  → Main/Mobile/Ember/Neon/Teal.dc.html と canvas.json を生成
// 2026-09-12 に A. クリムゾン（Main）を採用。他案は記録用（wiki/sources/2026-09-12-design-direction-crimson.md）
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";

// アイコン（ストローク系 SVG、絵文字は使わない）
const svg = (body, size = 16, extra = '') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;
const I = {
  play: (s = 16) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l12-7.5z"></path></svg>`,
  star: (s = 14) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7 6.1 20.8l1.2-6.5L2.5 9.7l6.6-.9z"></path></svg>`,
  users: (s = 14) => svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.9"></path><path d="M16 3.1a4 4 0 0 1 0 7.8"></path>', s),
  comment: (s = 14) => svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>', s),
  bell: (s = 18) => svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path>', s),
  chevron: (s = 14) => svg('<path d="M6 9l6 6 6-6"></path>', s),
  reverse: (s = 14) => svg('<path d="M3 7h13"></path><path d="M12 3l4 4-4 4"></path><path d="M21 17H8"></path><path d="M12 13l-4 4 4 4"></path>', s),
  trash: (s = 14) => svg('<path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path>', s),
  check: (s = 12) => svg('<path d="M20 6L9 17l-5-5"></path>', s),
  heart: (s = 14) => svg('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"></path>', s),
  ext: (s = 14) => svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6"></path><path d="M10 14L21 3"></path>', s),
};

// 4方向の定義。共通: 黒ベース・ロゴ赤・プライマリ赤・進捗赤・スコア琥珀
const DIRECTIONS = {
  Main: {
    label: 'A. クリムゾン',
    base: '#0f0f0f',
    cardTop: '#191919', cardBot: '#131313', cardBorder: 'rgba(255,255,255,0.07)',
    elevBorder: 'rgba(255,255,255,0.14)',
    accent: '#e8e8e8', accentSoft: 'rgba(232,232,232,0.10)', accentText: '#e8e8e8',
    watching: '#1db37a', watchingBg: '#0d2e2a',
    glow: 'none',
    hoverShadow: '0 14px 32px rgba(0,0,0,0.6)',
    tagBg: 'rgba(255,255,255,0.06)', tagText: '#cccccc',
    thumbA: '#2a1d1d', thumbB: '#3a2a2a',
    childBg: 'rgba(255,255,255,0.03)',
    nav: '#e8e8e8',
  },
  Ember: {
    label: 'B. エンバー（赤＋琥珀）',
    base: '#110f0e',
    cardTop: '#1d1815', cardBot: '#151210', cardBorder: 'rgba(255,200,150,0.09)',
    elevBorder: 'rgba(240,165,0,0.45)',
    accent: '#f0a500', accentSoft: 'rgba(240,165,0,0.12)', accentText: '#f5b833',
    watching: '#2fbf7f', watchingBg: '#0f2e22',
    glow: 'none',
    hoverShadow: '0 14px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(240,165,0,0.25)',
    tagBg: 'rgba(240,165,0,0.10)', tagText: '#e6c07a',
    thumbA: '#2e1c14', thumbB: '#4a2c18',
    childBg: 'rgba(240,165,0,0.04)',
    nav: '#f0a500',
  },
  Neon: {
    label: 'C. ネオン（赤＋バイオレット）',
    base: '#0d0d12',
    cardTop: '#18172100', cardBot: '#12111a', cardBorder: 'rgba(150,130,255,0.12)',
    elevBorder: 'rgba(139,92,246,0.7)',
    accent: '#8b5cf6', accentSoft: 'rgba(139,92,246,0.16)', accentText: '#b39bff',
    watching: '#22d3ee', watchingBg: '#0b2a33',
    glow: '0 0 14px rgba(139,92,246,0.45)',
    hoverShadow: '0 14px 32px rgba(0,0,0,0.65), 0 0 24px rgba(139,92,246,0.35)',
    tagBg: 'rgba(139,92,246,0.14)', tagText: '#c4b0ff',
    thumbA: '#1e1636', thumbB: '#3a1f5c',
    childBg: 'rgba(139,92,246,0.05)',
    nav: '#b39bff',
  },
  Teal: {
    label: 'D. ティール（赤＋青緑）',
    base: '#0d1011',
    cardTop: '#171c1d', cardBot: '#111516', cardBorder: 'rgba(120,200,200,0.10)',
    elevBorder: 'rgba(20,184,166,0.55)',
    accent: '#14b8a6', accentSoft: 'rgba(20,184,166,0.12)', accentText: '#2dd4bf',
    watching: '#14b8a6', watchingBg: '#0b2d29',
    glow: 'none',
    hoverShadow: '0 14px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(20,184,166,0.3)',
    tagBg: 'rgba(20,184,166,0.10)', tagText: '#8fd9cf',
    thumbA: '#122a2a', thumbB: '#1a4a44',
    childBg: 'rgba(20,184,166,0.04)',
    nav: '#2dd4bf',
  },
};
DIRECTIONS.Neon.cardTop = '#1b1a26';

const RED = '#e03030';
const RED_GRAD = 'linear-gradient(180deg, #ea4444 0%, #c92626 100%)';
const AMBER = '#f0a500';

const T = {
  primary: '#e8e8e8', secondary: '#cccccc', tertiary: '#aaaaaa', muted: '#888888', faint: '#777777',
};

function thumb(d, title, w, h, opts = {}) {
  const { count, playing, play } = opts;
  return `<div style="position: relative; width: ${w}; height: ${h}; border-radius: ${opts.radius ?? '8px'}; overflow: hidden; background: linear-gradient(135deg, ${d.thumbA} 0%, ${d.thumbB} 60%, #0a0a0a 100%); flex-shrink: 0;">
  <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.55); font-size: ${opts.fontSize ?? '15px'}; font-weight: 700; letter-spacing: 0.04em; text-align: center; padding: 8px;">${title}</div>
  <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 46%; background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%);"></div>
  ${count ? `<span style="position: absolute; right: 8px; bottom: 8px; padding: 2px 7px; border-radius: 4px; background: rgba(0,0,0,0.72); color: ${T.primary}; font-size: 11px; line-height: 1.5; backdrop-filter: blur(4px);">${count}</span>` : ''}
  ${play ? `<span style="position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; background: ${RED_GRAD}; color: #ffffff; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 18px rgba(224,48,48,0.45);">${I.play(20)}</span>` : ''}
  ${playing ? `<span style="position: absolute; left: 8px; top: 8px; padding: 2px 7px; border-radius: 4px; background: ${RED}; color: #ffffff; font-size: 10px; font-weight: 600; line-height: 1.5;">再生中</span>` : ''}
</div>`;
}

function tag(d, label, hot = false) {
  const bg = hot ? d.accentSoft : d.tagBg;
  const color = hot ? d.accentText : d.tagText;
  return `<span style="display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 4px; background: ${bg}; color: ${color}; font-size: 11px; line-height: 1.5;">${label}</span>`;
}

function metaRow() {
  return `<div style="display: flex; align-items: center; gap: 12px; color: ${T.tertiary}; font-size: 12px; line-height: 1.5;">
  <span style="display: inline-flex; align-items: center; gap: 4px; color: ${AMBER};">${I.star(13)}<span style="color: ${T.primary}; font-weight: 600;">4.8</span></span>
  <span style="display: inline-flex; align-items: center; gap: 4px;">${I.users(13)}<span>1,234</span></span>
  <span style="display: inline-flex; align-items: center; gap: 4px;">${I.comment(13)}<span>56</span></span>
</div>`;
}

function playlistCard(d, { title, channel, game, count, hover = false, tags }) {
  const border = hover ? d.elevBorder : d.cardBorder;
  const shadow = hover ? d.hoverShadow : '0 6px 18px rgba(0,0,0,0.45)';
  const lift = hover ? 'transform: translateY(-3px);' : '';
  return `<div style="display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: linear-gradient(180deg, ${d.cardTop} 0%, ${d.cardBot} 100%); border: 1px solid ${border}; box-shadow: ${shadow}; ${lift}">
  ${thumb(d, title.split('】')[0].replace('【', ''), '100%', '162px', { count, play: hover, radius: '0' })}
  <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px;">
    <p style="margin: 0; font-size: 14px; line-height: 1.5; font-weight: 500; color: ${T.primary}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${title}</p>
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #555 0%, #2a2a2a 100%); flex-shrink: 0;"></span>
      <span style="font-size: 12px; color: ${T.tertiary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${channel}</span>
    </div>
    ${metaRow()}
    <div style="display: flex; flex-wrap: wrap; gap: 6px;">${tags.map((t, i) => tag(d, t, i === 0)).join('')}</div>
  </div>
</div>`;
}

function btnPrimary(label, icon = '') {
  return `<button style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 22px; border-radius: 8px; border: 0; background: ${RED_GRAD}; color: #ffffff; font-size: 14px; font-weight: 600; font-family: inherit; box-shadow: 0 4px 14px rgba(224,48,48,0.35), inset 0 1px 0 rgba(255,255,255,0.18); cursor: pointer;">${icon}${label}</button>`;
}
function btnSecondary(d, label, icon = '', active = false) {
  const border = active ? d.accent : 'rgba(255,255,255,0.14)';
  const bg = active ? d.accentSoft : 'linear-gradient(180deg, #2c2c2c 0%, #222222 100%)';
  const color = active ? d.accentText : '#e0e0e0';
  return `<button style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid ${border}; background: ${bg}; color: ${color}; font-size: 13px; font-weight: 500; font-family: inherit; box-shadow: 0 2px 6px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06); cursor: pointer;">${icon}${label}</button>`;
}
function btnGhost(label, icon = '') {
  return `<button style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: ${T.muted}; font-size: 13px; font-family: inherit; cursor: pointer;">${icon}${label}</button>`;
}
function btnRakuten(label) {
  return `<button style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: 0; background: #bf360c; color: #ffffff; font-size: 12px; font-weight: 500; font-family: inherit; cursor: pointer;">${label}${I.ext(12)}</button>`;
}

function chip(d, label, state) {
  // state: 'off' | 'on' | 'watching'
  if (state === 'watching') {
    return `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 20px; border: 1px solid ${d.watching}; background: ${d.watchingBg}; color: ${d.watching}; font-size: 12px; line-height: 1; font-weight: 600; box-shadow: ${d.glow === 'none' ? 'none' : d.glow.replace('139,92,246', '34,211,238')};"><span style="width: 6px; height: 6px; border-radius: 50%; background: ${d.watching};"></span>${label}</span>`;
  }
  if (state === 'on') {
    return `<span style="display: inline-flex; align-items: center; gap: 5px; padding: 5px 12px; border-radius: 20px; border: 1px solid ${d.accent}; background: ${d.accentSoft}; color: ${d.accentText}; font-size: 12px; line-height: 1; font-weight: 600;">${label}</span>`;
  }
  return `<span style="display: inline-flex; align-items: center; padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.12); background: #1a1a1a; color: ${T.tertiary}; font-size: 12px; line-height: 1;">${label}</span>`;
}

function tabs(d) {
  const item = (label, count, active = false) => `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; margin-bottom: -1px; border-bottom: 2px solid ${active ? d.accent : 'transparent'}; color: ${active ? T.primary : T.tertiary}; font-size: 13px; font-weight: ${active ? 600 : 400}; ${active && d.glow !== 'none' ? `text-shadow: 0 0 10px ${d.accent};` : ''}">${label}<span style="display: inline-flex; align-items: center; justify-content: center; min-width: 20px; padding: 0 6px; height: 18px; border-radius: 9px; background: ${active ? d.accentSoft : 'rgba(255,255,255,0.06)'}; color: ${active ? d.accentText : T.muted}; font-size: 11px; font-weight: 600;">${count}</span></span>`;
  return `<div style="display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.08);">
  <div style="display: flex; align-items: flex-end; gap: 2px;">
    ${item('すべて', 4, true)}${item('視聴中', 1)}${item('見たい', 2)}${item('完走', 1)}
    <span style="display: inline-flex; align-items: center; gap: 4px; padding: 10px 14px; color: ${T.tertiary}; font-size: 13px;">その他${I.chevron(12)}</span>
  </div>
  <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 8px; padding: 6px 10px 6px 12px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.12); background: #1a1a1a; color: ${T.secondary}; font-size: 12px;">最終更新（新しい順）${I.chevron(12)}</div>
</div>`;
}

function mylistCard(d) {
  return `<div style="display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: linear-gradient(180deg, ${d.cardTop} 0%, ${d.cardBot} 100%); border: 1px solid ${d.cardBorder}; box-shadow: 0 6px 18px rgba(0,0,0,0.45);">
  <div style="display: flex; gap: 18px; padding: 16px 18px;">
    ${thumb(d, 'ゼルダの伝説', '224px', '126px', { count: '87話' })}
    <div style="display: flex; flex-direction: column; gap: 10px; flex-grow: 1; min-width: 0;">
      <p style="margin: 0; font-size: 15px; line-height: 1.5; font-weight: 600; color: ${T.primary};">ゼルダの伝説 ティアーズ オブ ザ キングダム 実況プレイ</p>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="width: 22px; height: 22px; border-radius: 50%; background: linear-gradient(135deg, #f0a0b0 0%, #6a3040 100%);"></span>
        <span style="font-size: 12px; color: ${T.tertiary};">キヨ。</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-top: auto;">
        <span style="display: inline-flex; align-items: center; gap: 4px;">${chip(d, '視聴中', 'watching')}<span style="color: ${T.muted};">${I.chevron(12)}</span></span>
        <span style="width: 1px; height: 18px; background: rgba(255,255,255,0.1);"></span>
        ${btnSecondary(d, '逆順で再生', I.reverse(13), true)}
        ${btnGhost('削除', I.trash(13))}
      </div>
    </div>
  </div>
  <div style="display: flex; align-items: center; gap: 14px; padding: 12px 18px 14px; border-top: 1px solid rgba(255,255,255,0.06); background: ${d.childBg};">
    <span style="font-size: 11px; color: ${T.muted}; white-space: nowrap; writing-mode: horizontal-tb;">最後に再生</span>
    <div style="display: flex; flex-direction: column; gap: 0; width: 124px; flex-shrink: 0;">
      ${thumb(d, '#33', '124px', '70px', { fontSize: '13px', radius: '6px 6px 0 0' })}
      <div style="height: 3px; background: #333333; border-radius: 0 0 6px 6px; overflow: hidden;"><div style="width: 62%; height: 100%; background: ${RED};"></div></div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
      <p style="margin: 0; font-size: 13px; color: ${T.secondary}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">#33 ハイラル城 地下を探索する【ティアキン】</p>
      <span style="font-size: 11px; color: ${T.muted};">12:40 / 20:31 ・ 残り 8 分</span>
    </div>
    <span style="margin-left: auto; flex-shrink: 0;">${btnPrimary('続きから再生', I.play(14))}</span>
  </div>
</div>`;
}

function header(d) {
  const nav = (label, active = false) => `<span style="position: relative; display: inline-flex; align-items: center; height: 60px; font-size: 13px; color: ${active ? T.primary : T.tertiary}; ${active ? `box-shadow: inset 0 -2px 0 ${d.nav};` : ''}">${label}</span>`;
  return `<div style="display: flex; align-items: center; justify-content: space-between; height: 60px; padding: 0 24px; border-bottom: 1px solid rgba(255,255,255,0.06); background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 100%), ${d.base};">
  <div style="display: flex; align-items: center; gap: 32px; height: 100%;">
    <span style="display: inline-flex; align-items: center; gap: 8px;"><span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: ${RED_GRAD}; color: #ffffff; box-shadow: 0 2px 8px rgba(224,48,48,0.4);">${I.play(15)}</span><span style="font-size: 15px; font-weight: 600; color: ${T.primary};">プレミテ</span></span>
    <nav style="display: flex; align-items: center; gap: 24px; height: 100%;">${nav('再生リストを探す', true)}${nav('ゲームから探す')}${nav('チャンネルから探す')}${nav('まとめ')}${nav('タイムライン')}</nav>
  </div>
  <div style="display: flex; align-items: center; gap: 20px;">
    <span style="font-size: 13px; color: ${T.tertiary};">マイリスト</span>
    <span style="font-size: 13px; color: ${T.tertiary};">視聴履歴</span>
    <span style="position: relative; display: inline-flex; color: ${T.tertiary};">${I.bell(18)}<span style="position: absolute; top: -1px; right: -1px; width: 7px; height: 7px; border-radius: 50%; background: ${RED}; box-shadow: 0 0 0 2px ${d.base};"></span></span>
    <span style="display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);"><span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: ${d.accentSoft}; color: ${d.accentText}; font-size: 11px; font-weight: 600;">テ</span><span style="font-size: 13px; color: ${T.primary};">テスト管理者</span>${I.chevron(12)}</span>
  </div>
</div>`;
}

function sectionTitle(text, sub = '') {
  return `<div style="display: flex; align-items: baseline; gap: 12px;"><h2 style="margin: 0; font-size: 18px; font-weight: 700; color: ${T.primary}; letter-spacing: 0.01em;">${text}</h2>${sub ? `<span style="font-size: 12px; color: ${T.muted};">${sub}</span>` : ''}</div>`;
}

function componentsStrip(d) {
  const label = (t) => `<span style="font-size: 11px; color: ${T.muted}; width: 88px; flex-shrink: 0;">${t}</span>`;
  return `<div style="display: flex; flex-direction: column; gap: 14px; padding: 18px 20px; border-radius: 12px; border: 1px dashed rgba(255,255,255,0.12);">
  <div style="display: flex; align-items: center; gap: 12px;">${label('ボタン')}${btnPrimary('再生する', I.play(14))}${btnSecondary(d, 'マイリストに追加', I.heart(13))}${btnSecondary(d, '逆順で再生', I.reverse(13), true)}${btnGhost('マイリストから削除', I.trash(13))}${btnRakuten('楽天ブックスで見る')}</div>
  <div style="display: flex; align-items: center; gap: 8px;">${label('ステータス')}${chip(d, '見たい', 'off')}${chip(d, '視聴中', 'watching')}${chip(d, '完走', 'on')}${chip(d, '一時中断', 'off')}${chip(d, '断念', 'off')}</div>
  <div style="display: flex; align-items: center; gap: 12px;">${label('入力')}
    <span style="display: inline-flex; align-items: center; width: 360px; padding: 9px 12px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.14); background: #1a1a1a; color: ${T.muted}; font-size: 13px; box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);">https://www.youtube.com/playlist?list=…</span>
    <span style="display: inline-flex; align-items: center; width: 200px; padding: 9px 12px; border-radius: 7px; border: 1px solid ${d.accent}; background: #1a1a1a; color: ${T.primary}; font-size: 13px; box-shadow: 0 0 0 3px ${d.accentSoft};">ゼルダの伝説|</span>
  </div>
  <div style="display: flex; align-items: center; gap: 12px;">${label('ドロップダウン')}
    <div style="display: flex; flex-direction: column; width: 180px; padding: 6px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, #202020 0%, #171717 100%); box-shadow: 0 12px 32px rgba(0,0,0,0.6);">
      <span style="padding: 8px 10px; border-radius: 6px; font-size: 13px; color: ${T.secondary};">見たい</span>
      <span style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-radius: 6px; font-size: 13px; color: ${T.primary}; background: ${d.accentSoft};">視聴中<span style="color: ${d.accentText};">${I.check(12)}</span></span>
      <span style="padding: 8px 10px; border-radius: 6px; font-size: 13px; color: ${T.secondary};">完走</span>
      <span style="padding: 8px 10px; border-radius: 6px; font-size: 13px; color: ${T.secondary};">一時中断</span>
      <span style="padding: 8px 10px; border-radius: 6px; font-size: 13px; color: ${T.secondary};">断念</span>
    </div>
    <span style="font-size: 12px; color: ${T.muted}; max-width: 300px; line-height: 1.6;">セレクトはブラウザ標準を使わず、面と影を持つドロップダウンに統一する（現状の「文字が背景とかぶる」問題の解消）</span>
  </div>
</div>`;
}

function artboard(key, d) {
  const cards = [
    { title: '【ティアキン】ゼルダの伝説 ティアーズ オブ ザ キングダム 実況プレイ', channel: 'キヨ。', count: '87話', tags: ['初見', '長編', 'ネタバレなし'] },
    { title: '【MHR】『モンスターハンターライズ』を実況プレイ【モンハンライズ】', channel: '実況局だいだら', count: '42話', hover: true, tags: ['やり込み', 'マルチプレイ', '解説'] },
    { title: '【スプラ3】スプラトゥーン3 ガチマッチ ウデマエX への道', channel: 'ゲーム部', count: '17話', tags: ['ランクマ', '解説', '上級者向け'] },
    { title: '【エルデンリング】初見・ノーヒントで攻略する ELDEN RING', channel: 'まったり実況', count: '120話', tags: ['初見', '縛りプレイ', '長編'] },
  ];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; background: ${d.base}; }
    a { color: ${d.accentText}; } a:hover { color: ${T.primary}; }
    * { box-sizing: border-box; }
    p, h2 { text-wrap: pretty; }
  </style>
</helmet>
<div style="width: 1440px; min-height: 1500px; background: ${d.base}; color: ${T.primary}; font-family: ${FONT}; font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased;">
  ${header(d)}
  <main style="display: flex; flex-direction: column; gap: 40px; max-width: 1400px; margin: 0 auto; padding: 28px 24px 40px;">
    <section style="display: flex; flex-direction: column; gap: 16px;">
      ${sectionTitle('再生リストを探す', '2枚目はホバー状態（浮き上がり＋再生ボタン）')}
      <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; padding-top: 4px;">
        ${cards.map((c) => playlistCard(d, c)).join('\n')}
      </div>
    </section>
    <section style="display: flex; flex-direction: column; gap: 16px;">
      ${sectionTitle('マイリスト')}
      ${tabs(d)}
      ${mylistCard(d)}
    </section>
    <section style="display: flex; flex-direction: column; gap: 16px;">
      ${sectionTitle('共通部品', `${d.label} の配色を各部品に当てたもの`)}
      ${componentsStrip(d)}
    </section>
  </main>
</div>
</x-dc>
</body>
</html>
`;
}

// 採用案のモバイル幅（390px）。ボトムタブバー＋1カラム
function mobileArtboard(d) {
  const tab = (label, icon, active = false) => `<span style="display: flex; flex-direction: column; align-items: center; gap: 3px; flex: 1; padding: 6px 0; color: ${active ? T.primary : T.muted}; font-size: 10px;">${icon}${label}</span>`;
  const home = svg('<path d="M3 11l9-8 9 8"></path><path d="M5 10v10h14V10"></path>', 20);
  const timeline = svg('<path d="M12 8v4l3 2"></path><circle cx="12" cy="12" r="9"></circle>', 20);
  const search = svg('<circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path>', 20);
  const person = svg('<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>', 20);
  const menu = svg('<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>', 20);
  const pill = (n, active) => `<span style="display: inline-flex; align-items: center; justify-content: center; min-width: 20px; padding: 0 6px; height: 18px; border-radius: 9px; background: ${active ? d.accentSoft : 'rgba(255,255,255,0.06)'}; color: ${active ? d.accentText : T.muted}; font-size: 11px; font-weight: 600;">${n}</span>`;
  const mtab = (label, n, active = false) => `<span style="display: inline-flex; align-items: center; gap: 6px; padding: 10px 12px; margin-bottom: -1px; border-bottom: 2px solid ${active ? d.accent : 'transparent'}; color: ${active ? T.primary : T.tertiary}; font-size: 13px; font-weight: ${active ? 600 : 400};">${label}${pill(n, active)}</span>`;
  const card = (title, channel, count, tags) => `<div style="display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: linear-gradient(180deg, ${d.cardTop} 0%, ${d.cardBot} 100%); border: 1px solid ${d.cardBorder}; box-shadow: 0 6px 18px rgba(0,0,0,0.45);">
    ${thumb(d, title.split('】')[0].replace('【', ''), '100%', '201px', { count, radius: '0' })}
    <div style="display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px;">
      <p style="margin: 0; font-size: 14px; line-height: 1.5; font-weight: 500; color: ${T.primary};">${title}</p>
      <div style="display: flex; align-items: center; gap: 8px;"><span style="width: 20px; height: 20px; border-radius: 50%; background: linear-gradient(135deg, #555 0%, #2a2a2a 100%);"></span><span style="font-size: 12px; color: ${T.tertiary};">${channel}</span></div>
      ${metaRow()}
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">${tags.map((t, i) => tag(d, t, i === 0)).join('')}</div>
    </div>
  </div>`;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>
    body { margin: 0; background: ${d.base}; }
    a { color: ${d.accentText}; } a:hover { color: ${T.primary}; }
    * { box-sizing: border-box; }
    p, h2 { text-wrap: pretty; }
  </style>
</helmet>
<div style="position: relative; width: 390px; min-height: 1560px; background: ${d.base}; color: ${T.primary}; font-family: ${FONT}; font-size: 14px; line-height: 1.6; -webkit-font-smoothing: antialiased;">
  <div style="display: flex; align-items: center; justify-content: space-between; height: 52px; padding: 0 8px; border-bottom: 1px solid rgba(255,255,255,0.06); background: linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0) 100%), ${d.base};">
    <div style="display: flex; align-items: center; gap: 6px;"><span style="display: inline-flex; padding: 8px; color: ${T.tertiary};">${menu}</span><span style="display: inline-flex; align-items: center; gap: 8px;"><span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; background: ${RED_GRAD}; color: #ffffff; box-shadow: 0 2px 8px rgba(224,48,48,0.4);">${I.play(15)}</span><span style="font-size: 15px; font-weight: 600; color: ${T.primary};">プレミテ</span></span></div>
    <span style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 3px; margin-right: 8px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04);"><span style="display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 50%; background: ${d.accentSoft}; color: ${d.accentText}; font-size: 11px; font-weight: 600;">テ</span><span style="font-size: 12px; color: ${T.primary};">テスト管理者</span></span>
  </div>
  <main style="display: flex; flex-direction: column; gap: 28px; padding: 20px 16px 96px;">
    <section style="display: flex; flex-direction: column; gap: 12px;">
      ${sectionTitle('再生リストを探す')}
      <div style="display: flex; flex-direction: column; gap: 14px;">
        ${card('【ティアキン】ゼルダの伝説 ティアーズ オブ ザ キングダム 実況プレイ', 'キヨ。', '87話', ['初見', '長編', 'ネタバレなし'])}
        ${card('【MHR】『モンスターハンターライズ』を実況プレイ【モンハンライズ】', '実況局だいだら', '42話', ['やり込み', 'マルチプレイ', '解説'])}
      </div>
    </section>
    <section style="display: flex; flex-direction: column; gap: 12px;">
      ${sectionTitle('マイリスト')}
      <div style="display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid rgba(255,255,255,0.08); overflow: hidden; white-space: nowrap;">
        ${mtab('すべて', 4, true)}${mtab('視聴中', 1)}${mtab('見たい', 2)}
        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 10px 12px; color: ${T.tertiary}; font-size: 13px;">その他${I.chevron(12)}</span>
      </div>
      <div style="display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; background: linear-gradient(180deg, ${d.cardTop} 0%, ${d.cardBot} 100%); border: 1px solid ${d.cardBorder}; box-shadow: 0 6px 18px rgba(0,0,0,0.45);">
        <div style="display: flex; gap: 12px; padding: 12px;">
          ${thumb(d, 'ゼルダの伝説', '128px', '72px', { count: '87話', fontSize: '12px' })}
          <div style="display: flex; flex-direction: column; gap: 6px; min-width: 0;">
            <p style="margin: 0; font-size: 13px; line-height: 1.45; font-weight: 600; color: ${T.primary}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">ゼルダの伝説 ティアーズ オブ ザ キングダム 実況プレイ</p>
            <div style="display: flex; align-items: center; gap: 6px;"><span style="width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #f0a0b0 0%, #6a3040 100%);"></span><span style="font-size: 11px; color: ${T.tertiary};">キヨ。</span></div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px; padding: 0 12px 12px;">
          <span style="display: inline-flex; align-items: center; gap: 4px;">${chip(d, '視聴中', 'watching')}<span style="color: ${T.muted};">${I.chevron(12)}</span></span>
          <span style="width: 1px; height: 18px; background: rgba(255,255,255,0.1);"></span>
          ${btnSecondary(d, '逆順', I.reverse(13), true)}
          ${btnGhost('削除', I.trash(13))}
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px; padding: 12px; border-top: 1px solid rgba(255,255,255,0.06); background: ${d.childBg};">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="display: flex; flex-direction: column; width: 96px; flex-shrink: 0;">
              ${thumb(d, '#33', '96px', '54px', { fontSize: '12px', radius: '6px 6px 0 0' })}
              <div style="height: 3px; background: #333333; border-radius: 0 0 6px 6px; overflow: hidden;"><div style="width: 62%; height: 100%; background: ${RED};"></div></div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
              <span style="font-size: 10px; color: ${T.muted};">最後に再生</span>
              <p style="margin: 0; font-size: 12px; color: ${T.secondary}; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">#33 ハイラル城 地下を探索する【ティアキン】</p>
              <span style="font-size: 10px; color: ${T.muted};">残り 8 分</span>
            </div>
          </div>
          <button style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 11px 22px; border-radius: 8px; border: 0; background: ${RED_GRAD}; color: #ffffff; font-size: 14px; font-weight: 600; font-family: inherit; box-shadow: 0 4px 14px rgba(224,48,48,0.35), inset 0 1px 0 rgba(255,255,255,0.18);">${I.play(14)}続きから再生</button>
        </div>
      </div>
    </section>
  </main>
  <div style="position: absolute; left: 0; right: 0; bottom: 0; display: flex; height: 64px; padding-bottom: 8px; border-top: 1px solid rgba(255,255,255,0.08); background: linear-gradient(180deg, #161616 0%, #111111 100%); box-shadow: 0 -8px 24px rgba(0,0,0,0.5);">
    ${tab('ホーム', home, true)}${tab('タイムライン', timeline)}${tab('さがす', search)}${tab('マイページ', person)}
  </div>
</div>
</x-dc>
</body>
</html>
`;
}

writeFileSync(join(OUT, 'Mobile.dc.html'), mobileArtboard(DIRECTIONS.Main));
for (const [key, d] of Object.entries(DIRECTIONS)) {
  writeFileSync(join(OUT, `${key}.dc.html`), artboard(key, d));
}

const W = 1440, H = 1500, GX = 120, GY = 200;
const canvas = {
  pages: [
    { id: 'page-1', name: '採用案 A. クリムゾン' },
    { id: 'page-2', name: '検討した他案（B〜D）' },
  ],
  artboards: [
    { file: 'Main.dc.html', title: 'A. クリムゾン（PC 1440）', x: 0, y: 0, w: W, h: H, page: 'page-1' },
    { file: 'Mobile.dc.html', title: 'A. クリムゾン（モバイル 390）', x: W + GX, y: 0, w: 390, h: 1560, page: 'page-1' },
    { file: 'Ember.dc.html', title: DIRECTIONS.Ember.label, x: 0, y: 0, w: W, h: H, page: 'page-2' },
    { file: 'Neon.dc.html', title: DIRECTIONS.Neon.label, x: W + GX, y: 0, w: W, h: H, page: 'page-2' },
    { file: 'Teal.dc.html', title: DIRECTIONS.Teal.label, x: 0, y: H + GY, w: W, h: H, page: 'page-2' },
  ],
  annotations: [
    { id: 'decision', x: 0, y: -240, w: 760, page: 'page-1', text: '2026-09-12 決定: A. クリムゾンを採用（ユーザー決定）\n・黒ベース、2色目は足さない。赤はロゴ・プライマリボタン・進捗バー・未読ドット・再生中バッジに使う。★スコアは琥珀、視聴中は緑のまま\n・カードは上が明るいグラデーションの面＋1px枠＋影で奥行きを出し、ホバーで3px浮き上がる\n・タブは下線2px（白）＋件数ピル。セレクトはブラウザ標準を使わず、面と影を持つドロップダウンに統一\n・話数表記は「全17話」→「17話」\n\n仕様書: 共通 デザイントークン仕様書 v2.0（§1 コンセプト改訂、§16 奥行き・演出 を新設）' },
    { id: 'unchosen', x: 0, y: -240, w: 700, page: 'page-2', text: '2026-09-12 に比較した不採用案。A と共通の前提（黒ベース・赤・奥行き）は同じで、2色目だけが違う。記録として残す' },
    { id: 'note-b', x: 760, y: -180, w: 300, page: 'page-2', text: 'B. エンバー（赤＋琥珀）\n既存の★スコア色を2色目に昇格。黒もわずかに暖色に寄せる。\n長所: 映画館・劇場のような温かみ、赤との相性が良い\n短所: 琥珀が「スコア専用」でなくなるため、評価とアクティブ表示の区別が弱まる' },
    { id: 'note-c', x: W + GX + 760, y: -180, w: 300, page: 'page-2', text: 'C. ネオン（赤＋バイオレット）\nゲーム配信らしい発光感。視聴中はシアン。黒もわずかに青紫に寄せる。\n長所: エンタメ感・若さが最も強い、他サイトと差がつく\n短所: 赤・紫・シアン・琥珀の4色になり、使い分けの規律が必要。長時間の視聴で疲れやすい' },
    { id: 'note-d', x: 760, y: H + GY - 180, w: 300, page: 'page-2', text: 'D. ティール（赤＋青緑）\n赤の補色で映画的なコントラスト。視聴中の緑をティールに統合し色数を増やさない。\n長所: 落ち着きと華やかさの両立、赤が一番引き立つ\n短所: 青緑が「視聴中」と「アクティブ」の両方に使われるため、視聴中の特別感が薄れる' },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};
writeFileSync(join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 2));
console.log('written to', OUT);
