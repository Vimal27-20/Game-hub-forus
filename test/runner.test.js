// Runner tests. Names reference specs/003-party-pack-v2/requirements.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const R = require('../public/runner');

function setup(gameImpl, opts = {}) {
  const sent = [], events = { end: null, rounds: [], errors: [] };
  const connected = new Set(['a', 'b']);
  const runner = R.create({
    introSec: 0, roundSec: 1,
    stage: { innerHTML: '' },
    send: (id, msg) => sent.push([id, msg]),
    isConnected: id => connected.has(id),
    onEnd: r => { events.end = r; },
    onRoundOver: r => events.rounds.push(r),
    onError: e => events.errors.push(e),
    memory: opts.memory,
  });
  const def = Object.assign({ id: 'g', title: 'G', emoji: '🎮', how: ['x'], create: gameImpl }, opts.def);
  runner.start(def, [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], { room: opts.room, settings: opts.settings });
  return { runner, sent, events, connected };
}

test('003 R8.1: physics steps run at a fixed 120 Hz whatever the frame rate', () => {
  for (const fps of [30, 60, 144]) {
    let steps = 0;
    const { runner } = setup(() => ({ step() { steps++; } }));
    for (let i = 0; i < fps * 2; i++) runner.frame(1 / fps);
    assert.ok(Math.abs(steps - 240) <= 1, `${fps} fps -> ${steps} steps`);
  }
});

test('003 R1.2: pause freezes game time, steps, timers and input', () => {
  let fired = 0, steps = 0, inputs = 0;
  const { runner } = setup(ctx => { ctx.after(1, () => fired++); return { step() { steps++; }, onInput() { inputs++; } }; });
  runner.frame(0.25); runner.frame(0.25);
  assert.equal(runner.pause(), true);
  const before = steps;
  for (let i = 0; i < 100; i++) runner.frame(0.1);
  runner.input('a', { t: 'tap' });
  assert.equal(fired, 0); assert.equal(steps, before); assert.equal(inputs, 0);
  assert.equal(runner.mode, 'paused');
  runner.resume();
  runner.frame(0.25); runner.frame(0.25); runner.frame(0.1); // frames are capped at 0.25 s
  assert.equal(fired, 1);
});

test('003 R1.4: resume re-sends each player\'s last controller UI', () => {
  const { runner, sent } = setup(ctx => { ctx.send('a', { ui: 'tap' }); ctx.send('b', { ui: 'joystick' }); return {}; });
  runner.frame(0.01);
  runner.pause(); sent.length = 0;
  runner.resume();
  assert.deepEqual(sent.map(([id, m]) => [id, m.ui]).sort(), [['a', 'tap'], ['b', 'joystick']]);
});

test('003 R2.2: rejoin restores the current UI and calls onRejoin', () => {
  const rejoined = [];
  const { runner, sent } = setup(ctx => { ctx.send('a', { ui: 'choices', options: [] }); return { onRejoin: id => rejoined.push(id) }; });
  runner.frame(0.01); sent.length = 0;
  runner.leave('a');
  assert.equal(runner.rejoin('a'), true);
  assert.equal(sent[0][1].ui, 'choices');
  assert.deepEqual(rejoined, ['a']);
});

test('003 R5.1/R5.3: scores, awards and ranking with shared ranks', () => {
  const { runner, events } = setup(ctx => { ctx.score('a', 5); ctx.score('b', 5); ctx.end({ awards: [{ id: 'b', emoji: '⚡', title: 'Fastest' }, { id: 'zzz' }] }); return {}; });
  runner.frame(0.01);
  assert.deepEqual(events.end.ranked.map(r => r.rank), [1, 1]);
  assert.deepEqual(events.end.awards, [{ id: 'b', emoji: '⚡', title: 'Fastest' }]);
  assert.equal(runner.mode, 'ended');
});

test('003 R5.3: a default award is added when the game gives none', () => {
  const { runner, events } = setup(ctx => { ctx.score('b', 3); ctx.end(); return {}; });
  runner.frame(0.01);
  assert.equal(events.end.awards[0].id, 'b');
});

test('003 R5.2: round scoreboard shows gains, can be skipped, then continues', () => {
  let next = 0;
  const { runner, events, sent } = setup(ctx => { ctx.score('a', 3); ctx.roundOver('Round 1', () => next++); return {}; });
  runner.frame(0.01);
  assert.deepEqual(events.rounds[0].gains, { a: 3, b: 0 });
  assert.equal(sent.filter(([, m]) => m.ui === 'wait' && m.skip && m.text === 'Round 1').length, 2);
  assert.equal(runner.mode, 'interlude');
  runner.skip();
  assert.equal(next, 1);
  assert.equal(runner.mode, 'play');
});

test('003 R5.2: round scoreboard closes by itself', () => {
  let next = 0;
  const { runner } = setup(ctx => { ctx.roundOver('R', () => next++); return {}; });
  runner.frame(0.01);
  for (let i = 0; i < 12; i++) runner.frame(0.1);
  assert.equal(next, 1);
});

test('003 R6.1: pick never repeats until the bank runs out, and memory persists', () => {
  const data = {};
  const mem = R.createMemory(data);
  const bank = Array.from({ length: 10 }, (_, i) => 'w' + i);
  const first = mem.pick('words', bank, 6);
  const mem2 = R.createMemory(JSON.parse(JSON.stringify(data))); // survives a reload
  const second = mem2.pick('words', bank, 4);
  assert.equal(new Set(first.concat(second)).size, 10);
  const third = mem2.pick('words', bank, 3); // exhausted: new cycle
  assert.equal(new Set(third).size, 3);
});

test('003 R6.1: pick over an exhausted bank uses the unused items first', () => {
  const mem = R.createMemory();
  const bank = ['a', 'b', 'c', 'd'];
  const first = mem.pick('x', bank, 3);
  const leftover = bank.find(w => !first.includes(w));
  for (let i = 0; i < 20; i++) {
    const m = R.createMemory(JSON.parse(JSON.stringify(mem.data)));
    const next = m.pick('x', bank, 2);
    assert.equal(next[0], leftover);
    assert.equal(new Set(next).size, 2);
  }
});

test('003 R6.3: variant never repeats the previous choice', () => {
  const mem = R.createMemory();
  let last = null;
  for (let i = 0; i < 50; i++) { const v = mem.variant('bumper', ['a', 'b', 'c', 'd']); assert.notEqual(v, last); last = v; }
});

test('003 R4.2: settings resolve from the room length unless chosen', () => {
  const def = { settings: [{ id: 'rounds', label: 'Rounds', options: [3, 5, 7], def: { quick: 3, standard: 5, long: 7 } }] };
  assert.deepEqual(R.resolveSettings(def, { length: 'long' }, {}), { rounds: 7 });
  assert.deepEqual(R.resolveSettings(def, { length: 'quick' }, { rounds: 5 }), { rounds: 5 });
  assert.deepEqual(R.resolveSettings(def, { length: 'quick' }, { rounds: 99 }), { rounds: 3 });
});

test('003 R5.4: party points by rank', () => {
  assert.deepEqual([1, 2, 3, 4, 9].map(R.partyPoints), [5, 3, 2, 1, 1]);
});

test('003 R4.3: intro card runs before the game is created and can be skipped', () => {
  let created = 0;
  const runner = R.create({ introSec: 3, send() {}, isConnected: () => true, stage: { innerHTML: '' } });
  runner.start({ id: 'g', title: 'G', how: [], create: () => { created++; return {}; } }, [{ id: 'a' }], {});
  runner.frame(1);
  assert.equal(created, 0); assert.equal(runner.mode, 'intro');
  runner.skip();
  assert.equal(created, 1); assert.equal(runner.mode, 'play');
});

test('003 R9: game exceptions are reported, not thrown', () => {
  const { runner, events } = setup(() => ({ update() { throw new Error('boom'); } }));
  runner.frame(0.1);
  assert.equal(events.errors.length, 1);
});
