// 開発用: headless Chrome を DevTools Protocol で操作し、Firestore 等のデータ読み込みを待ってからスクリーンショットを撮る。
// フェーズ2.5 の目視確認用（wiki/sources/2026-09-12-design-direction-crimson.md §2.1）。依存追加なし（Node 22+ の標準 WebSocket）。
// ユーザーの `npm run dev`（3000番）が動いている状態で実行する。
// usage: node shot.mjs <url> <out.png> [width] [height] [waitMs] [mobile:0|1] [evalJs]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const [url, out, w = '1440', h = '1000', waitMs = '8000', mobile = '0', evalJs = ''] = process.argv.slice(2);
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`,
  `--window-size=${w},${h}`, '--user-data-dir=' + process.env.TEMP + '/chrome-shot-' + port, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch {}
  await sleep(200);
}
if (!target) { chrome.kill(); throw new Error('chrome did not start'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: mobile === '1' });
await send('Page.navigate', { url });
await sleep(+waitMs);
if (evalJs) {
  const r = await send('Runtime.evaluate', { expression: evalJs, returnByValue: true });
  console.log('EVAL:', JSON.stringify(r.result?.result?.value));
}
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
ws.close();
chrome.kill();
