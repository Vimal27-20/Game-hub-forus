// Word Grid solver, scoring and board quality (spec 004 R1, R2).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadWorld } = require('./harness');

const w = loadWorld();
const WG = w.WordGrid;

test('004 R1.4: points by word length', () => {
  assert.deepEqual([3, 4, 5, 6, 7, 8, 12].map(WG.points), [1, 1, 2, 3, 5, 11, 11]);
});

test('004 R1.3: solver finds words along touching tiles only, Qu counts as two letters', () => {
  const board = ['C', 'A', 'T', 'X',
                 'X', 'R', 'E', 'X',
                 'QU', 'I', 'T', 'X',
                 'X', 'X', 'X', 'X'];
  const words = WG.solve(board, 4, 3);
  for (const word of ['cat', 'car', 'care', 'crate', 'rat', 'quit']) assert.ok(words.has(word), word);
  assert.ok(!words.has('cx'), 'too short / not a word');
  assert.ok(!words.has('tact'), 'cannot reuse a tile');
});

test('004 R2.1: generated 4×4 boards are rich and include a long word', () => {
  for (let i = 0; i < 5; i++) {
    const b = WG.makeBoard(4, 3);
    assert.equal(b.board.length, 16);
    assert.ok(b.words.size >= 60, `only ${b.words.size} words`);
    assert.ok([...b.words].some(x => x.length >= 6));
  }
});

test('004 R2.1: generated 5×5 boards are rich', () => {
  const b = WG.makeBoard(5, 4);
  assert.equal(b.board.length, 25);
  assert.ok(b.words.size >= 150, `only ${b.words.size} words`);
});

test('004 R2.2: dictionary has common words and no obvious profanity', () => {
  const dict = new Set(w.HUDDLE_CONTENT.dict.split(' '));
  assert.ok(dict.size > 70000);
  for (const x of ['house', 'quiet', 'garden', 'party']) assert.ok(dict.has(x), x);
  assert.ok(!dict.has('fuck') && !dict.has('shit'));
});
