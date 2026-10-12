// Content bank tests (spec 003 R6.2, R6.4).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
for (const f of fs.readdirSync(path.join(__dirname, '..', 'public', 'content'))) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'content', f), 'utf8'), { window });
}
const C = window.HUDDLE_CONTENT;
const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const dupes = list => Array.from(list).filter((x, i, a) => a.indexOf(x) !== i); // vm arrays -> this realm

test('003 R6.2: quiz has 150+ questions in 6+ categories, no duplicates', () => {
  assert.ok(C.quiz.length >= 150, `quiz has ${C.quiz.length}`);
  assert.ok(new Set(C.quiz.map(q => q.c)).size >= 6);
  assert.deepEqual(dupes(C.quiz.map(q => norm(q.q))), []);
});

test('003 R6.4: quiz items are well-formed choice or true/false questions', () => {
  let tf = 0;
  for (const q of C.quiz) {
    assert.ok(q.q && q.c, JSON.stringify(q));
    if ('tf' in q) { tf++; assert.equal(typeof q.tf, 'boolean'); continue; }
    assert.equal(q.w.length, 3, q.q);
    const opts = [q.a].concat(q.w).map(norm);
    assert.equal(new Set(opts).size, 4, `duplicate option in: ${q.q}`);
  }
  assert.ok(tf >= 20, `only ${tf} true/false`);
});

test('003 R6.2: 60+ number questions with finite answers and unique ids', () => {
  assert.ok(C.numbers.length >= 60, `numbers has ${C.numbers.length}`);
  for (const n of C.numbers) assert.ok(Number.isFinite(n.a) && n.a >= 0, n.q);
  assert.deepEqual(dupes(C.numbers.map(n => n.id)), []);
  assert.deepEqual(dupes(C.numbers.map(n => norm(n.q))), []);
});

test('003 R6.2: 200+ drawing words across three tiers, no duplicates', () => {
  const all = C.words.easy.concat(C.words.medium, C.words.hard);
  assert.ok(all.length >= 200, `words has ${all.length}`);
  assert.ok(C.words.easy.length && C.words.medium.length && C.words.hard.length);
  assert.deepEqual(dupes(all.map(norm)), []);
  for (const w of all) assert.match(w, /^[a-z][a-z -]*[a-z]$/, w);
});

test('003 R6.2: Undercover has 15+ categories of 8 unique words', () => {
  const cats = Object.keys(C.spy);
  assert.ok(cats.length >= 15, `spy has ${cats.length}`);
  for (const c of cats) {
    assert.equal(C.spy[c].length, 8, c);
    assert.deepEqual(dupes(C.spy[c].map(norm)), [], c);
  }
});

test('003 R6.2: 60+ Fake Out facts with a blank, the truth and two distinct house lies', () => {
  assert.ok(C.fakeout.length >= 60, `fakeout has ${C.fakeout.length}`);
  for (const f of C.fakeout) {
    assert.match(f.q, /____/, f.q);
    assert.equal(f.lies.length, 2, f.q);
    assert.equal(new Set([f.a].concat(f.lies).map(norm)).size, 3, f.q);
  }
  assert.deepEqual(dupes(C.fakeout.map(f => f.id)), []);
});
