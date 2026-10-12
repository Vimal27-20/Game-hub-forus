// Minimal Chrome DevTools Protocol driver for the smoke tests (no Puppeteer dependency).
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].filter(Boolean);

export async function launch({ port, outDir }) {
  const bin = CANDIDATES.find(p => existsSync(p));
  if (!bin) throw new Error('Chrome/Edge not found. Set CHROME_PATH.');
  const profile = mkdtempSync(join(tmpdir(), 'huddle-smoke-'));
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error('Chrome did not start'); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let seq = 0;
  const pending = {}, errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push((d.exception && d.exception.description) || d.text); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value || a.description).join(' '));
  };
  const cdp = (method, params = {}) => new Promise(r => { const id = ++seq; pending[id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Runtime.enable'); await cdp('Page.enable');
  const KEYS = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Enter: 13, Escape: 27 };
  const page = {
    cdp, errors,
    eval: async expr => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true })).result.result.value,
    goto: url => cdp('Page.navigate', { url }),
    size: (width, height, mobile) => Promise.all([
      cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile: !!mobile }),
      cdp('Emulation.setTouchEmulationEnabled', { enabled: !!mobile }),
    ]),
    async key(k) {
      for (const type of ['keyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: KEYS[k] });
      await sleep(250);
    },
    async tap(selector) {
      const box = await page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
      if (!box) throw new Error('no element ' + selector);
      for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: box[0], y: box[1], button: 'left', clickCount: 1 });
      await sleep(250);
    },
    mouse: (type, x, y) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }),
    async shot(name) {
      if (!outDir) return;
      const r = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(outDir, name + '.png'), Buffer.from(r.result.data, 'base64'));
    },
    close() { try { ws.close(); } catch { /* already closed */ } proc.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); },
  };
  return page;
}
