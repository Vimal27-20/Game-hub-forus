// TV shell: main menu, remote navigation, Back trap, pause, results, session standings,
// settings. Games run inside the runner (runner.js).
// Spec: specs/003-party-pack-v2/design.md (Shell).
(() => {
  const $ = id => document.getElementById(id);
  const P = window.HuddlePlatform, R = window.HuddleRunner;
  const socket = P.connect();
  const games = Hub.games;
  const CATS = [
    { id: 'action', name: 'Action', sub: 'Physics & reflexes' }, { id: 'brains', name: 'Brains', sub: 'Trivia & numbers' },
    { id: 'social', name: 'Social', sub: 'Bluff & deduce' }, { id: 'creative', name: 'Creative', sub: 'Draw & guess' },
  ];
  const NEW = ['golf', 'trails', 'lava', 'quickdraw', 'fakeout', 'closecall', 'wordgrid'];
  const ROOM_OPTS = {
    length: { label: 'Game length', options: [['quick', 'Quick'], ['standard', 'Standard'], ['long', 'Long']] },
    difficulty: { label: 'Difficulty', options: [['chill', 'Chill'], ['normal', 'Normal'], ['wild', 'Wild']] },
    sound: { label: 'Sound', options: [[true, 'On'], [false, 'Off']] },
    volume: { label: 'Volume', options: [[0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']] },
    vibrate: { label: 'Phone vibration', options: [[true, 'On'], [false, 'Off']] },
  };
  const DEFAULT_ROOM = { length: 'standard', difficulty: 'normal', sound: true, volume: 0.75, vibrate: true };

  // ----------------------------------------------------------- persistence (R2.5, R4.4)
  const store = name => { try { return window[name]; } catch (e) { return null; } };
  const load = (s, key) => { try { return JSON.parse(s.getItem(key)) || {}; } catch (e) { return {}; } };
  const save = (s, key, v) => { try { s.setItem(key, JSON.stringify(v)); } catch (e) {} };
  const local = store('localStorage'), sess = store('sessionStorage');
  const prefs = load(local, 'huddle-settings');
  prefs.room = Object.assign({}, DEFAULT_ROOM, prefs.room);
  Object.keys(ROOM_OPTS).forEach(k => { if (!ROOM_OPTS[k].options.some(o => o[0] === prefs.room[k])) prefs.room[k] = DEFAULT_ROOM[k]; });
  prefs.games = prefs.games || {};
  const session = load(sess, 'huddle-session');
  session.standings = session.standings || {};
  session.played = session.played || [];
  session.known = session.known || {};
  const memory = R.createMemory(session.memory || {});
  function persist() { session.memory = memory.data; save(local, 'huddle-settings', prefs); save(sess, 'huddle-session', session); }

  const S = {
    code: null, base: location.origin, players: new Map(), mode: 'menu', tab: 'games', focusGame: 0,
    overlay: null, setupDef: null, lastDef: null, resultMsg: {}, strip: {},
  };
  const gameSettings = def => R.resolveSettings(def, prefs.room, prefs.games[def.id]);

  // ----------------------------------------------------------- sound
  let AC = null;
  function sfx(kind) {
    if (!prefs.room.sound) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      const presets = {
        tick: [880, 0.05, 'square', 0.04], pop: [660, 0.08, 'sine', 0.12], join: [523, 0.15, 'triangle', 0.15],
        good: [784, 0.18, 'triangle', 0.16], bad: [180, 0.25, 'sawtooth', 0.08], bump: [140, 0.09, 'square', 0.12],
        dash: [320, 0.08, 'sawtooth', 0.06], start: [440, 0.3, 'triangle', 0.15], win: [1046, 0.5, 'triangle', 0.16],
      };
      const p = presets[kind] || presets.pop, f = p[0], d = p[1], vol = p[3] * prefs.room.volume;
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = p[2]; o.frequency.value = f;
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
    if (msg && msg.vibrate && !prefs.room.vibrate) { msg = Object.assign({}, msg); delete msg.vibrate; }
    socket.emit('host:send', { to: id, msg });
  }
  const connectedPlayers = () => [...S.players.values()].filter(p => p.connected);
  const readyPlayers = () => connectedPlayers().filter(p => p.char);
  const vipId = () => { const v = [...S.players.values()].find(p => p.vip); return v && v.id; };
  const who = id => S.players.get(id) || session.known[id] || { name: '?', emoji: '❔', color: '#333' };
  const waitNext = () => ({ ui: 'wait', text: 'Game in progress', sub: 'You\'ll join the next one. Pick a character meanwhile!', allowChar: true });

  // ----------------------------------------------------------- runner
  const cv = $('cv'), g2d = cv.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  function resize() { DPR = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; }
  addEventListener('resize', resize); resize();

  const runner = R.create({
    stage: $('stage'), canvas: cv, g: g2d, size: () => ({ W, H }), memory, send, sfx, toast,
    isConnected: id => { const p = S.players.get(id); return !!(p && p.connected); },
    onIntro: showIntro,
    onBegin: () => $('intro').classList.add('hidden'),
    onScore: (id, delta) => { S.strip[id] = (S.strip[id] || 0) + delta; },
    onRoundOver: showBoard,
    onRoundEnd: () => $('board').classList.add('hidden'),
    onEnd: showResults,
    onError: e => console.error(e),
  });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (S.mode === 'game') {
      runner.frame(dt);
      if (S.mode === 'game') { g2d.setTransform(DPR, 0, 0, DPR, 0, 0); runner.render(g2d, W, H); }
      if (Object.keys(S.strip).length) renderStrip();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ----------------------------------------------------------- connection
  socket.on('connect', () => {
    $('offline').classList.add('hidden');
    const saved = load(sess, 'huddle-host');
    socket.emit('host:create', saved, res => {
      S.code = res.code;
      save(sess, 'huddle-host', { code: res.code, hostKey: res.hostKey });
      setPlayers(res.players);
      updateJoin(); renderSlots();
      if (S.mode === 'menu') { renderHero(); sendMenu(); }
      else for (const p of S.players.values()) send(p.id, uiFor(p.id));
    });
  });
  socket.on('disconnect', () => $('offline').classList.remove('hidden'));
  socket.on('players', list => {
    const before = new Set(S.players.keys());
    setPlayers(list);
    renderSlots(before);
    if (S.mode === 'menu') renderHero();
  });
  socket.on('player:join', ({ id, reconnect }) => {
    setTimeout(() => { // wait for the players list to land
      const p = S.players.get(id);
      if (!reconnect && p) { toast(`${p.name} joined`); sfx('join'); }
      if (S.mode === 'game' && runner.has(id)) { runner.rejoin(id); if (reconnect && p) toast(`${p.name} is back`); }
      else send(id, uiFor(id));
    }, 60);
  });
  socket.on('player:leave', ({ id }) => {
    const p = S.players.get(id);
    if (S.mode === 'game' && runner.has(id)) { if (p) toast(`${p.name} disconnected`); runner.leave(id); }
  });
  socket.on('in', ({ id, d }) => {
    if (!d || typeof d !== 'object') return;
    if (d.t === 'sys') return handleSys(id, d);
    if (S.mode === 'game') runner.input(id, d);
  });

  function setPlayers(list) {
    const m = new Map();
    for (const p of list) {
      const c = CHAR[p.char] || null;
      m.set(p.id, Object.assign({}, p, { character: c, color: c ? c.color : '#333', emoji: c ? c.emoji : '❔' }));
      if (c) session.known[p.id] = { name: p.name, emoji: c.emoji, color: c.color };
    }
    S.players = m;
  }

  function uiFor(id) {
    if (S.mode === 'game') {
      if (!runner.has(id)) return runner.mode === 'paused' ? { ui: 'paused' } : waitNext();
      return runner.mode === 'paused' ? { ui: 'paused' } : runner.lastUI(id) || { ui: 'wait', text: 'Look at the TV 📺' };
    }
    if (S.mode === 'results') return S.resultMsg[id] || { ui: 'wait', text: 'Results on the TV 📺', sub: 'You can join the next game.' };
    return menuMsg();
  }

  function handleSys(id, d) {
    if (d.a === 'menu') return send(id, uiFor(id));
    if (id !== vipId()) return;
    const def = d.game && games.find(g => g.id === d.game);
    switch (d.a) {
      case 'pick': if (def && S.mode === 'menu') startGame(def); break;
      case 'focus': if (def && S.mode === 'menu') { S.focusGame = games.indexOf(def); if (!S.overlay) buildNav(); renderHero(); } break;
      case 'setting': if (def) setGameSetting(def, d.key, d.value); break;
      case 'room': setRoom(d.key, d.value); break;
      case 'pause': if (S.mode === 'game' && !S.overlay) pause(); break;
      case 'resume': if (S.overlay === 'pause') resume(); break;
      case 'restart': if (S.mode === 'game') restart(); break;
      case 'quit': if (S.mode === 'game') quitToMenu(); break;
      case 'skip': if (S.mode === 'game' && !S.overlay) runner.skip(); break;
      case 'again': if (S.mode === 'results' && S.lastDef) startGame(S.lastDef); break;
      case 'next': if (S.mode === 'results') startGame(S.nextDef); break;
      case 'lobby': if (S.mode !== 'menu') showMenu(); break;
    }
  }

  // ----------------------------------------------------------- settings
  const optLabel = (opts, v) => { const o = opts.find(x => x[0] === v || x.v === v); return o ? (o[1] || o.label) : String(v); };
  function setRoom(key, value) {
    const spec = ROOM_OPTS[key];
    if (!spec || !spec.options.some(o => o[0] === value)) return;
    prefs.room[key] = value; persist();
    if (key === 'sound' && value) sfx('pop');
    refreshSettingsViews();
  }
  function cycleRoom(key, dir) {
    const opts = ROOM_OPTS[key].options, i = opts.findIndex(o => o[0] === prefs.room[key]);
    setRoom(key, opts[(i + dir + opts.length) % opts.length][0]);
  }
  function setGameSetting(def, key, value) {
    const s = (def.settings || []).find(x => x.id === key);
    if (!s || !R.optionList(s).some(o => o.v === value)) return;
    prefs.games[def.id] = Object.assign({}, prefs.games[def.id], { [key]: value }); persist();
    refreshSettingsViews();
  }
  function cycleGame(def, key, dir) {
    const s = def.settings.find(x => x.id === key), opts = R.optionList(s), cur = gameSettings(def)[key];
    const i = opts.findIndex(o => o.v === cur);
    setGameSetting(def, key, opts[(i + dir + opts.length) % opts.length].v);
  }
  // Re-render whatever shows settings, then rebind navigation to the new elements (same row).
  function refreshSettingsViews() {
    const r = nav.r, c = nav.c;
    if (S.mode === 'menu') { renderRoomSettings(); if (S.overlay === 'setup') renderSetup(); sendMenu(); }
    if (S.overlay === 'pause') renderPause();
    if (S.overlay || (S.mode === 'menu' && S.tab === 'settings')) buildNav(r, c);
  }

  // ----------------------------------------------------------- menu (R3.3, R3.4)
  function menuMsg() {
    return {
      ui: 'menu', focus: games[S.focusGame].id, room: prefs.room,
      roomOptions: Object.keys(ROOM_OPTS).map(k => ({ id: k, label: ROOM_OPTS[k].label, options: ROOM_OPTS[k].options.map(o => ({ v: o[0], label: o[1] })) })),
      cats: CATS,
      games: games.map(g => {
        const cur = gameSettings(g);
        return {
          id: g.id, title: g.title, emoji: g.emoji, tagline: g.tagline, genre: g.genre, category: g.category, how: g.how,
          min: g.min, max: g.max, time: g.time, controls: g.controls, colors: g.colors, played: session.played.indexOf(g.id) >= 0,
          settings: (g.settings || []).map(s => ({ id: s.id, label: s.label, options: R.optionList(s), value: cur[s.id] })),
        };
      }),
    };
  }
  function sendMenu() { for (const p of S.players.values()) send(p.id, menuMsg()); }

  function updateJoin() {
    $('roomCode').textContent = S.code || '····';
    fetch(P.api('/api/info')).then(r => r.json()).then(info => {
      S.base = info.base;
      const link = `${S.base}/${S.code}`;
      $('qr').src = P.api('/api/qr?u=') + encodeURIComponent(link);
      $('joinUrl').textContent = link.replace(/^https?:\/\//, '');
    }).catch(() => {});
  }

  const pts = id => (session.standings[id] ? session.standings[id].pts : 0);
  function renderSlots(before) {
    const list = [...S.players.values()].sort((a, b) => pts(b.id) - pts(a.id));
    $('pcount').textContent = `${list.filter(p => p.connected).length}/12`;
    let html = '';
    for (const p of list) {
      const c = p.character, isNew = before && !before.has(p.id), st = session.standings[p.id];
      html += `<div class="slot ${p.connected ? '' : 'off'} ${isNew ? 'new' : ''}">
        <div class="av" style="background:${c ? c.color : '#2a2a3a'}">${c ? c.emoji : '…'}</div>
        <div style="min-width:0"><div class="nm">${p.vip ? '👑 ' : ''}${esc(p.name)}</div>
        <div class="st">${!p.connected ? 'reconnecting…' : c ? c.name : 'choosing character…'}</div></div>
        ${st && st.pts ? `<div class="pts">🏆${st.pts}</div>` : ''}</div>`;
    }
    for (let i = list.length; i < Math.max(4, list.length + (list.length < 12 ? 1 : 0)) && i < 12; i++) html += '<div class="slot empty">waiting…</div>';
    $('slots').innerHTML = html;
  }

  function renderTabs() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
    ['games', 'settings', 'help'].forEach(t => $('tab-' + t).classList.toggle('hidden', t !== S.tab));
  }
  function renderRows() {
    $('rows').innerHTML = `<div id="rowsInner">${CATS.map(c => {
      const list = games.filter(g => g.category === c.id);
      if (!list.length) return '';
      return `<div class="row" data-cat="${c.id}"><div class="row-title">${c.name} <small>${c.sub} · ${list.length} game${list.length > 1 ? 's' : ''}</small></div><button class="row-arrow l" aria-label="Scroll left">‹</button><button class="row-arrow r" aria-label="Scroll right">›</button><div class="tiles">${list.map(g => {
        const played = session.played.indexOf(g.id) >= 0;
        return `<div class="tile" data-id="${g.id}" style="background:linear-gradient(135deg,${g.colors[0]},${g.colors[1]})">
          <div class="t-name">${esc(g.title)}</div><div class="t-emoji">${g.emoji}</div><div class="t-sub">${g.min}–${g.max} players</div>
          ${played ? '<div class="t-done">✓ played</div>' : NEW.indexOf(g.id) >= 0 ? '<div class="t-new">NEW</div>' : ''}</div>`;
      }).join('')}</div></div>`;
    }).join('')}</div>`;
    // pointer remotes / mouse: ‹ › scroll a row by most of its width (R3.2)
    $('rows').querySelectorAll('.row-arrow').forEach(b => {
      b.onclick = e => { e.stopPropagation(); const t = b.parentElement.querySelector('.tiles'); t.scrollBy({ left: (b.classList.contains('l') ? -1 : 1) * t.clientWidth * 0.8, behavior: 'smooth' }); };
    });
  }
  function renderHero() {
    const g = games[S.focusGame];
    $('heroBg').style.background = `radial-gradient(ellipse at 75% 45%, ${g.colors[0]}cc 0%, ${g.colors[1]}55 35%, transparent 70%)`;
    $('heroArt').textContent = g.emoji;
    $('heroGenre').textContent = g.genre;
    $('heroTitle').textContent = g.title;
    $('heroTag').textContent = g.tagline;
    $('heroMeta').innerHTML = `<span class="chip">👥 ${g.min}–${g.max} players</span><span class="chip">⏱ ${esc(g.time)}</span><span class="chip">📱 ${esc(g.controls)}</span>`;
    const n = readyPlayers().length;
    $('heroCta').innerHTML = n >= g.min
      ? `<div class="btn-play">▶ OK to set up</div><div class="cta-note">${n} player${n > 1 ? 's' : ''} ready</div>`
      : `<div class="btn-play off">▶ Play</div><div class="cta-note">Needs ${g.min - n} more player${g.min - n > 1 ? 's' : ''} with a character</div>`;
  }
  function setRow(label, value, extra) {
    return `<div class="setrow"><span>${label}</span><span class="val"><span class="arr" data-dir="-1">◀</span><b>${value}</b><span class="arr" data-dir="1">▶</span></span>${extra || ''}</div>`;
  }
  function renderRoomSettings() {
    $('roomSettings').innerHTML = Object.keys(ROOM_OPTS).map(k => setRow(ROOM_OPTS[k].label, optLabel(ROOM_OPTS[k].options, prefs.room[k]))).join('')
      + '<button class="btn danger" id="resetStand">Reset tonight\'s standings</button>';
  }
  function renderHelp() {
    $('help').innerHTML = `<h2>How HUDDLE works</h2>
      <div class="card"><b>📺 The TV is the game</b><p>Everyone watches this screen. Pick games with the remote or let the 👑 player pick on their phone.</p></div>
      <div class="card"><b>📱 Phones are controllers</b><p>Scan the QR code or open the short link. Pick a name and a character. No app needed.</p></div>
      <div class="card"><b>🔁 Dropped out?</b><p>Just open the link again on the same phone. You go straight back into the game with your points.</p></div>
      <div class="card"><b>🏆 Tonight's standings</b><p>Every game gives party points: 1st 5 · 2nd 3 · 3rd 2 · everyone else 1.</p></div>
      <div class="keys"><span><kbd>← →</kbd> browse</span><span><kbd>↑ ↓</kbd> rows</span><span><kbd>OK</kbd> select</span><span><kbd>Back</kbd> pause / go back</span></div>
      ${games.map(g => `<div class="card"><b>${g.emoji} ${esc(g.title)}</b><ul>${g.how.map(h => `<li>${esc(h)}</li>`).join('')}</ul></div>`).join('')}`;
  }

  function switchTab(tab) {
    S.tab = tab; renderTabs();
    buildNav(0, ['games', 'settings', 'help'].indexOf(tab));
  }

  // ----------------------------------------------------------- setup sheet (R4.2)
  function openSetup(def) {
    S.overlay = 'setup'; S.setupDef = def;
    $('setup').classList.remove('hidden');
    renderSetup();
    buildNav(def.settings.length, 0); // Start is focused: OK, OK starts with the defaults
    if (vipId()) send(vipId(), { focus: def.id });
  }
  function renderSetup() {
    const def = S.setupDef, cur = gameSettings(def), n = readyPlayers().length;
    $('setupSheet').className = 'sheet setup-sheet';
    $('setupSheet').innerHTML = `<div class="setup-head"><div class="e">${def.emoji}</div><div><div class="g">${esc(def.genre)}</div><h2>${esc(def.title)}</h2></div></div>
      <div class="how">${def.how.map(h => `<div>${esc(h)}</div>`).join('')}</div>
      <div class="setlist">${def.settings.map(s => setRow(s.label, esc(optLabel(R.optionList(s), cur[s.id])))).join('')}</div>
      <button class="btn" id="setupStart">${n >= def.min ? '▶ Start' : `Needs ${def.min - n} more player${def.min - n > 1 ? 's' : ''}`}</button>
      <div class="hint"><b>◀ ▶</b> change · <b>OK</b> start · <b>Back</b> close · Length &amp; difficulty: ${optLabel(ROOM_OPTS.length.options, prefs.room.length)} · ${optLabel(ROOM_OPTS.difficulty.options, prefs.room.difficulty)}</div>`;
  }
  function closeSetup() { S.overlay = null; $('setup').classList.add('hidden'); buildNav(); }

  // ----------------------------------------------------------- focus navigation (R3.3)
  // Each screen builds rows of items { el, ok?, left?, right?, focus? }. Arrows move between
  // rows and within a row; an item's left/right handlers override horizontal moves.
  const nav = { rows: [], r: 0, c: 0, cols: {} };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cur = () => { const row = nav.rows[nav.r]; return row ? row[clamp(nav.c, 0, row.length - 1)] : null; };
  function paintFocus() {
    document.querySelectorAll('.focus').forEach(e => e.classList.remove('focus'));
    const it = cur();
    if (it && it.el) { it.el.classList.add('focus'); if (it.focus) it.focus(); }
  }
  function setNav(rows, r, c) {
    nav.rows = rows.filter(x => x.length);
    nav.r = clamp(r || 0, 0, Math.max(0, nav.rows.length - 1));
    nav.c = c || 0;
    nav.rows.forEach(row => row.forEach(it => {
      if (!it.el) return;
      it.el.onclick = e => {
        const dir = e.target && e.target.dataset && e.target.dataset.dir;
        nav.r = nav.rows.indexOf(nav.rows.find(rw => rw.indexOf(it) >= 0)); nav.c = nav.rows[nav.r].indexOf(it); paintFocus();
        if (dir && (dir < 0 ? it.left : it.right)) (+dir < 0 ? it.left : it.right)();
        else if (it.ok) it.ok();
      };
    }));
    paintFocus();
  }
  function move(dr, dc) {
    const it = cur();
    if (dc && it && (dc < 0 ? it.left : it.right)) { (dc < 0 ? it.left : it.right)(); sfx('tick'); return; }
    if (dc) nav.c = clamp(nav.c + dc, 0, (nav.rows[nav.r] || []).length - 1);
    if (dr) { nav.cols[nav.r] = nav.c; nav.r = clamp(nav.r + dr, 0, nav.rows.length - 1); nav.c = nav.cols[nav.r] != null ? nav.cols[nav.r] : Math.min(nav.c, nav.rows[nav.r].length - 1); }
    paintFocus(); sfx('tick');
  }
  function buildNav(r, c) {
    nav.cols = {};
    if (S.overlay === 'setup') {
      const def = S.setupDef;
      const rows = [...$('setupSheet').querySelectorAll('.setrow')].map((el, i) => [{ el, left: () => cycleGame(def, def.settings[i].id, -1), right: () => cycleGame(def, def.settings[i].id, 1) }]);
      rows.push([{ el: $('setupStart'), ok: () => startGame(def) }]);
      return setNav(rows, r == null ? rows.length - 1 : r, 0);
    }
    if (S.overlay === 'pause') {
      const sheet = $('pauseSheet'), btn = id => sheet.querySelector('#' + id), sets = [...sheet.querySelectorAll('.setrow')];
      return setNav([[{ el: btn('pResume'), ok: resume }], [{ el: btn('pRestart'), ok: restart }],
        [{ el: sets[0], left: () => cycleRoom('sound', -1), right: () => cycleRoom('sound', 1) }],
        [{ el: sets[1], left: () => cycleRoom('vibrate', -1), right: () => cycleRoom('vibrate', 1) }],
        [{ el: btn('pQuit'), ok: quitToMenu }]], r || 0, 0);
    }
    if (S.mode === 'results') {
      const b = id => ({ el: $(id), ok: { rAgain: () => startGame(S.lastDef), rNext: () => startGame(S.nextDef), rMenu: showMenu }[id] });
      return setNav([[b('rAgain'), b('rNext'), b('rMenu')]], 0, c || 0);
    }
    if (S.mode !== 'menu') return setNav([], 0, 0);
    const tabs = [...document.querySelectorAll('.tab-btn')].map(el => ({ el, ok: () => switchTab(el.dataset.tab) }));
    if (S.tab === 'games') {
      const rows = [tabs];
      document.querySelectorAll('#rows .row').forEach(rowEl => {
        rows.push([...rowEl.querySelectorAll('.tile')].map(el => {
          const def = games.find(g => g.id === el.dataset.id);
          return { el, ok: () => openSetup(def), focus: () => { S.focusGame = games.indexOf(def); renderHero(); scrollRows(rowEl, el); } };
        }));
      });
      if (r == null) { // land on the focused game's tile
        const g = games[S.focusGame];
        r = 1 + CATS.filter(cat => games.some(x => x.category === cat.id)).findIndex(cat => cat.id === g.category);
        c = games.filter(x => x.category === g.category).indexOf(g);
      }
      return setNav(rows, r, c);
    }
    if (S.tab === 'settings') {
      const keys = Object.keys(ROOM_OPTS);
      const rows = [tabs].concat([...document.querySelectorAll('#roomSettings .setrow')].map((el, i) => [{ el, left: () => cycleRoom(keys[i], -1), right: () => cycleRoom(keys[i], 1) }]));
      rows.push([{ el: $('resetStand'), ok: () => { session.standings = {}; persist(); renderSlots(); toast('Standings reset'); } }]);
      return setNav(rows, r == null ? 1 : r, c || 0);
    }
    return setNav([tabs], 0, 2);
  }
  // Netflix-style: the focused row slides up under the billboard; the focused tile scrolls into view (R3.1).
  function scrollRows(rowEl, tile) {
    const rows = $('rows');
    rows.scrollTo({ top: Math.max(0, rowEl.offsetTop - 4), behavior: 'smooth' });
    if (!tile) return;
    const strip = tile.parentElement, pad = tile.offsetWidth * 0.6;
    const left = tile.offsetLeft, right = left + tile.offsetWidth, view = strip.scrollLeft, w = strip.clientWidth;
    if (left - pad < view) strip.scrollTo({ left: Math.max(0, left - pad), behavior: 'smooth' });
    else if (right + pad > view + w) strip.scrollTo({ left: right + pad - w, behavior: 'smooth' });
  }

  // ----------------------------------------------------------- Back + keys (R1.1, R1.3, R1.5)
  let lastBack = 0;
  function back() {
    const now = Date.now();
    if (now - lastBack < 350) return; // some TV browsers fire both keydown and popstate
    lastBack = now;
    if (S.overlay === 'setup') return closeSetup();
    if (S.overlay === 'pause') return quitToMenu();
    if (S.mode === 'game') return pause();
    if (S.mode === 'results') return showMenu();
    if (S.mode === 'menu') {
      if (S.tab !== 'games') return switchTab('games');
      if (P.name !== 'web') P.exit(); // packaged store apps leave; the website stays put
    }
  }
  try { history.replaceState({ h: 0 }, ''); history.pushState({ h: 1 }, ''); } catch (e) {}
  addEventListener('popstate', () => { try { history.pushState({ h: 1 }, ''); } catch (e) {} back(); });

  document.addEventListener('keydown', e => {
    if (P.isBack(e)) { e.preventDefault(); return back(); }
    const k = e.key;
    if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0); }
    else if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
    else if (k === 'ArrowRight') { e.preventDefault(); move(0, 1); }
    else if (P.isOk(e)) {
      e.preventDefault();
      if (S.mode === 'game' && !S.overlay) { if (runner.skip()) sfx('pop'); return; }
      const it = cur(); if (it && it.ok) { sfx('pop'); it.ok(); }
    }
  });

  // ----------------------------------------------------------- game flow
  function show(id) { ['menu', 'game', 'results'].forEach(x => $(x).classList.toggle('hidden', x !== id)); }
  function startGame(def) {
    if (!def) return;
    const active = readyPlayers();
    if (active.length < def.min) {
      toast(`${def.title} needs at least ${def.min} player${def.min > 1 ? 's' : ''} with a character`);
      if (vipId()) send(vipId(), { note: `Needs ${def.min}+ players` });
      return sfx('bad');
    }
    S.overlay = null; ['setup', 'pause'].forEach(x => $(x).classList.add('hidden'));
    $('board').classList.add('hidden');
    S.mode = 'game'; S.lastDef = def; S.strip = {}; S.resultMsg = {};
    show('game');
    $('gameCorner').textContent = `${def.title.toUpperCase()} · ROOM ${S.code} · BACK = PAUSE`;
    g2d.setTransform(1, 0, 0, 1, 0, 0); g2d.clearRect(0, 0, cv.width, cv.height);
    const plist = active.slice(0, def.max).map(p => ({ id: p.id, name: p.name, char: p.char, character: p.character, color: p.character.color, emoji: p.character.emoji }));
    for (const p of active.slice(def.max)) send(p.id, { ui: 'wait', text: 'This game is full', sub: 'Catch the next one!', allowChar: true });
    for (const p of connectedPlayers()) if (!p.char) send(p.id, waitNext());
    runner.start(def, plist, { room: { length: prefs.room.length, difficulty: prefs.room.difficulty }, settings: prefs.games[def.id] });
    renderStrip(true);
    buildNav();
    persist();
  }
  function showIntro(info) {
    const def = info.def, chips = (def.settings || []).map(s => `<span class="chip">${esc(s.label)}: <b>${esc(optLabel(R.optionList(s), info.settings[s.id]))}</b></span>`);
    chips.push(`<span class="chip">Difficulty: <b>${optLabel(ROOM_OPTS.difficulty.options, info.room.difficulty)}</b></span>`);
    $('introSheet').innerHTML = `<div class="e">${def.emoji}</div><h2>${esc(def.title)}</h2>
      <div class="how">${def.how.map(h => `<div>${esc(h)}</div>`).join('')}</div>
      <div class="chips">${chips.join('')}</div><div class="hint"><b>OK</b> to start now</div>`;
    $('intro').classList.remove('hidden');
  }
  function showBoard(info) {
    const sc = info.scores, ids = Object.keys(sc).sort((a, b) => sc[b] - sc[a]), max = Math.max(1, sc[ids[0]] || 0);
    $('boardSheet').innerHTML = `<h2>${esc(info.title)}</h2>${ids.slice(0, 10).map((id, i) => {
      const p = who(id);
      return `<div class="brow"><div class="rk">${i + 1}</div><div class="av" style="background:${p.color}">${p.emoji}</div><div class="nm">${esc(p.name)}</div>
        <div class="bar"><div style="width:${Math.max(0, sc[id]) / max * 100}%;background:linear-gradient(90deg,${p.color},#fff3)"></div></div>
        <div class="tot">${sc[id]}</div><div class="gain">${info.gains[id] ? (info.gains[id] > 0 ? '+' : '') + info.gains[id] : ''}</div></div>`;
    }).join('')}<div class="hint"><b>OK</b> next · or the 👑 player taps Next</div>`;
    $('board').classList.remove('hidden');
    sfx('good');
  }
  // Live score strip (R5.1): rebuilt once per frame when scores change.
  function renderStrip(reset) {
    const sc = runner.scores, bumps = reset ? {} : S.strip;
    S.strip = {};
    const ids = Object.keys(sc).sort((a, b) => sc[b] - sc[a]).slice(0, 8);
    $('strip').innerHTML = ids.map((id, i) => {
      const p = who(id), d = bumps[id];
      return `<div class="sc ${i === 0 && sc[id] > 0 ? 'lead' : ''} ${d ? 'bump' : ''}"><div class="av" style="background:${p.color}">${p.emoji}</div><span class="n">${esc(p.name)}</span>${sc[id]}${d ? `<span class="plus ${d < 0 ? 'neg' : ''}">${d > 0 ? '+' : ''}${d}</span>` : ''}</div>`;
    }).join('');
  }

  function pause() {
    if (!runner.pause()) return;
    S.overlay = 'pause';
    renderPause(); $('pause').classList.remove('hidden');
    for (const p of connectedPlayers()) send(p.id, { ui: 'paused' });
    buildNav(0); sfx('pop');
  }
  function renderPause() {
    $('pauseSheet').innerHTML = `<h2>⏸ Paused</h2><div class="sub">${esc(S.lastDef ? S.lastDef.title : '')} · scores are kept</div>
      <button class="btn" id="pResume">▶ Resume</button><button class="btn ghost" id="pRestart">↻ Restart game</button>
      <div class="setlist">${setRow('Sound', optLabel(ROOM_OPTS.sound.options, prefs.room.sound))}${setRow('Phone vibration', optLabel(ROOM_OPTS.vibrate.options, prefs.room.vibrate))}</div>
      <button class="btn danger" id="pQuit">✕ Quit to menu</button><div class="hint"><b>Back</b> again to quit</div>`;
  }
  function resume() {
    if (!runner.resume()) return;
    S.overlay = null; $('pause').classList.add('hidden');
    for (const p of connectedPlayers()) if (!runner.has(p.id)) send(p.id, waitNext());
    buildNav(); sfx('start');
  }
  function restart() { const def = S.lastDef; runner.stop(); startGame(def); }
  function quitToMenu() { runner.stop(); toast('Game ended'); showMenu(); }

  // ----------------------------------------------------------- results (R5.3–R5.6)
  function suggestNext() {
    const n = readyPlayers().length, lastId = S.lastDef && S.lastDef.id, lastCat = S.lastDef && S.lastDef.category;
    const fits = games.filter(g => g.min <= n && g.id !== lastId);
    const fresh = fits.filter(g => session.played.indexOf(g.id) < 0);
    const pool = (fresh.length ? fresh : fits).filter(g => g.category !== lastCat);
    const pick = pool.length ? pool : fresh.length ? fresh : fits;
    return pick[Math.random() * pick.length | 0] || S.lastDef;
  }
  function showResults(r) {
    S.mode = 'results'; S.overlay = null;
    ['pause', 'board', 'intro'].forEach(x => $(x).classList.add('hidden'));
    for (const x of r.ranked) {
      const st = session.standings[x.id] = session.standings[x.id] || { pts: 0, wins: 0, games: 0 };
      st.pts += R.partyPoints(x.rank); st.games++;
      if (x.rank === 1 && x.score > 0) st.wins++;
    }
    if (session.played.indexOf(r.def.id) < 0) session.played.push(r.def.id);
    persist();
    const next = S.nextDef = suggestNext();
    const top = r.ranked.slice(0, 3), order = [top[1], top[0], top[2]];
    const pod = order.map((x, i) => {
      if (!x) return '<div class="pod"></div>';
      const p = who(x.id), cls = ['p2', 'p1', 'p3'][i];
      return `<div class="pod ${cls}"><div class="avatar" style="background:${p.color};animation-delay:${[0.2, 0.4, 0][i]}s">${p.emoji}</div>
        <div class="nm">${esc(p.name)}</div><div class="sc2">${x.score} pts</div><div class="block">${x.rank}</div></div>`;
    }).join('');
    const awards = r.awards.map(a => { const p = who(a.id); return `<div class="award"><span class="e">${a.emoji}</span><span><b>${esc(p.name)}</b> · ${esc(a.title)}</span></div>`; }).join('');
    const stand = Object.keys(session.standings).sort((a, b) => session.standings[b].pts - session.standings[a].pts).slice(0, 5)
      .map((id, i) => `<div class="stand"><span>${i + 1}. ${who(id).emoji} ${esc(who(id).name)}</span><b>${session.standings[id].pts} pts</b></div>`).join('');
    const rest = r.ranked.map(x => `<div class="res-item"><b>#${x.rank}</b> ${who(x.id).emoji} ${esc(who(x.id).name)} · ${x.score}</div>`).join('');
    $('results').innerHTML = `<div class="res-title">Final results</div><div class="res-game">${r.def.emoji} ${esc(r.def.title)}</div>
      <div class="res-body"><div class="podium">${pod}</div>
        <div class="res-side">${awards ? `<div class="res-card"><h3>Awards</h3>${awards}</div>` : ''}<div class="res-card"><h3>Tonight's standings</h3>${stand}</div></div></div>
      <div class="res-list">${rest}</div>
      <div class="res-actions"><button class="btn" id="rAgain">↻ Play again</button><button class="btn ghost" id="rNext">Next: ${next.emoji} ${esc(next.title)}</button><button class="btn ghost" id="rMenu">☰ Menu</button></div>`;
    show('results');
    for (const x of r.ranked) {
      const a = r.awards.find(w => w.id === x.id);
      const msg = { ui: 'result', rank: x.rank, of: r.ranked.length, score: x.score, game: r.def.title, award: a ? `${a.emoji} ${a.title}` : '', next: next.title,
        tonight: session.standings[x.id].pts, vibrate: x.rank === 1 ? [80, 60, 80, 60, 200] : 120 };
      S.resultMsg[x.id] = msg; send(x.id, msg);
    }
    for (const p of connectedPlayers()) if (!S.resultMsg[p.id]) send(p.id, { ui: 'wait', text: 'Results on the TV 📺', sub: 'You can join the next game.' });
    runner.stop();
    buildNav(0, 0); sfx('win');
  }

  function showMenu() {
    runner.stop();
    S.mode = 'menu'; S.overlay = null;
    ['setup', 'pause', 'board', 'intro'].forEach(x => $(x).classList.add('hidden'));
    show('menu');
    renderTabs(); renderRows(); renderHero(); renderRoomSettings(); renderSlots();
    sendMenu();
    buildNav();
  }

  // ----------------------------------------------------------- boot
  renderHelp();
  showMenu();
  document.querySelectorAll('.tab-btn').forEach(b => { b.onclick = () => switchTab(b.dataset.tab); });
  window.__huddle = S; // handy for debugging
})();
