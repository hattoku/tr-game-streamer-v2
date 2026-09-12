// 開発用: headless Chrome を DevTools Protocol で操作し、Firestore 等のデータ読み込みを待ってからスクリーンショットを撮る。
// フェーズ2.5 の目視確認用（wiki/sources/2026-09-12-design-direction-crimson.md §2.1）。依存追加なし（Node 22+ の標準 WebSocket）。
// ユーザーの `npm run dev`（3000番）が動いている状態で実行する。
//
// usage:
//   node scripts/dev/screenshot.mjs <url> <out.png> [width] [height] [waitMs] [mobile:0|1]
//     … url を開き waitMs 待って撮る（簡易）
//   node scripts/dev/screenshot.mjs --steps <steps.json> [width] [height] [mobile:0|1]
//     … 手順を順に実行する。手順は次のいずれか:
//       {"goto": "http://localhost:3000/mylist"}         ページ移動
//       {"wait": 8000}                                     ミリ秒待つ
//       {"eval": "document.title"}                         JS を実行（結果を表示。Promise は await する）
//       {"click": "管理者でログイン"}                        その文字を含む button / a をクリック
//       {"shot": "out.png"}                                撮影（複数回可）
//     ログイン必須ページは、TOP でテストモードの「管理者でログイン」を click してから goto する。
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
let steps;
let w = '1440';
let h = '1000';
let mobile = '0';
if (argv[0] === '--steps') {
  steps = JSON.parse(readFileSync(argv[1], 'utf8'));
  [w = '1440', h = '1000', mobile = '0'] = argv.slice(2);
} else {
  const [url, out, ww = '1440', hh = '1000', waitMs = '8000', mm = '0'] = argv;
  w = ww;
  h = hh;
  mobile = mm;
  steps = [{ goto: url }, { wait: +waitMs }, { shot: out }];
}

const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${port}`, `--window-size=${w},${h}`, '--user-data-dir=' + process.env.TEMP + '/chrome-shot-' + port, 'about:blank',
  ],
  { stdio: 'ignore' },
);

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
if (!target) {
  chrome.kill();
  throw new Error('chrome did not start');
}

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  // ページ側のエラーは調査の手がかりになるので表示する
  if (msg.method === 'Runtime.exceptionThrown') {
    console.log('PAGE EXCEPTION:', msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text);
  } else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning')) {
    console.log(`PAGE ${msg.params.type.toUpperCase()}:`, msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 600));
  }
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: mobile === '1' });

try {
  for (const step of steps) {
    if (step.goto) {
      await send('Page.navigate', { url: step.goto });
      await sleep(1500);
    } else if (step.wait) {
      await sleep(+step.wait);
    } else if (step.eval) {
      console.log('EVAL:', JSON.stringify(await evaluate(step.eval)));
    } else if (step.click) {
      const text = JSON.stringify(step.click);
      const result = await evaluate(
        `(() => { const el = Array.from(document.querySelectorAll('button, a, [role="menuitem"], [role="menuitemradio"], [role="tab"]'))` +
          `.find((e) => e.textContent.replace(/\\s+/g, '').includes(${text}.replace(/\\s+/g, ''))); if (!el) return 'not found: ' + ${text}; el.click(); return 'clicked: ' + ${text}; })()`,
      );
      console.log(result);
      await sleep(600);
    } else if (step.shot) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(step.shot, Buffer.from(shot.result.data, 'base64'));
      console.log('saved', step.shot);
    }
  }
} finally {
  ws.close();
  chrome.kill();
}
