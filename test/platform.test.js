// TV platform adapter and store build tests. See specs/002-tv-store-apps/requirements.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

function loadPlatform(config, extra = {}) {
  const calls = [];
  const window = { HUDDLE_CONFIG: config, ...extra };
  const io = (...args) => { calls.push(args); return {}; };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public', 'platform.js'), 'utf8'), {
    window, io, document: { dispatchEvent() {} }, KeyboardEvent: class {}, tizen: extra.tizen,
  });
  return { P: window.HuddlePlatform, calls };
}

test('R3: Back is recognised on every TV remote', () => {
  const { P } = loadPlatform({});
  for (const e of [{ key: 'Escape' }, { key: 'GoBack' }, { key: 'XF86Back' }, { keyCode: 461 }, { keyCode: 10009 }]) {
    assert.equal(P.isBack(e), true, JSON.stringify(e));
  }
  assert.equal(P.isBack({ key: 'ArrowLeft', keyCode: 37 }), false);
  assert.equal(P.isOk({ key: 'Enter' }), true);
});

test('R2: same-origin by default, configured server for packaged apps', () => {
  const web = loadPlatform({ serverUrl: '' });
  assert.equal(web.P.api('/api/info'), '/api/info');
  web.P.connect();
  assert.deepEqual(web.calls, [[]]);

  const tv = loadPlatform({ serverUrl: 'https://hub.example.com/', platform: 'webos' });
  assert.equal(tv.P.api('/api/qr'), 'https://hub.example.com/api/qr');
  tv.P.connect();
  assert.equal(tv.calls[0][0], 'https://hub.example.com');
});

test('R4: Back on the home screen exits through the platform API', () => {
  let exited = false;
  const tizen = { application: { getCurrentApplication: () => ({ exit: () => { exited = true; } }) } };
  const { P } = loadPlatform({ platform: 'tizen' }, { tizen });
  P.exit();
  assert.equal(exited, true);

  let capExit = false;
  const Capacitor = { Plugins: { App: { exitApp: () => { capExit = true; }, addListener() {} } } };
  loadPlatform({ platform: 'android' }, { Capacitor }).P.exit();
  assert.equal(capExit, true);
});

test('R1/R6: build-tv produces store-ready bundles', () => {
  const env = { ...process.env, HUDDLE_SERVER_URL: 'https://hub.example.com' };
  execFileSync(process.execPath, [path.join(root, 'scripts', 'build-tv.mjs'), 'all'], { env, stdio: 'pipe' });
  const pkg = require('../package.json');

  const appinfo = JSON.parse(fs.readFileSync(path.join(root, 'dist/webos/appinfo.json'), 'utf8'));
  assert.equal(appinfo.id, pkg.huddle.appId);
  assert.equal(appinfo.version, pkg.version);
  assert.equal(appinfo.disableBackHistoryAPI, true);
  for (const f of [appinfo.main, appinfo.icon, appinfo.largeIcon, appinfo.splashBackground]) {
    assert.ok(fs.existsSync(path.join(root, 'dist/webos', f)), f);
  }

  const xml = fs.readFileSync(path.join(root, 'dist/tizen/config.xml'), 'utf8');
  assert.doesNotMatch(xml, /\{\{/);
  assert.match(xml, /<access origin="https:\/\/hub\.example\.com"/);
  assert.match(xml, /connect-src 'self' https:\/\/hub\.example\.com wss:\/\/hub\.example\.com/);

  for (const p of ['webos', 'tizen', 'android']) {
    const html = fs.readFileSync(path.join(root, 'dist', p, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /(src|href)="\//, `${p}: no root-absolute asset paths`);
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (!/^https?:/.test(m[1])) assert.ok(fs.existsSync(path.join(root, 'dist', p, m[1])), `${p}: ${m[1]}`);
    }
    const cfg = fs.readFileSync(path.join(root, 'dist', p, 'config.js'), 'utf8');
    assert.match(cfg, new RegExp(`"platform":"${p}"`));
    assert.match(cfg, /"serverUrl":"https:\/\/hub\.example\.com"/);
  }
});

test('R1: build-tv refuses to build without a server URL', () => {
  const env = { ...process.env };
  delete env.HUDDLE_SERVER_URL;
  const r = (() => {
    try { execFileSync(process.execPath, [path.join(root, 'scripts', 'build-tv.mjs'), 'webos'], { env, stdio: 'pipe', cwd: os.tmpdir() }); return 0; }
    catch (e) { return e.status; }
  })();
  assert.equal(r, 1);
});
