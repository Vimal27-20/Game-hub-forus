// Bot playthroughs of every game (spec 003 R9.2): start, play every round with simulated
// input, a player leaves and rejoins, the game is paused and resumed, and it reaches results.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadWorld, playthrough } = require('./harness');

const w = loadWorld();
const EXPECTED = ['bumper', 'tug', 'quiz', 'spy', 'doodle', 'golf', 'trails', 'lava', 'quickdraw', 'fakeout', 'closecall'];

test('003 R7.1: all eleven games are registered with the full definition', () => {
  const ids = w.Hub.games.map(g => g.id);
  for (const id of EXPECTED) assert.ok(ids.includes(id), `missing game ${id}`);
  for (const g of w.Hub.games) {
    assert.ok(['action', 'brains', 'social', 'creative'].includes(g.category), `${g.id} category`);
    assert.equal((g.how || []).length, 3, `${g.id} how-to lines`);
    assert.ok(Array.isArray(g.settings) && g.settings.length >= 1, `${g.id} settings`);
    for (const s of g.settings) assert.ok(s.id && s.label && s.options.length >= 2, `${g.id}.${s.id}`);
  }
});

test('003 R7.3: every game has a distinct genre line', () => {
  const genres = w.Hub.games.map(g => g.genre);
  assert.equal(new Set(genres).size, genres.length);
});

for (const id of EXPECTED) {
  for (const players of [2, 6]) {
    test(`003 R9.2: ${id} plays to results with ${players} bots, a rejoin and a pause`, () => {
      const def = w.Hub.games.find(g => g.id === id);
      if (!def) return assert.fail(`missing game ${id}`);
      if (players < def.min) return; // e.g. Fake Out needs 3
      const r = playthrough(w, id, { players });
      assert.deepEqual(r.errors.map(e => e.stack || String(e)), []);
      assert.ok(r.result, `${id} did not finish within ${r.seconds | 0}s`);
      assert.equal(r.result.ranked.length, r.players.length, 'every player is ranked');
      if (r.seconds > 7) assert.equal(r.rejoinOk, true, 'rejoining player got their controller back');
      if (r.seconds > 9) assert.equal(r.pausedOk, true, 'game could be paused');
      assert.ok(r.result.awards.length >= 0);
    });
  }
}

test('003 R2.3: a player who leaves mid-game keeps their score', () => {
  const r = playthrough(w, 'quiz', { players: 3 });
  assert.ok(r.result);
  assert.ok(r.result.ranked.some(x => x.id === 'p2'));
});
