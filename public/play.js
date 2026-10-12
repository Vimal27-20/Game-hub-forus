// Phone controller. Renders whatever UI the TV asks for and sends input back.
// Protocol: specs/001-core-platform/design.md + specs/003-party-pack-v2/design.md.
(() => {
  const $ = id => document.getElementById(id);
  const view = $('view');
  const socket = io();
  const params = new URLSearchParams(location.search);
  const pathCode = (location.pathname.match(/^\/([A-Za-z]{4})\/?$/) || [])[1]; // short link /ABCD (R3.1)
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const S = {
    code: (params.get('r') || (pathCode && pathCode.toUpperCase() !== 'PLAY' ? pathCode : '') || ls.get('huddle-code') || '').toUpperCase(),
    name: ls.get('huddle-name') || '',
    key: null, id: null, char: null, vip: false, players: [], ui: null,
    joined: false, picking: false, focusGame: null, err: '', sheet: null, menu: null,
  };
  let cleanups = [];
  const cleanup = () => { cleanups.forEach(f => { try { f(); } catch (e) {} }); cleanups = []; };
  const out = d => socket.emit('in', d);
  const sys = (a, extra) => out(Object.assign({ t: 'sys', a }, extra));
  const myChar = () => CHAR[S.char];
  const buzz = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
  const uid = () => Math.random().toString(36).slice(2, 7);

  function note(text) {
    const n = $('note'); n.textContent = text; n.classList.remove('hidden');
    clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hidden'), 2200);
  }
  function overlay(text) {
    if (!text) return $('overlay').classList.add('hidden');
    $('overlayText').textContent = text; $('overlay').classList.remove('hidden');
  }

  // ------------------------------------------------------------- connection
  socket.on('connect', () => {
    overlay(null);
    const key = S.code && ls.get('huddle-key-' + S.code);
    if (key) join(key); else render();
  });
  socket.on('disconnect', () => overlay('Reconnecting…'));
  socket.on('host:gone', () => overlay('The TV disconnected.\nWaiting for it to come back…'));
  socket.on('host:back', () => { overlay(null); sys('menu'); });
  socket.on('room:closed', () => { overlay(null); leave('That room has closed.'); });
  socket.on('kicked', reason => { leave(reason || 'You were removed from the room.'); });

  socket.on('lobby', ({ players }) => {
    S.players = players;
    const me = players.find(p => p.id === S.id);
    if (me) { S.vip = me.vip; S.char = me.char; }
    renderBar();
    if (S.picking || !S.ui || ['menu', 'result', 'paused'].indexOf(S.ui.ui) >= 0) render();
  });

  socket.on('msg', msg => {
    if (!msg) return;
    if (msg.vibrate) buzz(msg.vibrate);
    if (msg.note) note(msg.note);
    if (msg.focus) { S.focusGame = msg.focus; document.querySelectorAll('.gcard').forEach(c => c.classList.toggle('focus', c.dataset.id === msg.focus)); }
    if (msg.ui) {
      if (msg.ui === 'menu') S.menu = msg; else S.sheet = null;
      S.ui = msg; S.picking = false; render();
    }
  });

  function join(key) {
    socket.emit('player:join', { code: S.code, name: S.name, key }, res => {
      if (res.error) {
        if (key) ls.del('huddle-key-' + S.code);
        S.err = res.error; S.joined = false; return render();
      }
      Object.assign(S, { joined: true, id: res.id, key: res.key, name: res.name, char: res.char, err: '' });
      ls.set('huddle-key-' + S.code, res.key);
      ls.set('huddle-code', S.code);
      ls.set('huddle-name', res.name);
      try { history.replaceState(null, '', '/' + S.code); } catch (e) {}
      if (!res.hostOnline) overlay('Waiting for the TV…');
      renderBar(); render();
      sys('menu');
    });
  }
  function leave(msg) {
    if (S.code) ls.del('huddle-key-' + S.code);
    Object.assign(S, { joined: false, id: null, key: null, char: null, ui: null, err: msg || '' });
    renderBar(); render();
  }

  // ------------------------------------------------------------- header
  const inGame = () => S.ui && ['menu', 'result', 'paused'].indexOf(S.ui.ui) < 0 && !S.ui.allowChar;
  function renderBar() {
    $('bar').classList.toggle('hidden', !S.joined);
    if (!S.joined) return;
    const c = myChar();
    $('me').innerHTML = `<div class="av" style="background:${c ? c.color : '#2a2a3a'}">${c ? c.emoji : '?'}</div><span>${S.vip ? '👑 ' : ''}${esc(S.name)}</span>`;
    $('roomTag').textContent = S.code;
    document.documentElement.style.setProperty('--me', c ? c.color : '#ff3d5a');
    $('pauseBtn').classList.toggle('hidden', !(S.vip && inGame()));
  }
  $('pauseBtn').onclick = () => { sys('pause'); buzz(20); };
  $('me').onclick = () => { if (S.ui && (S.ui.ui === 'menu' || S.ui.allowChar)) { S.picking = true; render(); } };

  // ------------------------------------------------------------- views
  function render() {
    cleanup();
    renderBar();
    if (!S.joined) return viewJoin();
    if (!S.char || S.picking) {
      if (!S.ui || S.ui.ui === 'menu' || S.ui.allowChar || !S.char) return viewChars();
    }
    if (!S.ui) return viewWait({ text: 'Connected!', sub: 'Waiting for the TV…' });
    const fn = UI[S.ui.ui] || viewWait;
    fn(S.ui);
  }

  function viewJoin() {
    const saved = ls.get('huddle-code'), savedKey = saved && ls.get('huddle-key-' + saved);
    view.innerHTML = `<div class="center">
      <div class="brand">HUDDLE</div><p class="muted">Your phone is the controller</p>
      <div class="field"><label>Room code</label><input id="code" class="code" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(S.code)}" placeholder="ABCD"></div>
      <div class="field"><label>Your name</label><input id="name" maxlength="14" autocomplete="nickname" value="${esc(S.name)}" placeholder="Name"></div>
      <div class="err">${esc(S.err)}</div>
      <button class="btn" id="go">Join game</button>
      ${savedKey && saved !== S.code ? `<button class="btn ghost" id="rejoin">Rejoin room ${esc(saved)}</button>` : ''}</div>`;
    const go = () => {
      S.code = $('code').value.toUpperCase().trim(); S.name = $('name').value.trim();
      if (S.code.length !== 4) { S.err = 'Room code is 4 letters (shown on the TV).'; return viewJoin(); }
      if (!S.name) { S.err = 'Pick a name.'; return viewJoin(); }
      join(ls.get('huddle-key-' + S.code));
    };
    $('go').onclick = go;
    const rj = $('rejoin'); if (rj) rj.onclick = () => { S.code = saved; join(savedKey); };
    view.querySelectorAll('input').forEach(i => { i.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  }

  function viewChars() {
    const takenBy = {};
    S.players.forEach(p => { if (p.char && p.id !== S.id) takenBy[p.char] = p.name; });
    view.innerHTML = `<h1 style="text-align:center;margin-top:4px">Pick your character</h1>
      <p class="muted" style="text-align:center;margin:6px 0 10px">Everyone gets a different one</p>
      <div class="chars">${CHARACTERS.map(c => `
        <button class="ch ${c.id === S.char ? 'sel' : ''} ${takenBy[c.id] ? 'taken' : ''}" data-id="${c.id}">
          <div class="e" style="background:${c.color}">${c.emoji}</div><div class="n">${c.name}</div>
          <div class="who">${takenBy[c.id] ? esc(takenBy[c.id]) : '&nbsp;'}</div></button>`).join('')}</div>
      ${S.char ? '<button class="btn" id="done" style="margin:12px auto 0">Done</button>' : ''}`;
    view.querySelectorAll('.ch').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.id;
        socket.emit('player:char', id, res => {
          if (res.error) return note(res.error);
          S.char = id; buzz(30); S.picking = false; renderBar(); render();
        });
      };
    });
    const d = $('done'); if (d) d.onclick = () => { S.picking = false; render(); };
  }

  function viewWait(m) {
    const c = myChar();
    view.innerHTML = `<div class="center">
      ${m.big ? `<div class="big-emoji">${m.big}</div>` : c ? `<div class="big-emoji pulse">${c.emoji}</div>` : ''}
      <h1>${esc(m.text || 'Look at the TV 📺')}</h1>${m.sub ? `<p class="muted">${esc(m.sub)}</p>` : ''}
      ${m.allowChar ? '<button class="btn ghost" id="chg" style="margin-top:10px">Change character</button>' : ''}
      ${m.skip && S.vip ? '<button class="btn" id="skip" style="margin-top:10px">Next ▶</button>' : ''}</div>`;
    const b = $('chg'); if (b) b.onclick = () => { S.picking = true; render(); };
    const k = $('skip'); if (k) k.onclick = () => { sys('skip'); k.disabled = true; buzz(20); };
  }

  // segmented control for a setting: [{v,label}] + current value
  const seg = (opts, value, attrs) => `<div class="seg">${opts.map(o => `<button class="${o.v === value ? 'on' : ''}" data-v='${esc(JSON.stringify(o.v))}' ${attrs}>${esc(o.label)}</button>`).join('')}</div>`;

  const UI = {
    wait: viewWait,

    // Menu (R3.5): VIP gets games by category, a game sheet with settings, and room settings.
    menu(m) {
      const ready = S.players.filter(p => p.connected && p.char).length;
      if (!S.vip) {
        const vip = S.players.find(p => p.vip);
        view.innerHTML = `<div class="center">
          <div class="big-emoji pulse">${myChar().emoji}</div>
          <h1>You're in!</h1><p class="muted">Waiting for ${vip ? '👑 ' + esc(vip.name) : 'the host'} to pick a game</p>
          <div class="plist">${S.players.filter(p => p.connected).map(p => { const c = CHAR[p.char]; return `<div class="pchip"><div class="av" style="background:${c ? c.color : '#333'}">${c ? c.emoji : '…'}</div>${esc(p.name)}</div>`; }).join('')}</div>
          <button class="btn ghost" id="chg" style="margin-top:8px">Change character</button></div>`;
        $('chg').onclick = () => { S.picking = true; render(); };
        return;
      }
      if (S.sheet === 'room') return roomSheet(m);
      const g = S.sheet && m.games.find(x => x.id === S.sheet);
      if (g) return gameSheet(m, g, ready);
      view.innerHTML = `<div class="menuhead"><div><h2>👑 You pick the game</h2>
        <p class="muted">${ready} player${ready === 1 ? '' : 's'} ready</p></div><button class="iconbtn" id="roomBtn" aria-label="Room settings">⚙️</button></div>
        ${m.cats.map(c => {
          const list = m.games.filter(x => x.category === c.id);
          if (!list.length) return '';
          return `<div class="cat">${esc(c.name)} <span class="muted">${esc(c.sub)}</span></div><div class="glist">${list.map(x => `
            <button class="gcard ${ready < x.min ? 'locked' : ''} ${S.focusGame === x.id ? 'focus' : ''}" data-id="${x.id}" style="background:linear-gradient(135deg,${x.colors[0]},${x.colors[1]})">
              <div class="ge">${x.emoji}</div><div><div class="gt">${esc(x.title)}${x.played ? ' <span class="tag">✓</span>' : ''}</div><div class="gs">${esc(x.tagline)}</div>
              <div class="gp">${ready < x.min ? `Needs ${x.min}+ players` : `${x.min}–${x.max} players · ${esc(x.time)}`}</div></div></button>`).join('')}</div>`;
        }).join('')}
        <button class="btn ghost" id="chg" style="margin:16px auto 0">Change character</button>`;
      view.querySelectorAll('.gcard').forEach(b => { b.onclick = () => { S.sheet = b.dataset.id; sys('focus', { game: b.dataset.id }); buzz(15); render(); }; });
      $('roomBtn').onclick = () => { S.sheet = 'room'; render(); };
      $('chg').onclick = () => { S.picking = true; render(); };
    },

    paused() {
      view.innerHTML = `<div class="center"><div class="big-emoji">⏸</div><h1>Paused</h1>
        ${S.vip ? `<p class="muted">You control the game</p>
          <button class="btn" id="res">▶ Resume</button><button class="btn ghost" id="rst">↻ Restart game</button><button class="btn danger" id="qt">✕ Quit to menu</button>`
          : '<p class="muted">The host paused the game. Hang tight!</p>'}</div>`;
      if (!S.vip) return;
      $('res').onclick = () => { sys('resume'); buzz(20); };
      $('rst').onclick = () => { if (confirm('Restart this game from the beginning?')) sys('restart'); };
      $('qt').onclick = () => { if (confirm('End this game for everyone?')) sys('quit'); };
    },

    joystick(m) {
      view.innerHTML = `${m.label ? `<p class="muted" style="text-align:center">${esc(m.label)}</p>` : ''}
        <div class="pad"><div class="joy" id="joy"><div class="knob" id="knob"></div></div>
        ${m.btn ? `<button class="action" id="act">${esc(m.btn)}</button>` : ''}</div>`;
      const joy = $('joy'), knob = $('knob');
      let x = 0, y = 0, sx = 0, sy = 0, pid = null, dirty = false;
      const setFrom = e => {
        const r = joy.getBoundingClientRect(), Rr = r.width / 2;
        let dx = (e.clientX - (r.left + Rr)) / (Rr * 0.8), dy = (e.clientY - (r.top + Rr)) / (Rr * 0.8);
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        x = dx; y = dy; dirty = true;
        knob.style.transform = `translate(${dx * Rr * 0.62}px,${dy * Rr * 0.62}px)`;
      };
      joy.onpointerdown = e => { pid = e.pointerId; joy.setPointerCapture(pid); setFrom(e); };
      joy.onpointermove = e => { if (e.pointerId === pid) setFrom(e); };
      joy.onpointerup = joy.onpointercancel = e => {
        if (e.pointerId !== pid) return; pid = null; x = y = 0; knob.style.transform = '';
        out({ t: 'joy', x: 0, y: 0 }); sx = sy = 0; dirty = false;
      };
      const iv = setInterval(() => {
        if (!dirty) return; dirty = false;
        if (Math.abs(x - sx) < 0.02 && Math.abs(y - sy) < 0.02) return;
        sx = x; sy = y; out({ t: 'joy', x: +x.toFixed(3), y: +y.toFixed(3) });
      }, 45);
      cleanups.push(() => clearInterval(iv));
      const act = $('act');
      if (act) {
        act.onpointerdown = e => { e.preventDefault(); act.classList.add('down'); out({ t: 'btn', down: true }); buzz(15); };
        act.onpointerup = act.onpointercancel = () => { act.classList.remove('down'); out({ t: 'btn', down: false }); };
      }
    },

    // Arrow pad (Light Trails): absolute directions 0 up · 1 right · 2 down · 3 left.
    dpad(m) {
      view.innerHTML = `${m.label ? `<p class="muted" style="text-align:center">${esc(m.label)}</p>` : ''}
        <div class="dpadwrap"><div class="dpad">
          <button data-d="0" class="du">▲</button><button data-d="3" class="dl">◀</button><button data-d="1" class="dr">▶</button><button data-d="2" class="dd">▼</button>
        </div>${m.btn ? `<button class="action" id="act">${esc(m.btn)}</button>` : ''}</div>`;
      view.querySelectorAll('.dpad button').forEach(b => {
        b.onpointerdown = e => { e.preventDefault(); out({ t: 'dir', d: +b.dataset.d }); b.classList.add('down'); buzz(10); };
        b.onpointerup = b.onpointercancel = b.onpointerleave = () => b.classList.remove('down');
      });
      // swipes anywhere also steer
      let sx = 0, sy = 0;
      const ts = e => { sx = e.clientX; sy = e.clientY; }, te = e => {
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 40 || e.target.closest('button')) return;
        out({ t: 'dir', d: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0) }); buzz(10);
      };
      view.addEventListener('pointerdown', ts); view.addEventListener('pointerup', te);
      cleanups.push(() => { view.removeEventListener('pointerdown', ts); view.removeEventListener('pointerup', te); });
      const act = $('act');
      if (act) {
        let cd = 0;
        act.onpointerdown = e => {
          e.preventDefault(); if (Date.now() < cd) return;
          out({ t: 'btn', down: true }); buzz(25); cd = Date.now() + 5000;
          act.classList.add('cool'); setTimeout(() => act.classList.remove('cool'), 5000);
        };
      }
    },

    // Drag back to aim, release to shoot (Mini Golf).
    aim(m) {
      view.innerHTML = `${m.label ? `<p class="muted" style="text-align:center;margin-bottom:8px">${esc(m.label)}</p>` : ''}
        <div class="aimpad" id="pad"><canvas id="aimCv"></canvas><div class="aimhint">Drag back from anywhere, aim, release to putt</div></div>
        <div class="power"><div id="pow"></div></div>`;
      const pad = $('pad'), cv = $('aimCv'), g = cv.getContext('2d');
      let start = null, a = 0, p = 0, lastSent = 0, pid = null;
      const fit = () => { const r = pad.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2; draw(); };
      function draw(cur) {
        g.clearRect(0, 0, cv.width, cv.height);
        if (!start || !cur) return;
        const r = pad.getBoundingClientRect(), k = 2, x0 = (start.x - r.left) * k, y0 = (start.y - r.top) * k, x1 = (cur.x - r.left) * k, y1 = (cur.y - r.top) * k;
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 10; g.setLineDash([16, 16]);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
        const len = 80 + p * 260, ex = x0 + Math.cos(a) * len, ey = y0 + Math.sin(a) * len;
        g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--me') || '#ff3d5a'; g.lineWidth = 16;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(ex, ey); g.stroke();
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(a - 0.5) * 40, ey - Math.sin(a - 0.5) * 40); g.moveTo(ex, ey); g.lineTo(ex - Math.cos(a + 0.5) * 40, ey - Math.sin(a + 0.5) * 40); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x0, y0, 22, 0, 6.29); g.fill();
      }
      const upd = e => {
        const r = pad.getBoundingClientRect(), dx = start.x - e.clientX, dy = start.y - e.clientY;
        a = Math.atan2(dy, dx); p = Math.min(1, Math.hypot(dx, dy) / (Math.min(r.width, r.height) * 0.45));
        $('pow').style.width = (p * 100) + '%';
        draw({ x: e.clientX, y: e.clientY });
        if (Date.now() - lastSent > 100) { lastSent = Date.now(); out({ t: 'aim', a: +a.toFixed(3), p: +p.toFixed(3) }); }
      };
      pad.onpointerdown = e => { pid = e.pointerId; pad.setPointerCapture(pid); start = { x: e.clientX, y: e.clientY }; p = 0; buzz(10); };
      pad.onpointermove = e => { if (e.pointerId === pid && start) upd(e); };
      pad.onpointerup = e => {
        if (e.pointerId !== pid || !start) return;
        if (p >= 0.05) { out({ t: 'shot', a: +a.toFixed(3), p: +p.toFixed(3) }); buzz(40); }
        start = null; pid = null; p = 0; $('pow').style.width = '0%'; draw();
      };
      pad.onpointercancel = () => { start = null; pid = null; p = 0; $('pow').style.width = '0%'; draw(); };
      requestAnimationFrame(fit);
      addEventListener('resize', fit); cleanups.push(() => removeEventListener('resize', fit));
    },

    // Quick Draw: plays the TV's signal script locally and times the tap from when the
    // real signal is actually on screen, so network lag doesn't matter.
    react(m) {
      view.innerHTML = `<button class="reactbtn" id="rb"><span id="rt"></span><small id="rs">${esc(m.title || '')}</small></button>`;
      const rb = $('rb'), rt = $('rt');
      const t0 = performance.now(), timers = [];
      let cur = null, goAt = 0, sent = false;
      const showStep = s => {
        cur = s; rt.textContent = s.show; rb.style.background = s.color || '#2a2a3a';
        if (s.kind === 'go') requestAnimationFrame(() => { goAt = performance.now(); });
      };
      (m.seq || []).forEach(s => timers.push(setTimeout(() => showStep(s), Math.max(0, s.at - (performance.now() - t0)))));
      cleanups.push(() => timers.forEach(clearTimeout));
      rb.onpointerdown = e => {
        e.preventDefault();
        if (sent || !cur) return;
        sent = true;
        if (cur.kind !== 'go' || !goAt) out({ t: 'react', r: m.r, foul: cur.kind === 'fake' ? 'fake' : 'early' });
        else out({ t: 'react', r: m.r, ms: Math.round(performance.now() - goAt) });
        buzz(30); rb.classList.add('down');
      };
    },

    // Number pad (Close Call, quiz number questions).
    number(m) {
      let val = '';
      view.innerHTML = `<div class="prompt">${esc(m.prompt || 'Your guess')}</div>
        <div class="numshow"><span id="nv">0</span> <small>${esc(m.unit || '')}</small></div>
        <div class="numpad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div>
        <button class="btn" id="numgo" style="margin:12px auto 0">Lock it in</button>
        ${m.sub ? `<p class="muted" style="text-align:center;margin-top:8px">${esc(m.sub)}</p>` : ''}`;
      const show = () => { $('nv').textContent = val ? Number(val).toLocaleString('en-IE', { maximumFractionDigits: 3 }) + (val.slice(-1) === '.' ? '.' : '') : '0'; };
      view.querySelectorAll('.numpad button').forEach(b => {
        b.onclick = () => {
          const k = b.dataset.k;
          if (k === '⌫') val = val.slice(0, -1);
          else if (k === '.') { if (val.indexOf('.') < 0) val = (val || '0') + '.'; }
          else if (val.replace('.', '').length < 12) val = val === '0' ? k : val + k;
          buzz(8); show();
        };
      });
      $('numgo').onclick = () => {
        const v = parseFloat(val);
        if (!isFinite(v)) return note('Type a number first');
        out({ t: 'number', v }); $('numgo').disabled = true; buzz(30);
      };
    },

    // Free text (Fake Out lies). The TV may reject with a {note}; then you can edit and resend.
    text(m) {
      view.innerHTML = `<div class="center" style="justify-content:flex-start;padding-top:10px">
        <h2>${esc(m.prompt || 'Your answer')}</h2>
        <div class="guessrow"><input id="tx" maxlength="${m.max || 40}" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Type here…"><button id="send">Send</button></div>
        <p class="muted">${esc(m.sub || '')}</p></div>`;
      const inp = $('tx');
      const go = () => { const v = inp.value.trim(); if (!v) return; out({ t: 'text', text: v }); buzz(20); };
      $('send').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      setTimeout(() => inp.focus(), 50);
    },

    choices(m) {
      const opts = m.options || [];
      const layout = m.layout || (opts.length === 4 && !opts.some(o => o.char) ? 'grid' : 'list');
      view.innerHTML = `${m.prompt ? `<div class="prompt">${esc(m.prompt)}</div>` : ''}
        <div class="opts ${layout} ${m.picked != null ? 'locked' : ''}">${opts.map(o => {
          const c = o.char ? CHAR[o.char] : null;
          return `<button class="opt ${m.picked === o.id ? 'picked' : ''}" data-id="${esc(o.id)}" style="${o.color ? `background:${o.color}` : ''}">
            ${c ? `<div class="av" style="background:${c.color}">${c.emoji}</div>` : ''}${o.shape ? `<span class="shape">${o.shape}</span>` : ''}<span>${esc(o.label || '')}</span></button>`;
        }).join('')}</div>
        ${m.sub ? `<p class="muted" style="text-align:center;margin-top:12px">${esc(m.sub)}</p>` : ''}`;
      view.querySelectorAll('.opt').forEach(b => {
        b.onclick = () => {
          if (S.ui.picked != null) return;
          const id = isNaN(+b.dataset.id) || b.dataset.id === '' ? b.dataset.id : +b.dataset.id;
          S.ui.picked = id; out({ t: 'choice', id }); buzz(25);
          view.querySelector('.opts').classList.add('locked'); b.classList.add('picked');
        };
      });
    },

    secret(m) {
      view.innerHTML = `<div class="center">
        <h2>${esc(m.title || 'Your secret')}</h2><p class="muted">Press and hold to peek. Keep it hidden!</p>
        <div class="secret" id="card"><div class="hint">👆 HOLD TO REVEAL</div></div>
        <button class="btn" id="ok">${esc(m.button || "I'm ready")}</button></div>`;
      const card = $('card');
      const show = on => {
        card.classList.toggle('show', on);
        card.innerHTML = on ? `<div class="word">${esc(m.word)}</div>${m.sub ? `<div class="sub">${esc(m.sub)}</div>` : ''}` : '<div class="hint">👆 HOLD TO REVEAL</div>';
      };
      card.onpointerdown = e => { card.setPointerCapture(e.pointerId); show(true); buzz(20); };
      card.onpointerup = card.onpointercancel = () => show(false);
      $('ok').onclick = () => { out({ t: 'ready' }); $('ok').disabled = true; $('ok').textContent = 'Waiting for others…'; };
      if (m.done) { $('ok').disabled = true; $('ok').textContent = 'Waiting for others…'; }
    },

    turn(m) {
      view.innerHTML = `<div class="center"><div class="big-emoji pulse">${m.big || '🎤'}</div><h1>${esc(m.text)}</h1>
        ${m.sub ? `<p class="muted">${esc(m.sub)}</p>` : ''}<button class="btn" id="ok" style="margin-top:10px">${esc(m.button || 'Done')}</button></div>`;
      $('ok').onclick = () => { out({ t: 'done' }); $('ok').disabled = true; };
    },

    draw(m) {
      const colors = ['#111111', '#e63946', '#ff9f1c', '#ffd60a', '#2ec4b6', '#3a86ff', '#8338ec', '#8d5524'];
      const sizes = [0.008, 0.018, 0.04];
      view.innerHTML = `<div class="drawwrap"><div class="drawword">Draw: <b>${esc(m.word)}</b></div>
        <canvas class="board" id="board"></canvas>
        <div class="tools">${colors.map((c, i) => `<button class="sw ${i === 0 ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>
        <div class="tools">${sizes.map((s, i) => `<button class="tool sz ${i === 1 ? 'on' : ''}" data-s="${s}">${['Thin', 'Medium', 'Thick'][i]}</button>`).join('')}
          <button class="tool" id="eraser">Eraser</button><button class="tool" id="undo">↶ Undo</button><button class="tool" id="clear">Clear</button></div></div>`;
      const cv = $('board'), g = cv.getContext('2d'), mount = uid(); // unique stroke ids even after a rejoin
      let color = colors[0], size = sizes[1], eraser = false, strokes = [], cur = null, buf = [], sid = 0;
      const drawStroke = s => {
        g.strokeStyle = s.c; g.lineWidth = s.w * cv.width; g.lineCap = g.lineJoin = 'round';
        g.beginPath();
        for (let i = 0; i < s.p.length; i += 2) { const X = s.p[i] * cv.width, Y = s.p[i + 1] * cv.height; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); }
        if (s.p.length === 2) g.lineTo(s.p[0] * cv.width + 0.1, s.p[1] * cv.height);
        g.stroke();
      };
      const redraw = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); strokes.forEach(drawStroke); };
      const fit = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2; redraw(); };
      const pt = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
      const flush = () => { if (!cur || !buf.length) return; out({ t: 'pts', s: cur.id, c: cur.c, w: cur.w, p: buf.map(v => +v.toFixed(4)) }); buf = []; };
      cv.onpointerdown = e => {
        cv.setPointerCapture(e.pointerId);
        cur = { id: mount + '-' + (++sid), c: eraser ? '#ffffff' : color, w: eraser ? 0.06 : size, p: pt(e) };
        strokes.push(cur); buf = cur.p.slice(); redraw();
      };
      cv.onpointermove = e => {
        if (!cur) return; const p = pt(e);
        cur.p.push(p[0], p[1]); buf.push(p[0], p[1]); redraw();
      };
      cv.onpointerup = cv.onpointercancel = () => { flush(); cur = null; };
      const iv = setInterval(flush, 50);
      cleanups.push(() => clearInterval(iv));
      view.querySelectorAll('.sw').forEach(b => { b.onclick = () => { color = b.dataset.c; eraser = false; view.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); $('eraser').classList.remove('on'); }; });
      view.querySelectorAll('.sz').forEach(b => { b.onclick = () => { size = +b.dataset.s; view.querySelectorAll('.sz').forEach(x => x.classList.toggle('on', x === b)); }; });
      $('eraser').onclick = () => { eraser = !eraser; $('eraser').classList.toggle('on', eraser); };
      $('undo').onclick = () => { const s = strokes.pop(); if (s) { out({ t: 'undo', s: s.id }); redraw(); } };
      $('clear').onclick = () => { strokes = []; out({ t: 'clear' }); redraw(); };
      requestAnimationFrame(fit);
      addEventListener('resize', fit); cleanups.push(() => removeEventListener('resize', fit));
    },

    guess(m) {
      view.innerHTML = `<div class="center" style="justify-content:flex-start;padding-top:10px">
        <h2>${esc(m.prompt || 'What is it?')}</h2>
        <div class="hintword" id="hint">${esc(m.hint || '')}</div>
        <div class="guessrow"><input id="g" maxlength="30" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Type a guess…"><button id="send">Go</button></div>
        <p class="muted">${esc(m.sub || 'Guess as many times as you like')}</p></div>`;
      const inp = $('g');
      const go = () => { const v = inp.value.trim(); if (!v) return; out({ t: 'guess', text: v }); inp.value = ''; inp.focus(); };
      $('send').onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      setTimeout(() => inp.focus(), 50);
    },

    tap(m) {
      view.innerHTML = `${m.top ? `<p class="muted" style="text-align:center;margin-bottom:10px">${esc(m.top)}</p>` : ''}
        <button class="tapbtn" id="tap" style="${m.color ? `background:${m.color}` : ''}">${esc(m.label || 'TAP!')}${m.sub ? `<small>${esc(m.sub)}</small>` : ''}</button>`;
      const b = $('tap'); let n = 0;
      b.onpointerdown = e => { e.preventDefault(); n++; b.classList.add('down'); };
      b.onpointerup = b.onpointercancel = () => b.classList.remove('down');
      const iv = setInterval(() => { if (n) { out({ t: 'tap', n }); n = 0; } }, 100);
      cleanups.push(() => clearInterval(iv));
    },

    result(m) {
      const medal = ['🥇', '🥈', '🥉'][m.rank - 1] || '🎮';
      view.innerHTML = `<div class="center"><div class="big-emoji">${medal}</div>
        <div class="rank">#${m.rank}</div><h2>of ${m.of} in ${esc(m.game)}</h2><p class="muted">${m.score} points${m.tonight != null ? ` · ${m.tonight} party points tonight` : ''}</p>
        ${m.award ? `<div class="award">${esc(m.award)}</div>` : ''}
        ${S.vip ? `<button class="btn" id="again" style="margin-top:10px">↻ Play again</button>${m.next ? `<button class="btn ghost" id="nextg">Next: ${esc(m.next)}</button>` : ''}<button class="btn ghost" id="lobby">☰ Menu</button>`
          : '<p class="muted">The 👑 player picks what\'s next</p>'}</div>`;
      if (S.vip) {
        $('again').onclick = () => sys('again'); $('lobby').onclick = () => sys('lobby');
        const n = $('nextg'); if (n) n.onclick = () => sys('next');
      }
    },
  };

  function gameSheet(m, g, ready) {
    view.innerHTML = `<button class="back" id="back">‹ All games</button>
      <div class="sheethead" style="background:linear-gradient(135deg,${g.colors[0]},${g.colors[1]})"><div class="ge">${g.emoji}</div><div><div class="gt">${esc(g.title)}</div><div class="gs">${esc(g.genre)} · ${g.min}–${g.max} players · ${esc(g.time)}</div></div></div>
      <ul class="howlist">${g.how.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
      ${g.settings.map(s => `<div class="setlabel">${esc(s.label)}</div>${seg(s.options, s.value, `data-key="${esc(s.id)}"`)}`).join('')}
      <button class="btn" id="start" style="margin:16px auto 0" ${ready < g.min ? 'disabled' : ''}>${ready < g.min ? `Needs ${g.min}+ players with a character` : '▶ Start ' + esc(g.title)}</button>`;
    $('back').onclick = () => { S.sheet = null; render(); };
    view.querySelectorAll('.seg button').forEach(b => { b.onclick = () => { sys('setting', { game: g.id, key: b.dataset.key, value: JSON.parse(b.dataset.v) }); buzz(10); }; });
    $('start').onclick = () => { if (ready < g.min) return; sys('pick', { game: g.id }); buzz(30); };
  }
  function roomSheet(m) {
    view.innerHTML = `<button class="back" id="back">‹ All games</button><h2 style="margin:6px 0 12px">⚙️ Room settings</h2>
      ${m.roomOptions.map(o => `<div class="setlabel">${esc(o.label)}</div>${seg(o.options, m.room[o.id], `data-key="${esc(o.id)}"`)}`).join('')}`;
    $('back').onclick = () => { S.sheet = null; render(); };
    view.querySelectorAll('.seg button').forEach(b => { b.onclick = () => { sys('room', { key: b.dataset.key, value: JSON.parse(b.dataset.v) }); buzz(10); }; });
  }

  render();
})();
