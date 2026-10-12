// Browser smoke test (spec 003): starts a hub, drives the REAL TV page with remote keys and
// a REAL phone page in mobile emulation (headless Chrome), with simulated phones alongside.
//   npm run smoke            (needs Chrome or Edge; set CHROME_PATH if it isn't found)
// Screenshots go to smoke-out/ so you can eyeball every screen.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './smoke/cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));
const { io } = require('socket.io-client');
const { createApp } = require(join(root, 'server', 'app.js'));
const OUT = join(root, 'smoke-out');
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (name, ok, info) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); if (!ok) failed++; };

const hub = createApp({ port: 0, publicUrl: '' });
await new Promise(r => hub.server.listen(0, '127.0.0.1', r));
const URL = `http://127.0.0.1:${hub.server.address().port}`;
const phoneSock = () => new Promise(r => { const s = io(URL, { transports: ['websocket'], forceNew: true }); s.on('connect', () => r(s)); });

async function tvFlow() {
  const tv = await launch({ port: 9334, outDir: OUT });
  await tv.size(1600, 900);
  await tv.goto(URL + '/tv');
  let code = null;
  for (let i = 0; i < 40 && !/^[A-Z]{4}$/.test(code || ''); i++) { await sleep(250); code = await tv.eval("document.getElementById('roomCode').textContent"); }
  check('TV gets a room code', /^[A-Z]{4}$/.test(code), code);
  await sleep(800);
  check('short join link shown', /\/[A-Z]{4}$/.test(await tv.eval("document.getElementById('joinUrl').textContent")));
  check('11 game tiles in 4 category rows', (await tv.eval("document.querySelectorAll('.tile').length")) === 11 && (await tv.eval("document.querySelectorAll('#rows .row').length")) === 4);

  const phones = [];
  for (const [name, char] of [['Ava', 'fox'], ['Ben', 'frog'], ['Cy', 'octo']]) {
    const p = { name, last: null };
    const attach = s => { p.s = s; s.on('msg', m => { if (m.ui) p.last = m; }); };
    attach(await phoneSock());
    p.res = await new Promise(r => p.s.emit('player:join', { code, name }, r));
    await new Promise(r => p.s.emit('player:char', char, r));
    p.s.emit('in', { t: 'sys', a: 'menu' });
    p.attach = attach;
    phones.push(p);
  }
  await sleep(600);
  check('phones joined and got the menu', phones.every(p => p.last && p.last.ui === 'menu'));
  check('menu carries settings + categories', phones[0].last.games.length === 11 && phones[0].last.cats.length === 4);
  check('TV hero counts ready players', /3 players ready/.test(await tv.eval("document.getElementById('heroCta').textContent")));
  await tv.shot('tv-1-menu');

  await tv.key('ArrowRight'); await tv.key('Enter');
  check('OK opens the game setup sheet', await tv.eval("!document.getElementById('setup').classList.contains('hidden')"));
  await tv.key('ArrowUp'); const before = await tv.eval("document.querySelectorAll('#setupSheet .setrow b')[1].textContent");
  await tv.key('ArrowRight');
  const after = await tv.eval("document.querySelectorAll('#setupSheet .setrow b')[1].textContent");
  check('◀ ▶ changes a game setting and focus stays visible', before !== after && await tv.eval("!!document.querySelector('#setupSheet .setrow.focus')"), `${before} → ${after}`);
  await tv.shot('tv-2-setup');
  await tv.key('Escape');
  check('Back closes setup', await tv.eval("document.getElementById('setup').classList.contains('hidden')"));
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'Enter']) await tv.key(k);
  check('Settings tab opens', await tv.eval("!document.getElementById('tab-settings').classList.contains('hidden')"));
  await tv.shot('tv-3-settings');
  await tv.key('Escape');
  check('Back on a tab returns to Games', await tv.eval("!document.getElementById('tab-games').classList.contains('hidden')"));

  const vip = phones[0];
  vip.s.emit('in', { t: 'sys', a: 'setting', game: 'closecall', key: 'count', value: 6 });
  vip.s.emit('in', { t: 'sys', a: 'pick', game: 'closecall' });
  await sleep(700);
  check('VIP pick starts the game with an intro card', await tv.eval("!document.getElementById('game').classList.contains('hidden') && !document.getElementById('intro').classList.contains('hidden')"));
  await tv.shot('tv-4-intro');
  await tv.key('Enter'); await sleep(500);
  check('OK skips the intro; phones get the number pad', phones.every(p => p.last.ui === 'number'));
  await tv.shot('tv-5-game');

  await tv.key('Escape'); await sleep(300);
  check('Back pauses; phones show Paused', await tv.eval("!document.getElementById('pause').classList.contains('hidden')") && phones.every(p => p.last.ui === 'paused'));
  await tv.shot('tv-6-pause');
  await tv.key('Enter'); await sleep(300);
  check('OK on Resume resumes; phones get their controller back', await tv.eval("document.getElementById('pause').classList.contains('hidden')") && phones.every(p => p.last.ui === 'number'));
  await tv.eval('history.back()'); await sleep(600);
  check('browser Back pauses and stays on the site', (await tv.eval('location.pathname')) === '/tv' && await tv.eval("!document.getElementById('pause').classList.contains('hidden')"));
  vip.s.emit('in', { t: 'sys', a: 'resume' }); await sleep(400);
  check('VIP phone can resume', await tv.eval("document.getElementById('pause').classList.contains('hidden')"));

  const ben = phones[1];
  ben.s.close(); await sleep(500);
  ben.attach(await phoneSock());
  const rj = await new Promise(r => ben.s.emit('player:join', { code, name: '', key: ben.res.key }, r));
  await sleep(600);
  check('rejoin keeps the seat and returns to the running game', rj.id === ben.res.id && ben.last.ui === 'number');

  const answered = new Set();
  for (let i = 0; i < 200 && !(await tv.eval("!document.getElementById('results').classList.contains('hidden')")); i++) {
    for (const p of phones) if (p.last.ui === 'number' && !answered.has(p.last)) { answered.add(p.last); p.s.emit('in', { t: 'number', v: Math.round(Math.random() * 3000) }); }
    if (await tv.eval("!document.getElementById('board').classList.contains('hidden')")) { await sleep(400); await tv.shot('tv-7-scoreboard'); vip.s.emit('in', { t: 'sys', a: 'skip' }); }
    await sleep(400);
  }
  await sleep(500);
  check('game reaches results; every phone gets its result', await tv.eval("!document.getElementById('results').classList.contains('hidden')") && phones.every(p => p.last.ui === 'result'));
  check('tonight standings shown', (await tv.eval("document.querySelectorAll('.stand').length")) >= 3);
  await tv.shot('tv-8-results');
  await tv.key('Escape'); await sleep(300);
  check('Back on results returns to the menu; tile marked played', await tv.eval("!document.getElementById('menu').classList.contains('hidden') && !!document.querySelector('.tile[data-id=closecall] .t-done')"));
  await tv.cdp('Page.reload'); await sleep(2500);
  check('TV reload keeps the room and standings', (await tv.eval("document.getElementById('roomCode').textContent")) === code && await tv.eval("!!document.querySelector('.slot .pts')"));
  check('TV reload refreshes the ready count', /3 players ready/.test(await tv.eval("document.getElementById('heroCta').textContent")));
  await tv.shot('tv-9-after-reload');
  check('no errors on the TV', tv.errors.length === 0, tv.errors.slice(0, 2).join(' | '));
  phones.forEach(p => p.s.close());
  tv.close();
}

async function phoneFlow() {
  const tvSock = await phoneSock();
  const room = await new Promise(r => tvSock.emit('host:create', {}, r));
  const inputs = [];
  let phoneId = null;
  tvSock.on('player:join', d => { if (!phoneId) phoneId = d.id; });
  tvSock.on('in', m => inputs.push(m.d));
  const send = async (msg, wait = 500) => { tvSock.emit('host:send', { to: phoneId, msg }); await sleep(wait); };
  const ph = await launch({ port: 9335, outDir: OUT });
  await ph.size(390, 844, true);
  await ph.goto(`${URL}/${room.code}`); await sleep(1500);
  check('phone: short link pre-fills the room code', (await ph.eval("document.getElementById('code').value")) === room.code);
  await ph.eval("document.getElementById('name').value = 'Vimal'");
  await ph.tap('#go'); await sleep(800);
  await ph.tap('.ch[data-id="dragon"]'); await sleep(500);
  const other = await phoneSock();
  await new Promise(r => other.emit('player:join', { code: room.code, name: 'Sam' }, r));
  await new Promise(r => other.emit('player:char', 'fox', r));
  await sleep(400);
  check('phone: URL becomes the short link', (await ph.eval('location.pathname')) === '/' + room.code);
  const opt = (v, l) => ({ v, label: l || String(v) });
  await send({ ui: 'menu', focus: 'golf', room: { length: 'standard', difficulty: 'normal', vibrate: true },
    roomOptions: [{ id: 'length', label: 'Game length', options: [opt('quick', 'Quick'), opt('standard', 'Standard'), opt('long', 'Long')] }],
    cats: [{ id: 'action', name: 'Action', sub: 'Physics & reflexes' }, { id: 'social', name: 'Social', sub: 'Bluff' }],
    games: [{ id: 'golf', title: 'Mini Golf Mayhem', emoji: '⛳', tagline: 'Everyone putts at once.', genre: 'Golf', category: 'action', how: ['Drag back', 'Release', 'Sink it'], min: 1, max: 12, time: '4 min', controls: 'Drag', colors: ['#2fbf71', '#0f7d4a'], settings: [{ id: 'holes', label: 'Holes', options: [opt(3), opt(5), opt(7)], value: 5 }] },
      { id: 'fakeout', title: 'Fake Out', emoji: '🎭', tagline: 'Fool friends.', genre: 'Bluff', category: 'social', how: ['a', 'b', 'c'], min: 3, max: 12, time: '6 min', controls: 'Type', colors: ['#f72585', '#7209b7'], settings: [] }] }, 700);
  check('phone: VIP menu by category, locked when short of players', (await ph.eval("document.querySelectorAll('.cat').length")) === 2 && await ph.eval("document.querySelector('.gcard[data-id=fakeout]').classList.contains('locked')"));
  await ph.shot('phone-1-menu');
  await ph.tap('.gcard[data-id=golf]'); await ph.tap('.seg button:nth-child(3)'); await ph.shot('phone-2-sheet'); await ph.tap('#start');
  check('phone: game sheet sends setting + pick', inputs.some(d => d.a === 'setting' && d.value === 7) && inputs.some(d => d.a === 'pick' && d.game === 'golf'));

  await send({ ui: 'aim', label: 'Hole 1 · Par 2' });
  const c = await ph.eval("(() => { const r = document.getElementById('pad').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()");
  await ph.mouse('mousePressed', c[0], c[1]);
  for (let i = 1; i <= 6; i++) { await ph.mouse('mouseMoved', c[0] - i * 10, c[1] + i * 18); await sleep(50); }
  await ph.shot('phone-3-aim');
  await ph.mouse('mouseReleased', c[0] - 60, c[1] + 108); await sleep(300);
  const shot = inputs.find(d => d.t === 'shot');
  check('phone: drag back aims the opposite way', shot && Math.cos(shot.a) > 0 && Math.sin(shot.a) < 0 && shot.p > 0.2);
  await send({ ui: 'dpad', btn: 'BOOST' }); await ph.tap('.dpad .dr'); await ph.shot('phone-4-dpad');
  check('phone: arrow pad sends directions', inputs.some(d => d.t === 'dir' && d.d === 1));
  await send({ ui: 'react', r: 1, seq: [{ at: 0, kind: 'wait', show: 'WAIT…', color: '#7a1f1f' }, { at: 700, kind: 'go', show: 'DRAW!', color: '#1fae4b' }] }, 200);
  await ph.tap('#rb');
  await send({ ui: 'react', r: 2, seq: [{ at: 0, kind: 'wait', show: 'WAIT…', color: '#7a1f1f' }, { at: 300, kind: 'go', show: 'DRAW!', color: '#1fae4b' }] }, 700);
  await ph.shot('phone-5-react'); await ph.tap('#rb');
  const r2 = inputs.find(d => d.t === 'react' && d.r === 2);
  check('phone: early tap is a foul; real tap is timed on the phone', inputs.some(d => d.t === 'react' && d.r === 1 && d.foul === 'early') && r2 && r2.ms >= 0 && r2.ms < 2000);
  await send({ ui: 'number', prompt: 'How many keys are on a piano?' });
  await ph.tap('.numpad button[data-k="8"]'); await ph.tap('.numpad button[data-k="8"]'); await ph.shot('phone-6-number'); await ph.tap('#numgo');
  check('phone: number pad', inputs.some(d => d.t === 'number' && d.v === 88));
  await send({ ui: 'text', prompt: 'A group of flamingos is called a _____.', max: 40 });
  await ph.eval("document.getElementById('tx').value = 'pinkening'"); await ph.tap('#send'); await ph.shot('phone-7-text');
  check('phone: text entry', inputs.some(d => d.t === 'text' && d.text === 'pinkening'));
  await send({ ui: 'joystick', btn: 'DASH' }); await ph.tap('#pauseBtn');
  await send({ ui: 'paused' }); await ph.shot('phone-8-paused');
  check('phone: VIP Pause button and paused controls', inputs.some(d => d.a === 'pause') && await ph.eval("!!document.getElementById('res') && !!document.getElementById('qt')"));
  await send({ ui: 'result', rank: 1, of: 4, score: 2400, game: 'Close Call', award: '🎯 Bullseye', next: 'Light Trails', tonight: 8 });
  await ph.shot('phone-9-result');
  check('phone: result with award and next-game actions', await ph.eval("!!document.querySelector('.award') && !!document.getElementById('nextg')"));
  check('phone: no JS errors', ph.errors.length === 0, ph.errors.join(' | '));
  tvSock.close(); other.close(); ph.close();
}

try { await tvFlow(); await phoneFlow(); } catch (e) { console.error(e); failed++; }
await hub.close();
console.log(failed ? `\n${failed} smoke check(s) failed` : `\nAll smoke checks passed · screenshots in smoke-out/`);
process.exit(failed ? 1 : 0);
