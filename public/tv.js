// TV host: lobby, game runner, results.
(() => {
  const $ = id => document.getElementById(id);
  const P = window.HuddlePlatform;
  const socket = P.connect();
  const S = {
    code: null, base: location.origin, players: new Map(), focus: 0,
    current: null, currentDef: null, lastDef: null, lastUI: {}, trophies: {}, mode: 'lobby',
    timers: [],
  };
  const games = Hub.games;

  // ----------------------------------------------------------- sound
  let AC = null;
  function sfx(kind) {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const presets = {
        tick: [880, 0.05, 'square', 0.04], pop: [660, 0.08, 'sine', 0.12], join: [523, 0.15, 'triangle', 0.15],
        good: [784, 0.18, 'triangle', 0.16], bad: [180, 0.25, 'sawtooth', 0.08], bump: [140, 0.09, 'square', 0.12],
        dash: [320, 0.08, 'sawtooth', 0.06], start: [440, 0.3, 'triangle', 0.15], win: [1046, 0.5, 'triangle', 0.16],
      };
      const [f, d, type, vol] = presets[kind] || presets.pop;
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = type; o.frequency.value = f;
      if (kind === 'win' || kind === 'good') o.frequency.exponentialRampToValueAtTime(f * 1.5, AC.currentTime + d);
      if (kind === 'bad') o.frequency.exponentialRampToValueAtTime(f * 0.6, AC.currentTime + d);
      g.gain.setValueAtTime(vol, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + d);
      o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + d + 0.02);
    } catch (e) { /* audio blocked until first key press */ }
  }

  function toast(text) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // ----------------------------------------------------------- messaging
  function send(id, msg) {
    if (msg && msg.ui) S.lastUI[id] = msg;
    socket.emit('host:send', { to: id, msg });
  }
  function sendAll(msg) {
    if (msg && msg.ui) for (const id of S.players.keys()) S.lastUI[id] = msg;
    socket.emit('host:send', { to: 'all', msg });
  }
  const readyPlayers = () => [...S.players.values()].filter(p => p.connected && p.char);
  const vipId = () => { const v = [...S.players.values()].find(p => p.vip); return v && v.id; };

  // ----------------------------------------------------------- connection
  socket.on('connect', () => {
    $('offline').classList.add('hidden');
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem('huddle-host') || 'null'); } catch (e) {}
    socket.emit('host:create', saved || {}, res => {
      S.code = res.code;
      try { sessionStorage.setItem('huddle-host', JSON.stringify({ code: res.code, hostKey: res.hostKey })); } catch (e) {}
      setPlayers(res.players);
      updateJoin();
      if (S.mode === 'lobby') sendMenu();
      else for (const p of S.players.values()) if (S.lastUI[p.id]) send(p.id, S.lastUI[p.id]);
    });
  });
  socket.on('disconnect', () => $('offline').classList.remove('hidden'));

  socket.on('players', list => {
    const before = new Set(S.players.keys());
    setPlayers(list);
    renderSlots(before);
    renderHero();
  });
  socket.on('player:join', ({ id, reconnect }) => {
    setTimeout(() => { // wait for the players list to land
      const p = S.players.get(id);
      if (!reconnect && p) { toast(`${p.name} joined`); sfx('join'); }
      if (S.mode === 'lobby') send(id, menuMsg());
      else if (S.mode === 'results') send(id, S.lastUI[id] || { ui: 'wait', text: 'Results on the TV 📺' });
      else if (S.lastUI[id] && S.current && S.current.players.has(id)) {
        send(id, S.lastUI[id]);
        S.current.inst.onRejoin && S.current.inst.onRejoin(id);
      } else send(id, { ui: 'wait', text: 'Game in progress', sub: "You'll join the next one. Pick a character meanwhile!", allowChar: true });
    }, 60);
  });
  socket.on('player:leave', ({ id }) => {
    const p = S.players.get(id);
    if (p && S.current && S.current.players.has(id)) {
      toast(`${p.name} disconnected`);
      S.current.inst.onLeave && S.current.inst.onLeave(id);
    }
  });
  socket.on('in', ({ id, d }) => {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'sys') return handleSys(id, d);
    if (S.current && S.current.players.has(id) && S.current.inst.onInput) {
      try { S.current.inst.onInput(id, d); } catch (e) { console.error(e); }
    }
  });

  function setPlayers(list) {
    const m = new Map();
    for (const p of list) m.set(p.id, Object.assign({}, p, { character: CHAR[p.char] || null }));
    S.players = m;
  }

  function handleSys(id, d) {
    const isVip = id === vipId();
    if (d.a === 'menu') send(id, S.mode === 'lobby' ? menuMsg() : (S.lastUI[id] || { ui: 'wait', text: '…' }));
    if (!isVip) return;
    if (d.a === 'pick' && S.mode === 'lobby') {
      const i = games.findIndex(g => g.id === d.game);
      if (i >= 0) { S.focus = i; renderTiles(); renderHero(); startGame(games[i]); }
    } else if (d.a === 'focus' && S.mode === 'lobby') {
      const i = games.findIndex(g => g.id === d.game);
      if (i >= 0) { S.focus = i; renderTiles(); renderHero(); }
    } else if (d.a === 'quit' && S.mode === 'game') endGame(null);
    else if (d.a === 'again' && S.mode === 'results' && S.lastDef) startGame(S.lastDef);
    else if (d.a === 'lobby' && S.mode !== 'lobby') showLobby();
  }

  // ----------------------------------------------------------- lobby
  function menuMsg() {
    return {
      ui: 'menu',
      games: games.map(g => ({ id: g.id, title: g.title, emoji: g.emoji, tagline: g.tagline, min: g.min, max: g.max, colors: g.colors, genre: g.genre })),
    };
  }
  function sendMenu() { sendAll(menuMsg()); }

  function updateJoin() {
    $('roomCode').textContent = S.code || '····';
    fetch(P.api('/api/info')).then(r => r.json()).then(info => {
      S.base = info.base;
      const link = `${S.base}/play?r=${S.code}`;
      $('qr').src = P.api('/api/qr?u=') + encodeURIComponent(link);
      $('joinUrl').textContent = S.base.replace(/^https?:\/\//, '') + '/play';
    }).catch(() => {});
  }

  function renderSlots(before) {
    const list = [...S.players.values()];
    $('pcount').textContent = `${list.filter(p => p.connected).length}/12`;
    let html = '';
    for (const p of list) {
      const c = p.character;
      const isNew = before && !before.has(p.id);
      html += `<div class="slot ${p.connected ? '' : 'off'} ${isNew ? 'new' : ''}">
        <div class="av" style="background:${c ? c.color : '#2a2a3a'}">${c ? c.emoji : '…'}</div>
        <div style="min-width:0"><div class="nm">${p.vip ? '👑 ' : ''}${esc(p.name)}</div>
        <div class="st">${!p.connected ? 'reconnecting…' : c ? c.name : 'choosing character…'}</div></div></div>`;
    }
    for (let i = list.length; i < Math.max(4, list.length + (list.length < 12 ? 1 : 0)) && i < 12; i++) html += `<div class="slot empty">waiting…</div>`;
    $('slots').innerHTML = html;
  }

  function renderTiles() {
    $('tiles').innerHTML = games.map((g, i) => `
      <div class="tile ${i === S.focus ? 'focus' : ''}" data-i="${i}" style="background:linear-gradient(135deg,${g.colors[0]},${g.colors[1]})">
        <div class="t-name">${esc(g.title)}</div><div class="t-emoji">${g.emoji}</div>
        <div class="t-sub">${g.min}–${g.max} players</div></div>`).join('');
  }
  $('tiles').addEventListener('click', e => {
    const t = e.target.closest('.tile'); if (!t) return;
    const i = +t.dataset.i;
    if (i === S.focus) startGame(games[i]); else { S.focus = i; renderTiles(); renderHero(); }
  });

  function renderHero() {
    const g = games[S.focus];
    $('heroBg').style.background = `radial-gradient(ellipse at 75% 45%, ${g.colors[0]}cc 0%, ${g.colors[1]}55 35%, transparent 70%)`;
    $('heroArt').textContent = g.emoji;
    $('heroGenre').textContent = g.genre;
    $('heroTitle').textContent = g.title;
    $('heroTag').textContent = g.tagline;
    $('heroMeta').innerHTML = `<span class="chip">👥 ${g.min}–${g.max} players</span><span class="chip">⏱ ${g.time}</span><span class="chip">📱 ${g.controls}</span>`;
    const n = readyPlayers().length;
    $('heroCta').innerHTML = n >= g.min
      ? `<div class="btn-play">▶ Play</div><div class="cta-note">${n} player${n > 1 ? 's' : ''} ready</div>`
      : `<div class="btn-play off">▶ Play</div><div class="cta-note">Needs ${g.min - n} more player${g.min - n > 1 ? 's' : ''} with a character</div>`;
  }

  function showLobby() {
    stopGame();
    S.mode = 'lobby';
    $('lobby').classList.remove('hidden'); $('game').classList.add('hidden'); $('results').classList.add('hidden');
    renderTiles(); renderHero(); renderSlots(); sendMenu();
  }

  // ----------------------------------------------------------- keyboard / TV remote
  document.addEventListener('keydown', e => {
    sfx('tick');
    const k = e.key, back = P.isBack(e), ok = P.isOk(e);
    if (back) e.preventDefault(); // stop webOS/Tizen/Android from navigating away
    if (S.mode === 'lobby') {
      if (k === 'ArrowRight') S.focus = (S.focus + 1) % games.length;
      else if (k === 'ArrowLeft') S.focus = (S.focus - 1 + games.length) % games.length;
      else if (ok) return startGame(games[S.focus]);
      else if (back) return P.exit();
      else return;
      renderTiles(); renderHero();
      if (vipId()) send(vipId(), { focus: games[S.focus].id });
    } else if (S.mode === 'game') {
      if (back) endGame(null);
    } else if (S.mode === 'results') {
      if (ok) startGame(S.lastDef);
      else if (back) showLobby();
    }
  });

  // ----------------------------------------------------------- game runner
  const cv = $('cv'), g2d = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = W * DPR; cv.height = H * DPR;
  }
  addEventListener('resize', resize); resize();

  function startGame(def) {
    const active = readyPlayers();
    if (active.length < def.min) {
      toast(`${def.title} needs at least ${def.min} players with a character`);
      if (vipId()) send(vipId(), { note: `Needs ${def.min}+ players` });
      return sfx('bad');
    }
    stopGame();
    S.mode = 'game'; S.lastDef = def; S.currentDef = def;
    $('lobby').classList.add('hidden'); $('results').classList.add('hidden'); $('game').classList.remove('hidden');
    const stage = $('stage'); stage.innerHTML = '';
    $('gameCorner').textContent = `${def.title.toUpperCase()} · ROOM ${S.code} · Back to quit`;
    g2d.setTransform(1, 0, 0, 1, 0, 0); g2d.clearRect(0, 0, cv.width, cv.height);
    const plist = active.slice(0, def.max).map(p => ({ id: p.id, name: p.name, char: p.char, character: p.character, color: p.character.color, emoji: p.character.emoji }));
    for (const p of active.slice(def.max)) send(p.id, { ui: 'wait', text: 'Room is full for this game', sub: 'Catch the next one!' });
    const ctx = {
      players: plist, stage, canvas: cv, g: g2d, sfx, toast,
      get W() { return W; }, get H() { return H; },
      send, sendAll: msg => plist.forEach(p => send(p.id, msg)),
      isConnected: id => { const p = S.players.get(id); return !!(p && p.connected); },
      after(sec, fn) { const t = setTimeout(fn, sec * 1000); S.timers.push(t); return t; },
      // Fit a fixed-size world into the screen (letterboxed). Call inside render.
      fit(ww, wh) {
        const s = Math.min(W / ww, H / wh);
        g2d.translate((W - ww * s) / 2, (H - wh * s) / 2); g2d.scale(s, s);
        return s;
      },
      end: results => endGame(results),
    };
    S.current = { def, ctx, players: new Set(plist.map(p => p.id)), inst: def.create(ctx) };
    sfx('start');
    let last = performance.now();
    const loop = now => {
      if (!S.current) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const inst = S.current.inst;
      try {
        inst.update && inst.update(dt);
        if (!S.current) return;
        if (inst.render) { g2d.setTransform(DPR, 0, 0, DPR, 0, 0); inst.render(g2d, W, H); }
      } catch (e) { console.error(e); }
      S.raf = requestAnimationFrame(loop);
    };
    S.raf = requestAnimationFrame(loop);
  }

  function stopGame() {
    if (S.current && S.current.inst.destroy) try { S.current.inst.destroy(); } catch (e) {}
    S.current = null;
    cancelAnimationFrame(S.raf);
    S.timers.forEach(clearTimeout); S.timers = [];
    $('stage').innerHTML = '';
    g2d.setTransform(1, 0, 0, 1, 0, 0); g2d.clearRect(0, 0, cv.width, cv.height);
  }

  // results: [{id, score, note?}] — null means quit to lobby
  function endGame(results) {
    const cur = S.current;
    if (!cur) return;
    stopGame();
    if (!results) { toast('Game ended'); return showLobby(); }
    S.mode = 'results';
    const ranked = results.slice().sort((a, b) => b.score - a.score);
    let rank = 0, prev = null;
    ranked.forEach((r, i) => { if (r.score !== prev) rank = i + 1; r.rank = rank; prev = r.score; });
    ranked.filter(r => r.rank === 1 && r.score > 0).forEach(r => { S.trophies[r.id] = (S.trophies[r.id] || 0) + 1; });
    const info = id => cur.ctx.players.find(p => p.id === id);
    const top = ranked.slice(0, 3);
    const order = [top[1], top[0], top[2]];
    const pod = order.map((r, i) => {
      if (!r) return '<div class="pod"></div>';
      const p = info(r.id); const cls = ['p2', 'p1', 'p3'][i];
      return `<div class="pod ${cls}"><div class="avatar" style="background:${p.color};animation-delay:${[0.3, 0.6, 0][i]}s">${p.emoji}</div>
        <div class="nm">${esc(p.name)}</div><div class="sc">${r.score} pts</div><div class="block">${r.rank}</div></div>`;
    }).join('');
    const rest = ranked.map(r => {
      const p = info(r.id);
      return `<div class="res-item"><b>#${r.rank}</b> ${p.emoji} ${esc(p.name)} · ${r.score}${S.trophies[r.id] ? ` <span class="trophy">🏆×${S.trophies[r.id]}</span>` : ''}</div>`;
    }).join('');
    const vip = vipId();
    const vipName = vip && S.players.get(vip) ? S.players.get(vip).name : 'the 👑 player';
    $('results').innerHTML = `<div class="res-title">Final results</div><div class="res-game">${cur.def.emoji} ${esc(cur.def.title)}</div>
      <div class="podium">${pod}</div><div class="res-list">${rest}</div>
      <div class="res-hint"><b>OK</b> play again · <b>Back</b> to lobby · or ${esc(vipName)} chooses on their phone</div>`;
    $('game').classList.add('hidden'); $('results').classList.remove('hidden');
    sfx('win');
    for (const r of ranked) {
      send(r.id, { ui: 'result', rank: r.rank, of: ranked.length, score: r.score, game: cur.def.title, vibrate: r.rank === 1 ? [80, 60, 80, 60, 200] : 120 });
    }
    for (const p of S.players.values()) if (!cur.players.has(p.id)) send(p.id, { ui: 'wait', text: 'Results on the TV 📺', sub: 'You can join the next game.' });
  }

  // ----------------------------------------------------------- boot
  renderTiles(); renderHero(); renderSlots();
  window.__huddle = S; // handy for debugging
})();
