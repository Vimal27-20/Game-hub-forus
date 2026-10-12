// Bot playthrough harness (spec 003 R9.2). Loads the real browser scripts into jsdom
// (canvas stubbed), runs a game through the real runner, and lets bots answer whatever
// controller UI each player was last sent.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const PUB = path.join(__dirname, '..', 'public');

// A 2D context that accepts every call and property. Gradients/patterns get addColorStop.
function stubContext() {
  const noop = () => grad;
  const grad = { addColorStop() {} };
  const base = { measureText: s => ({ width: String(s).length * 10 }), getImageData: () => ({ data: new Uint8ClampedArray(4) }), canvas: null };
  return new Proxy(base, {
    get(t, k) { if (k in t) return t[k]; return noop; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function loadWorld() {
  const dom = new JSDOM('<!doctype html><body><div id="stage"></div><canvas id="cv"></canvas></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = function () { const c = stubContext(); c.canvas = this; return c; };
  const run = f => w.eval(fs.readFileSync(path.join(PUB, f), 'utf8') + '\n//# sourceURL=' + f);
  run('shared.js');
  for (const f of fs.readdirSync(path.join(PUB, 'content')).sort()) run('content/' + f);
  run('runner.js');
  for (const f of fs.readdirSync(path.join(PUB, 'games')).sort()) run('games/' + f);
  return w;
}

// Bot policy: react to the last UI message like a (random) human would.
function makeBot(id, w, act) {
  let msg = null, since = 0, done = false, every = 0, react = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  return {
    receive(m) {
      if (!m) return;
      if (m.ui) { msg = m; since = 0; done = false; every = 0; react = null; }
    },
    tick(dt) {
      if (!msg) return;
      since += dt; every -= dt;
      const ui = msg.ui;
      if (ui === 'joystick' || ui === 'dpad') {
        if (every <= 0) {
          every = rnd(0.15, 0.5);
          if (ui === 'joystick') act({ t: 'joy', x: rnd(-1, 1), y: rnd(-1, 1) });
          else act({ t: 'dir', d: Math.random() * 4 | 0 });
          if (msg.btn && Math.random() < 0.3) { act({ t: 'btn', down: true }); act({ t: 'btn', down: false }); }
        }
      } else if (ui === 'choices' && !done && since > rnd(0.2, 1.5)) {
        done = true;
        const o = msg.options || [];
        if (o.length) act({ t: 'choice', id: o[Math.random() * o.length | 0].id });
      } else if (ui === 'secret' && !done && since > 0.3) { done = true; act({ t: 'ready' }); }
      else if (ui === 'turn' && !done && since > 0.5) { done = true; act({ t: 'done' }); }
      else if (ui === 'draw' && every <= 0) {
        every = 0.1;
        act({ t: 'pts', s: id + '-1', c: '#111111', w: 0.01, p: [Math.random(), Math.random(), Math.random(), Math.random()] });
      } else if (ui === 'guess' && every <= 0) { every = rnd(0.5, 2); act({ t: 'guess', text: ['cat', 'tree', 'house', 'robot'][Math.random() * 4 | 0] }); }
      else if (ui === 'tap' && every <= 0) { every = 0.1; act({ t: 'tap', n: 2 }); }
      else if (ui === 'aim' && every <= 0) {
        every = rnd(0.6, 1.4);
        const a = rnd(-Math.PI, Math.PI), p = rnd(0.2, 1);
        act({ t: 'aim', a, p }); act({ t: 'shot', a, p });
      } else if (ui === 'react' && !done) {
        if (!react) {
          const go = (msg.seq || []).find(s => s.kind === 'go');
          const r = Math.random();
          react = r < 0.1 ? { at: 0.2, d: { t: 'react', r: msg.r, foul: 'early' } }
            : go ? { at: go.at / 1000 + rnd(0.15, 0.6), d: { t: 'react', r: msg.r, ms: rnd(150, 600) | 0 } } : { at: 99, d: null };
        }
        if (since >= react.at && react.d) { done = true; act(react.d); }
      } else if (ui === 'number' && !done && since > rnd(0.5, 3)) { done = true; act({ t: 'number', v: Math.round(rnd(1, 3000)) }); }
      else if (ui === 'text' && !done && since > rnd(0.5, 3)) { done = true; act({ t: 'text', text: 'bot lie ' + (Math.random() * 1000 | 0) }); }
    },
  };
}

// Runs one game to completion. Returns { result, errors, sent, rejoinOk, seconds }.
function playthrough(w, gameId, opts = {}) {
  const def = w.Hub.games.find(g => g.id === gameId);
  if (!def) throw new Error('no game ' + gameId);
  const n = Math.min(def.max, Math.max(def.min, opts.players || 4));
  const chars = w.CHARACTERS;
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + (i + 1), name: 'Bot' + (i + 1), char: chars[i].id, character: chars[i], color: chars[i].color, emoji: chars[i].emoji }));
  const connected = new Set(players.map(p => p.id));
  const stage = w.document.getElementById('stage');
  const canvas = w.document.getElementById('cv');
  const errors = [], sent = {};
  let result = null, runner;
  const bots = {};
  runner = w.HuddleRunner.create({
    stage, canvas, g: canvas.getContext('2d'), size: () => ({ W: 1920, H: 1080 }),
    introSec: 0.2, roundSec: 0.4,
    send(id, m) { (sent[id] = sent[id] || []).push(m); if (connected.has(id) && bots[id]) bots[id].receive(m); },
    isConnected: id => connected.has(id),
    sfx() {}, toast() {},
    onEnd: r => { result = r; },
    onError: e => errors.push(e),
    memory: w.HuddleRunner.createMemory(),
  });
  players.forEach(p => { bots[p.id] = makeBot(p.id, w, d => runner.input(p.id, d)); });
  runner.start(def, players, { room: { length: opts.length || 'quick', difficulty: opts.difficulty || 'normal' } });

  const dt = 1 / 30, limit = opts.maxSeconds || 900;
  const leaver = players[1] || players[0];
  let t = 0, rejoinOk = null, pausedOk = null;
  while (!result && t < limit && errors.length === 0) {
    runner.frame(dt);
    if (opts.render !== false) runner.render(canvas.getContext('2d'), 1920, 1080);
    for (const p of players) if (connected.has(p.id)) bots[p.id].tick(dt);
    t += dt;
    if (Math.abs(t - 4) < dt / 2) { connected.delete(leaver.id); runner.leave(leaver.id); }
    if (Math.abs(t - 7) < dt / 2 && !result) {
      connected.add(leaver.id);
      const before = (sent[leaver.id] || []).length;
      runner.rejoin(leaver.id);
      const after = sent[leaver.id] || [];
      rejoinOk = after.length > before; // got a UI back
      if (after.length > before) bots[leaver.id].receive(after[after.length - 1]);
    }
    if (Math.abs(t - 9) < dt / 2 && !result) {
      pausedOk = runner.pause();
      for (let i = 0; i < 30; i++) runner.frame(dt); // time passes while paused
      runner.resume();
    }
  }
  runner.stop();
  return { result, errors, sent, rejoinOk, pausedOk, seconds: t, players };
}

module.exports = { loadWorld, playthrough };
