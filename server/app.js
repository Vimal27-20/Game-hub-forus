// HUDDLE game hub server
// The TV (host) runs the games. Phones are controllers. This server only manages
// rooms, players, reconnects and relays messages between them.
// Contract: specs/001-core-platform/design.md (socket protocol).
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

const MAX_PLAYERS = 12;
const HOST_GRACE_MS = 10 * 60 * 1000; // room survives a TV disconnect this long
const PLAYER_GRACE_MS = 3 * 60 * 1000; // a dropped phone keeps its seat this long

function lanIP() {
  const all = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) all.push(i.address);
  }
  return all.find(a => a.startsWith('192.168.')) || all.find(a => a.startsWith('10.')) || all[0] || 'localhost';
}

// Packaged TV apps (webOS, Tizen, Android TV) load from file:// or a local origin,
// so the API and socket must accept cross-origin requests. Nothing uses cookies.
function parseOrigins(raw) {
  const list = String(raw || '*').split(',').map(s => s.trim()).filter(Boolean);
  return list.includes('*') ? '*' : list;
}

function createApp(opts = {}) {
  const port = Number(opts.port ?? process.env.PORT) || 3000;
  const publicUrl = String(opts.publicUrl ?? process.env.PUBLIC_URL ?? '').replace(/\/$/, '');
  const origins = parseOrigins(opts.allowedOrigins ?? process.env.ALLOWED_ORIGINS);
  const hostGraceMs = opts.hostGraceMs ?? HOST_GRACE_MS;
  const playerGraceMs = opts.playerGraceMs ?? PLAYER_GRACE_MS;

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000, cors: { origin: origins } });

  app.use('/api', (req, res, next) => {
    const o = req.headers.origin;
    if (origins === '*') res.set('Access-Control-Allow-Origin', '*');
    else if (o && origins.includes(o)) res.set({ 'Access-Control-Allow-Origin': o, Vary: 'Origin' });
    next();
  });

  const pub = path.join(__dirname, '..', 'public');
  app.get('/', (req, res) => res.sendFile(path.join(pub, 'index.html')));
  app.get('/tv', (req, res) => res.sendFile(path.join(pub, 'tv.html')));
  app.get('/play', (req, res) => res.sendFile(path.join(pub, 'play.html')));
  app.get('/healthz', (req, res) => res.json({ ok: true, rooms: rooms.size }));
  app.use(express.static(pub));

  // Base URL phones should use. When the TV opened the hub on "localhost",
  // swap in the computer's Wi-Fi address so phones can reach it.
  app.get('/api/info', (req, res) => {
    let base = publicUrl;
    if (!base) {
      const host = req.headers.host || `localhost:${port}`;
      const [hn, p] = host.split(':');
      if (['localhost', '127.0.0.1', '[', ''].includes(hn)) base = `http://${lanIP()}:${p || port}`;
      else base = `${req.protocol}://${host}`;
    }
    res.json({ base });
  });

  app.get('/api/qr', async (req, res) => {
    const u = String(req.query.u || '').slice(0, 300);
    try {
      const svg = await QRCode.toString(u, { type: 'svg', margin: 1, color: { dark: '#0b0b12', light: '#ffffff' } });
      res.type('image/svg+xml').send(svg);
    } catch { res.status(400).end(); }
  });

  // ---------------------------------------------------------------- rooms
  const rooms = new Map();
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const rand = () => crypto.randomBytes(9).toString('base64url');
  let nextId = 1;

  function newCode() {
    let c;
    do { c = Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join(''); } while (rooms.has(c));
    return c;
  }
  const pubPlayers = room => [...room.players.values()].map(p => ({
    id: p.id, name: p.name, char: p.char, connected: p.connected, vip: p.id === room.vip,
  }));
  function pickVip(room) {
    const cur = room.players.get(room.vip);
    if (cur && cur.connected) return;
    const next = [...room.players.values()].find(p => p.connected);
    room.vip = next ? next.id : null;
  }
  function broadcast(room) {
    pickVip(room);
    const players = pubPlayers(room);
    io.to('p:' + room.code).emit('lobby', { players });
    if (room.hostSocket) io.to(room.hostSocket).emit('players', players);
  }
  const cleanName = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 14);

  io.on('connection', sock => {
    // ---- TV / host
    sock.on('host:create', (data, cb) => {
      if (typeof cb !== 'function') return;
      let room = data && rooms.get(String(data.code || ''));
      if (room && room.hostKey === data.hostKey) {
        clearTimeout(room.killTimer);
      } else {
        room = { code: newCode(), hostKey: rand(), hostSocket: null, players: new Map(), vip: null, killTimer: null };
        rooms.set(room.code, room);
      }
      room.hostSocket = sock.id;
      sock.data = { role: 'host', code: room.code };
      cb({ code: room.code, hostKey: room.hostKey, players: pubPlayers(room) });
      io.to('p:' + room.code).emit('host:back');
    });

    sock.on('host:send', ({ to, msg } = {}) => {
      const room = sock.data && sock.data.role === 'host' && rooms.get(sock.data.code);
      if (!room) return;
      if (to === 'all') io.to('p:' + room.code).emit('msg', msg);
      else {
        const p = room.players.get(to);
        if (p && p.connected) io.to(p.socket).emit('msg', msg);
      }
    });

    sock.on('host:kick', id => {
      const room = sock.data && sock.data.role === 'host' && rooms.get(sock.data.code);
      const p = room && room.players.get(id);
      if (!p) return;
      clearTimeout(p.dropTimer);
      if (p.connected) io.to(p.socket).emit('kicked');
      room.players.delete(id);
      broadcast(room);
    });

    // ---- Phone / player
    sock.on('player:join', (d, cb) => {
      if (typeof cb !== 'function') return;
      d = d && typeof d === 'object' ? d : {};
      const code = String(d.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return cb({ error: 'Room not found. Check the code on the TV.' });
      let p = d.key && [...room.players.values()].find(x => x.key === d.key);
      const reconnect = !!p;
      if (p) {
        clearTimeout(p.dropTimer);
        if (p.connected && p.socket !== sock.id) io.to(p.socket).emit('kicked', 'Opened on another device');
        p.socket = sock.id; p.connected = true;
        if (cleanName(d.name)) p.name = cleanName(d.name);
      } else {
        const name = cleanName(d.name);
        if (!name) return cb({ error: 'Enter a name first.' });
        if (room.players.size >= MAX_PLAYERS) return cb({ error: `Room is full (${MAX_PLAYERS} players max).` });
        p = { id: 'p' + nextId++, key: rand(), name, char: null, connected: true, socket: sock.id };
        room.players.set(p.id, p);
      }
      sock.data = { role: 'player', code, id: p.id };
      sock.join('p:' + code);
      cb({ ok: true, id: p.id, key: p.key, name: p.name, char: p.char, hostOnline: !!room.hostSocket });
      if (room.hostSocket) io.to(room.hostSocket).emit('player:join', { id: p.id, reconnect });
      broadcast(room);
    });

    sock.on('player:char', (charId, cb) => {
      const room = sock.data && sock.data.role === 'player' && rooms.get(sock.data.code);
      const p = room && room.players.get(sock.data.id);
      if (!p || typeof cb !== 'function') return;
      const id = String(charId || '').slice(0, 20);
      if (!id) return cb({ error: 'Pick a character.' });
      const taken = [...room.players.values()].some(x => x !== p && x.char === id);
      if (taken) return cb({ error: 'Someone just took that one!' });
      p.char = id;
      cb({ ok: true });
      broadcast(room);
    });

    // Controller input -> host
    sock.on('in', data => {
      const s = sock.data;
      if (!s || s.role !== 'player') return;
      const room = rooms.get(s.code);
      if (room && room.hostSocket) io.to(room.hostSocket).emit('in', { id: s.id, d: data });
    });

    sock.on('disconnect', () => {
      const s = sock.data;
      if (!s) return;
      const room = rooms.get(s.code);
      if (!room) return;
      if (s.role === 'host' && room.hostSocket === sock.id) {
        room.hostSocket = null;
        io.to('p:' + room.code).emit('host:gone');
        room.killTimer = setTimeout(() => {
          io.to('p:' + room.code).emit('room:closed');
          for (const p of room.players.values()) clearTimeout(p.dropTimer);
          rooms.delete(room.code);
        }, hostGraceMs);
      } else if (s.role === 'player') {
        const p = room.players.get(s.id);
        if (!p || p.socket !== sock.id) return;
        p.connected = false;
        if (room.hostSocket) io.to(room.hostSocket).emit('player:leave', { id: p.id });
        // Free the slot if they don't come back in time
        p.dropTimer = setTimeout(() => { room.players.delete(p.id); broadcast(room); }, playerGraceMs);
        broadcast(room);
      }
    });
  });

  function close() {
    for (const room of rooms.values()) {
      clearTimeout(room.killTimer);
      for (const p of room.players.values()) clearTimeout(p.dropTimer);
    }
    io.close();
    return new Promise(resolve => server.close(() => resolve()));
  }

  return { app, server, io, rooms, port, publicUrl, close };
}

module.exports = { createApp, lanIP, MAX_PLAYERS };
