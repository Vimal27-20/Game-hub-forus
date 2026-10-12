// Server contract tests. Test names reference requirements in specs/001-core-platform/requirements.md.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { startHub, once, ack, connected, sleep } = require('./helpers');

let t;
beforeEach(async () => { t = await startHub({ playerGraceMs: 150, hostGraceMs: 150 }); });
afterEach(() => t.stop());

async function hostRoom() {
  const host = t.client();
  await connected(host);
  const room = await ack(host, 'host:create', {});
  return { host, room };
}
async function joinAs(code, name, key) {
  const p = t.client();
  await connected(p);
  const res = await ack(p, 'player:join', { code, name, key });
  return { p, res };
}

test('R1: GET /healthz reports ok', async () => {
  const res = await fetch(t.url + '/healthz');
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('R1: /api/info prefers PUBLIC_URL and allows cross-origin TV apps', async () => {
  await t.stop();
  t = await startHub({ publicUrl: 'https://huddle.example.com/' });
  const res = await fetch(t.url + '/api/info', { headers: { Origin: 'file://' } });
  assert.deepEqual(await res.json(), { base: 'https://huddle.example.com' });
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('R1: ALLOWED_ORIGINS restricts the API to listed origins', async () => {
  await t.stop();
  t = await startHub({ allowedOrigins: 'https://tv.example.com' });
  const ok = await fetch(t.url + '/api/info', { headers: { Origin: 'https://tv.example.com' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://tv.example.com');
  const no = await fetch(t.url + '/api/info', { headers: { Origin: 'https://evil.example.com' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
});

test('R1: /api/qr returns an SVG', async () => {
  const res = await fetch(t.url + '/api/qr?u=' + encodeURIComponent('https://x.test/play?r=ABCD'));
  assert.match(res.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await res.text(), /<svg/);
});

test('R2: host gets a 4-letter room code without ambiguous letters', async () => {
  const { room } = await hostRoom();
  assert.match(room.code, /^[A-HJ-NP-Z]{4}$/);
  assert.ok(room.hostKey);
  assert.deepEqual(room.players, []);
});

test('R3: player joins, host is notified and sees the player list', async () => {
  const { host, room } = await hostRoom();
  const joined = once(host, 'player:join');
  const players = once(host, 'players');
  const { res } = await joinAs(room.code.toLowerCase(), '  Ava<b>  ');
  assert.equal(res.ok, true);
  assert.equal(res.name, 'Avab', 'name is trimmed and stripped of < >');
  assert.equal(res.hostOnline, true);
  assert.deepEqual(await joined, { id: res.id, reconnect: false });
  const list = await players;
  assert.equal(list.length, 1);
  assert.equal(list[0].vip, true, 'first player is VIP');
  assert.equal('key' in list[0], false, 'secret key is never broadcast');
});

test('R3: join errors for unknown room and missing name', async () => {
  const { room } = await hostRoom();
  assert.match((await joinAs('ZZZZ', 'Ava')).res.error, /not found/);
  assert.match((await joinAs(room.code, '   ')).res.error, /name/);
});

test('R3: room is capped at 12 players', async () => {
  const { room } = await hostRoom();
  for (let i = 0; i < 12; i++) assert.equal((await joinAs(room.code, 'P' + i)).res.ok, true);
  assert.match((await joinAs(room.code, 'Late')).res.error, /full/);
});

test('R4: each character can only be taken once', async () => {
  const { room } = await hostRoom();
  const a = await joinAs(room.code, 'A');
  const b = await joinAs(room.code, 'B');
  assert.deepEqual(await ack(a.p, 'player:char', 'fox'), { ok: true });
  assert.match((await ack(b.p, 'player:char', 'fox')).error, /took/);
  assert.deepEqual(await ack(b.p, 'player:char', 'frog'), { ok: true });
});

test('R5: controller input is relayed to the host with the player id', async () => {
  const { host, room } = await hostRoom();
  const { p, res } = await joinAs(room.code, 'A');
  const got = once(host, 'in');
  p.emit('in', { t: 'dash' });
  assert.deepEqual(await got, { id: res.id, d: { t: 'dash' } });
});

test('R5: host messages reach one player or all players', async () => {
  const { host, room } = await hostRoom();
  const a = await joinAs(room.code, 'A');
  const b = await joinAs(room.code, 'B');
  const toA = once(a.p, 'msg');
  host.emit('host:send', { to: a.res.id, msg: { ui: 'tap' } });
  assert.deepEqual(await toA, { ui: 'tap' });
  const allA = once(a.p, 'msg'), allB = once(b.p, 'msg');
  host.emit('host:send', { to: 'all', msg: { ui: 'wait' } });
  assert.deepEqual(await Promise.all([allA, allB]), [{ ui: 'wait' }, { ui: 'wait' }]);
});

test('R5: players cannot impersonate the host', async () => {
  const { room } = await hostRoom();
  const a = await joinAs(room.code, 'A');
  const b = await joinAs(room.code, 'B');
  let leaked = false;
  b.p.on('msg', () => { leaked = true; });
  a.p.emit('host:send', { to: 'all', msg: { ui: 'evil' } });
  a.p.emit('host:kick', b.res.id);
  await sleep(100);
  assert.equal(leaked, false);
  assert.equal(b.p.connected, true);
});

test('R6: a phone rejoins its seat with its key after a drop', async () => {
  const { host, room } = await hostRoom();
  const first = await joinAs(room.code, 'A');
  await ack(first.p, 'player:char', 'fox');
  first.p.close();
  await once(host, 'player:leave');
  const again = await joinAs(room.code, '', first.res.key);
  assert.equal(again.res.id, first.res.id);
  assert.equal(again.res.char, 'fox');
  assert.equal(again.res.name, 'A');
});

test('R6: a dropped phone loses its seat after the grace period', async () => {
  const { room } = await hostRoom();
  const first = await joinAs(room.code, 'A');
  first.p.close();
  await sleep(300);
  const again = await joinAs(room.code, 'A2', first.res.key);
  assert.notEqual(again.res.id, first.res.id, 'got a fresh seat');
});

test('R7: TV reconnects to the same room with its host key and phones are told', async () => {
  const { host, room } = await hostRoom();
  const a = await joinAs(room.code, 'A');
  const gone = once(a.p, 'host:gone');
  host.close();
  await gone;
  const back = once(a.p, 'host:back');
  const host2 = t.client();
  await connected(host2);
  const again = await ack(host2, 'host:create', { code: room.code, hostKey: room.hostKey });
  assert.equal(again.code, room.code);
  assert.equal(again.players.length, 1);
  await back;
});

test('R7: a wrong host key gets a new room, not a hijack', async () => {
  const { room } = await hostRoom();
  const thief = t.client();
  await connected(thief);
  const res = await ack(thief, 'host:create', { code: room.code, hostKey: 'guess' });
  assert.notEqual(res.code, room.code);
});

test('R7: room closes if the TV does not come back in time', async () => {
  const { host, room } = await hostRoom();
  const a = await joinAs(room.code, 'A');
  const closed = once(a.p, 'room:closed');
  host.close();
  await closed;
  assert.match((await joinAs(room.code, 'B')).res.error, /not found/);
});
