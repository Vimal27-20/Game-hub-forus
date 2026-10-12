// Phone controller. Renders whatever UI the TV asks for and sends input back.
(() => {
  const $ = id => document.getElementById(id);
  const view = $('view');
  const socket = io();
  const params = new URLSearchParams(location.search);
  const S = {
    code: (params.get('r') || localStorage.getItem('huddle-code') || '').toUpperCase(),
    name: localStorage.getItem('huddle-name') || '',
    key: null, id: null, char: null, vip: false, players: [], ui: null,
    joined: false, picking: false, focusGame: null, err: '',
  };
  let cleanups = [];
  const cleanup = () => { cleanups.forEach(f => { try { f(); } catch (e) {} }); cleanups = []; };
  const out = d => socket.emit('in', d);
  const sys = (a, extra) => out(Object.assign({ t: 'sys', a }, extra));
  const myChar = () => CHAR[S.char];
  const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

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
    const key = S.code && localStorage.getItem('huddle-key-' + S.code);
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
    if (S.picking || !S.ui || ['menu', 'result'].includes(S.ui.ui)) render();
  });

  socket.on('msg', msg => {
    if (!msg) return;
    if (msg.vibrate) buzz(msg.vibrate);
    if (msg.note) note(msg.note);
    if (msg.focus) { S.focusGame = msg.focus; document.querySelectorAll('.gcard').forEach(c => c.classList.toggle('focus', c.dataset.id === msg.focus)); }
    if (msg.ui) { S.ui = msg; S.picking = false; render(); }
  });

  function join(key) {
    socket.emit('player:join', { code: S.code, name: S.name, key }, res => {
      if (res.error) {
        if (key) localStorage.removeItem('huddle-key-' + S.code);
        S.err = res.error; S.joined = false; return render();
      }
      Object.assign(S, { joined: true, id: res.id, key: res.key, name: res.name, char: res.char, err: '' });
      localStorage.setItem('huddle-key-' + S.code, res.key);
      localStorage.setItem('huddle-code', S.code);
      localStorage.setItem('huddle-name', res.name);
      history.replaceState(null, '', '/play?r=' + S.code);
      if (!res.hostOnline) overlay('Waiting for the TV…');
      renderBar(); render();
      sys('menu');
    });
  }
  function leave(msg) {
    if (S.code) localStorage.removeItem('huddle-key-' + S.code);
    Object.assign(S, { joined: false, id: null, key: null, char: null, ui: null, err: msg || '' });
    renderBar(); render();
  }

  // ------------------------------------------------------------- header
  function renderBar() {
    $('bar').classList.toggle('hidden', !S.joined);
    if (!S.joined) return;
    const c = myChar();
    $('me').innerHTML = `<div class="av" style="background:${c ? c.color : '#2a2a3a'}">${c ? c.emoji : '?'}</div><span>${S.vip ? '👑 ' : ''}${esc(S.name)}</span>`;
    $('roomTag').textContent = S.code;
    document.documentElement.style.setProperty('--me', c ? c.color : '#ff3d5a');
    const inGame = S.ui && !['menu', 'result'].includes(S.ui.ui);
    $('quitBtn').classList.toggle('hidden', !(S.vip && inGame));
  }
  $('quitBtn').onclick = () => { if (confirm('End this game for everyone and go back to the lobby?')) sys('quit'); };
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
    view.innerHTML = `<div class="center">
      <div class="brand">HUDDLE</div><p class="muted">Your phone is the controller</p>
      <div class="field"><label>Room code</label><input id="code" class="code" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(S.code)}" placeholder="ABCD"></div>
      <div class="field"><label>Your name</label><input id="name" maxlength="14" autocomplete="nickname" value="${esc(S.name)}" placeholder="Name"></div>
      <div class="err">${esc(S.err)}</div>
      <button class="btn" id="go">Join game</button></div>`;
    const go = () => {
      S.code = $('code').value.toUpperCase().trim(); S.name = $('name').value.trim();
      if (S.code.length !== 4) { S.err = 'Room code is 4 letters (shown on the TV).'; return viewJoin(); }
      if (!S.name) { S.err = 'Pick a name.'; return viewJoin(); }
      join(null);
    };
    $('go').onclick = go;
    view.querySelectorAll('input').forEach(i => i.onkeydown = e => { if (e.key === 'Enter') go(); });
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
    view.querySelectorAll('.ch').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      socket.emit('player:char', id, res => {
        if (res.error) return note(res.error);
        S.char = id; buzz(30); S.picking = false; renderBar(); render();
      });
    });
    const d = $('done'); if (d) d.onclick = () => { S.picking = false; render(); };
  }

  function viewWait(m) {
    const c = myChar();
    view.innerHTML = `<div class="center">
      ${m.big ? `<div class="big-emoji">${m.big}</div>` : c ? `<div class="big-emoji pulse">${c.emoji}</div>` : ''}
      <h1>${esc(m.text || 'Look at the TV 📺')}</h1>${m.sub ? `<p class="muted">${esc(m.sub)}</p>` : ''}
      ${m.allowChar ? '<button class="btn ghost" id="chg" style="margin-top:10px">Change character</button>' : ''}</div>`;
    const b = $('chg'); if (b) b.onclick = () => { S.picking = true; render(); };
  }

  const UI = {
    wait: viewWait,

    menu() {
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
      view.innerHTML = `<h2 style="margin-bottom:4px">👑 You pick the game</h2>
        <p class="muted" style="margin-bottom:14px">${ready} player${ready === 1 ? '' : 's'} ready · tap a game to start</p>
        <div class="glist">${S.ui.games.map(g => `
          <button class="gcard ${ready < g.min ? 'locked' : ''} ${S.focusGame === g.id ? 'focus' : ''}" data-id="${g.id}" style="background:linear-gradient(135deg,${g.colors[0]},${g.colors[1]})">
            <div class="ge">${g.emoji}</div><div><div class="gt">${esc(g.title)}</div><div class="gs">${esc(g.tagline)}</div>
            <div class="gp">${ready < g.min ? `Needs ${g.min}+ players` : `${g.min}–${g.max} players`}</div></div></button>`).join('')}</div>
        <button class="btn ghost" id="chg" style="margin:16px auto 0">Change character</button>`;
      view.querySelectorAll('.gcard').forEach(b => b.onclick = () => {
        const g = S.ui.games.find(x => x.id === b.dataset.id);
        if (ready < g.min) return note(`${g.title} needs ${g.min}+ players`);
        sys('pick', { game: g.id }); buzz(30);
      });
      $('chg').onclick = () => { S.picking = true; render(); };
    },

    joystick(m) {
      view.innerHTML = `${m.label ? `<p class="muted" style="text-align:center">${esc(m.label)}</p>` : ''}
        <div class="pad"><div class="joy" id="joy"><div class="knob" id="knob"></div></div>
        ${m.btn ? `<button class="action" id="act">${esc(m.btn)}</button>` : ''}</div>`;
      const joy = $('joy'), knob = $('knob');
      let x = 0, y = 0, sx = 0, sy = 0, pid = null, dirty = false;
      const setFrom = e => {
        const r = joy.getBoundingClientRect(), R = r.width / 2;
        let dx = (e.clientX - (r.left + R)) / (R * 0.8), dy = (e.clientY - (r.top + R)) / (R * 0.8);
        const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
        x = dx; y = dy; dirty = true;
        knob.style.transform = `translate(${dx * R * 0.62}px,${dy * R * 0.62}px)`;
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
      view.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        if (S.ui.picked != null) return;
        const id = isNaN(+b.dataset.id) || b.dataset.id === '' ? b.dataset.id : +b.dataset.id;
        S.ui.picked = id; out({ t: 'choice', id }); buzz(25);
        view.querySelector('.opts').classList.add('locked'); b.classList.add('picked');
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
      const cv = $('board'), g = cv.getContext('2d');
      let color = colors[0], size = sizes[1], eraser = false, strokes = [], cur = null, buf = [], sid = 0;
      const fit = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * 2; cv.height = r.height * 2; redraw(); };
      const drawStroke = s => {
        g.strokeStyle = s.c; g.lineWidth = s.w * cv.width; g.lineCap = g.lineJoin = 'round';
        g.beginPath();
        for (let i = 0; i < s.p.length; i += 2) { const X = s.p[i] * cv.width, Y = s.p[i + 1] * cv.height; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
        if (s.p.length === 2) g.lineTo(s.p[0] * cv.width + 0.1, s.p[1] * cv.height);
        g.stroke();
      };
      const redraw = () => { g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); strokes.forEach(drawStroke); };
      const pt = e => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
      const flush = () => { if (!cur || !buf.length) return; out({ t: 'pts', s: cur.id, c: cur.c, w: cur.w, p: buf.map(v => +v.toFixed(4)) }); buf = []; };
      cv.onpointerdown = e => {
        cv.setPointerCapture(e.pointerId);
        cur = { id: ++sid + '-' + S.id, c: eraser ? '#ffffff' : color, w: eraser ? 0.06 : size, p: pt(e) };
        strokes.push(cur); buf = cur.p.slice(); redraw();
      };
      cv.onpointermove = e => {
        if (!cur) return; const [x, y] = pt(e);
        cur.p.push(x, y); buf.push(x, y); redraw();
      };
      cv.onpointerup = cv.onpointercancel = () => { flush(); cur = null; };
      const iv = setInterval(flush, 50);
      cleanups.push(() => clearInterval(iv));
      view.querySelectorAll('.sw').forEach(b => b.onclick = () => { color = b.dataset.c; eraser = false; view.querySelectorAll('.sw').forEach(x => x.classList.toggle('on', x === b)); $('eraser').classList.remove('on'); });
      view.querySelectorAll('.sz').forEach(b => b.onclick = () => { size = +b.dataset.s; view.querySelectorAll('.sz').forEach(x => x.classList.toggle('on', x === b)); });
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
        <div class="rank">#${m.rank}</div><h2>of ${m.of} in ${esc(m.game)}</h2><p class="muted">${m.score} points</p>
        ${S.vip ? `<button class="btn" id="again" style="margin-top:14px">Play again</button><button class="btn ghost" id="lobby">Back to lobby</button>` : '<p class="muted">The 👑 player picks what\'s next</p>'}</div>`;
      if (S.vip) { $('again').onclick = () => sys('again'); $('lobby').onclick = () => sys('lobby'); }
    },
  };

  render();
})();
