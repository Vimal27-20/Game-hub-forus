// DOODLE DASH — one player draws on their phone, it appears live on the TV, everyone guesses.
// Spec: 001 R8, 003 (fresh content R6.1, rejoin R2.3).
Hub.register({
  id: 'doodle', title: 'Doodle Dash', emoji: '🎨', genre: 'Drawing · Guessing', category: 'creative',
  tagline: 'Draw on your phone, watch it appear on the TV, and race to guess.',
  how: ['When it\'s your turn, pick a word and draw it on your phone', 'Everyone else types guesses: faster guesses score more', 'Harder words are worth more points'],
  min: 2, max: 12, time: '6 min', controls: 'Draw + type guesses', colors: ['#00b4d8', '#90e0ef'],
  settings: [
    { id: 'turns', label: 'Drawing turns', options: [4, 6, 8], def: { quick: 4, standard: 6, long: 8 } },
    { id: 'drawTime', label: 'Draw time', options: [{ v: 60, label: '60 s' }, { v: 75, label: '75 s' }, { v: 90, label: '90 s' }], def: 75 },
    { id: 'words', label: 'Words', options: [{ v: 'easy', label: 'Easy' }, { v: 'mixed', label: 'Mixed' }, { v: 'hard', label: 'Hard' }], def: 'mixed' },
  ],

  create(ctx) {
    const W = window.HUDDLE_CONTENT.words, MULT = { easy: 1, medium: 1.25, hard: 1.5 };
    const DRAW_T = ctx.settings.drawTime, P = ctx.players, byId = Object.fromEntries(P.map(p => [p.id, p]));
    const order = ctx.shuffle(P.map(p => p.id));
    const drawers = Array.from({ length: Math.max(ctx.settings.turns, 1) }, (_, i) => order[i % order.length]);
    const art = {}, quick = {};
    P.forEach(p => { art[p.id] = 0; quick[p.id] = 99; });
    let ti = -1, phase, t = 0, tMax = 1, drawer, word, tier, choices, strokes, guessed, feed, shown;
    const S = ctx.stage;
    S.innerHTML = `<div style="position:absolute;inset:0;background:linear-gradient(160deg,#03304a,#071422)"></div>
      <div class="timer-bar" id="dBar"></div>
      <div class="g-top"><div class="g-pill" id="dTurn"></div><div class="g-pill" id="dTime" style="font-size:1.8rem;min-width:5rem;text-align:center"></div></div>
      <div id="dHint" style="position:absolute;top:2.2rem;left:0;right:0;text-align:center;font-size:2.6rem;font-weight:900;letter-spacing:.3em;pointer-events:none;white-space:pre"></div>
      <div style="position:absolute;left:3rem;top:7rem;bottom:5rem;width:60rem;display:flex;align-items:center">
        <div style="position:relative;width:100%;max-height:100%;aspect-ratio:4/3;background:#fff;border-radius:1rem;box-shadow:0 2rem 4rem rgba(0,0,0,.5);overflow:hidden">
          <canvas id="dCv" style="width:100%;height:100%;display:block"></canvas>
          <div id="dOver" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#111"></div></div></div>
      <div style="position:absolute;right:3rem;top:7rem;bottom:5rem;width:30rem;display:flex;flex-direction:column;gap:1rem">
        <div id="dPlayers" style="display:flex;flex-direction:column;gap:.5rem"></div>
        <div id="dFeed" style="flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:.4rem;font-size:1.2rem"></div></div>`;
    const $ = id => S.querySelector('#' + id);
    const cv = $('dCv'), g = cv.getContext('2d');

    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    function lev(a, b) {
      const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
      for (let j = 1; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
        m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return m[a.length][b.length];
    }
    const isLetter = c => /[a-z]/i.test(c);
    const hint = () => word.split('').map((c, i) => (!isLetter(c) ? (c === ' ' ? ' ' : c) : shown.has(i) ? c.toUpperCase() : '_')).join(' ');
    const guessers = () => P.filter(p => p.id !== drawer && ctx.isConnected(p.id));
    const guessUI = sub => ({ ui: 'guess', prompt: `Guess ${byId[drawer].name}'s drawing!`, hint: hint(), sub });

    function pickChoices() {
      const tiers = ctx.settings.words === 'mixed' ? ['easy', 'medium', 'hard'] : [ctx.settings.words, ctx.settings.words, ctx.settings.words === 'easy' ? 'medium' : 'hard'];
      const out = [];
      tiers.forEach(tr => {
        const w = ctx.pick('words-' + tr, W[tr].filter(x => out.every(o => o.w !== x)), 1)[0];
        out.push({ w, tier: tr });
      });
      return out;
    }
    function nextTurn() {
      ti++;
      while (ti < drawers.length && !ctx.isConnected(drawers[ti])) ti++;
      if (ti >= drawers.length) return finish();
      drawer = drawers[ti]; strokes = []; guessed = new Map(); feed = []; shown = new Set();
      choices = pickChoices();
      phase = 'choose'; t = tMax = 12;
      ctx.send(drawer, { ui: 'choices', prompt: 'Pick a word to draw', layout: 'list', vibrate: [50, 40, 50],
        options: choices.map(c => ({ id: c.w, label: `${c.w.toUpperCase()}  ·  ${c.tier}` })) });
      P.filter(p => p.id !== drawer).forEach(p => ctx.send(p.id, { ui: 'wait', big: '✏️', text: `${byId[drawer].name} is choosing a word…`, sub: 'Get your guessing fingers ready' }));
      $('dOver').innerHTML = `<div style="font-size:6rem">${byId[drawer].emoji}</div><div style="font-size:3rem;font-weight:900">${esc(byId[drawer].name)} is up!</div><div style="font-size:1.4rem;color:#555;margin-top:.6rem">Choosing a word on their phone…</div>`;
      $('dHint').textContent = '';
      renderSide(); ctx.sfx('start');
    }
    function startDraw(c) {
      word = c.w; tier = c.tier; phase = 'draw'; t = tMax = DRAW_T;
      $('dOver').innerHTML = '';
      ctx.send(drawer, { ui: 'draw', word: word.toUpperCase() });
      guessers().forEach(p => ctx.send(p.id, guessUI()));
      $('dHint').textContent = hint();
      renderSide();
    }
    function endTurn() {
      phase = 'reveal'; t = 2.5;
      if (guessed.size) art[drawer] += guessed.size;
      $('dOver').innerHTML = `<div style="background:rgba(255,255,255,.9);padding:2rem 4rem;border-radius:1rem"><div style="font-size:1.4rem;letter-spacing:.3em;color:#666">THE WORD WAS</div>
        <div style="font-size:5rem;font-weight:900">${esc(word.toUpperCase())}</div><div style="font-size:1.4rem;color:#444">${guessed.size} of ${guessers().length} guessed it</div></div>`;
      $('dHint').textContent = word.toUpperCase().split('').join(' ');
      ctx.sfx(guessed.size ? 'win' : 'bad');
    }
    function finish() {
      phase = 'done';
      const awards = [];
      const pic = P.slice().sort((a, b) => art[b.id] - art[a.id])[0];
      if (pic && art[pic.id] > 0) awards.push({ id: pic.id, emoji: '🖼️', title: `Picasso · ${art[pic.id]} correct guesses on their art` });
      const fast = P.slice().sort((a, b) => quick[a.id] - quick[b.id])[0];
      if (fast && quick[fast.id] < 99) awards.push({ id: fast.id, emoji: '⚡', title: `Sharpest eye · guessed in ${quick[fast.id].toFixed(1)} s` });
      ctx.end({ awards });
    }

    function renderSide() {
      $('dTurn').textContent = `🎨 Turn ${ti + 1} of ${drawers.length}${tier && phase !== 'choose' ? ` · ${tier}` : ''}`;
      const sc = ctx.scores();
      $('dPlayers').innerHTML = P.slice().sort((a, b) => sc[b.id] - sc[a.id]).map(p => {
        const state = p.id === drawer ? '✏️ drawing' : guessed && guessed.has(p.id) ? `✅ +${guessed.get(p.id)}` : '';
        return `<div style="display:flex;align-items:center;gap:.8rem;background:${guessed && guessed.has(p.id) ? '#3ddc8422' : 'rgba(255,255,255,.05)'};border-radius:.6rem;padding:.5rem .8rem;font-size:1.25rem;font-weight:700;opacity:${ctx.isConnected(p.id) ? 1 : 0.4}">
          <div class="avatar" style="width:2.6rem;height:2.6rem;font-size:1.6rem;background:${p.color}">${p.emoji}</div>
          <div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(p.name)}</div><div style="color:#9fe;font-size:1rem">${state}</div><div style="width:3.5rem;text-align:right">${sc[p.id]}</div></div>`;
      }).join('');
      $('dFeed').innerHTML = (feed || []).slice(-9).map(f => `<div style="opacity:.9">${f}</div>`).join('');
    }

    function paint() {
      const r = cv.getBoundingClientRect();
      if (r.width && cv.width !== Math.round(r.width * 1.5)) { cv.width = Math.round(r.width * 1.5); cv.height = Math.round(r.height * 1.5); }
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.lineCap = g.lineJoin = 'round';
      for (const s of strokes || []) {
        g.strokeStyle = s.c; g.lineWidth = s.w * cv.width; g.beginPath();
        for (let i = 0; i < s.p.length; i += 2) { const x = s.p[i] * cv.width, y = s.p[i + 1] * cv.height; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        if (s.p.length === 2) g.lineTo(s.p[0] * cv.width + 0.1, s.p[1] * cv.height);
        g.stroke();
      }
    }

    nextTurn();

    return {
      onInput(id, d) {
        if (phase === 'choose' && id === drawer && d.t === 'choice') {
          const c = choices.find(x => x.w === d.id);
          return c && startDraw(c);
        }
        if (phase !== 'draw') return;
        if (id === drawer) {
          if (d.t === 'pts' && Array.isArray(d.p)) {
            let s = strokes.find(x => x.id === d.s);
            if (!s) {
              if (strokes.length > 600) return;
              s = { id: String(d.s).slice(0, 40), c: /^#[0-9a-f]{6}$/i.test(d.c) ? d.c : '#111', w: Math.min(0.08, Math.max(0.002, +d.w || 0.01)), p: [] };
              strokes.push(s);
            }
            for (const v of d.p.slice(0, 600)) if (s.p.length < 20000) s.p.push(Math.max(0, Math.min(1, +v || 0)));
          } else if (d.t === 'undo') strokes = strokes.filter(s => s.id !== d.s);
          else if (d.t === 'clear') strokes = [];
          return;
        }
        if (d.t !== 'guess' || guessed.has(id)) return;
        const p = byId[id], gs = norm(d.text);
        if (!gs) return;
        if (gs === norm(word)) {
          const pts = Math.round((100 + 200 * t / DRAW_T + (guessed.size === 0 ? 50 : 0)) * MULT[tier]);
          guessed.set(id, pts); ctx.score(id, pts); ctx.score(drawer, Math.round(60 * MULT[tier]));
          quick[id] = Math.min(quick[id], DRAW_T - t);
          feed.push(`<b style="color:#3ddc84">${p.emoji} ${esc(p.name)} got it! +${pts}</b>`);
          ctx.send(id, { ui: 'wait', big: '🎉', text: `You got it! +${pts}`, sub: `The word is "${word}"`, vibrate: [40, 30, 40] });
          ctx.send(drawer, { note: `${p.name} guessed it!`, vibrate: 40 });
          ctx.sfx('good');
          if (guessers().every(x => guessed.has(x.id))) t = Math.min(t, 1);
          else if (guessed.size === 1) t = Math.min(t, Math.max(20, t * 0.7)); // speed up after the first correct guess
        } else {
          const close = gs.length > 3 && lev(gs, norm(word)) === 1;
          feed.push(`${p.emoji} <b>${esc(p.name)}</b>: ${esc(String(d.text).slice(0, 30))}`);
          if (close) ctx.send(id, { note: 'So close! 🔥' });
        }
        renderSide();
      },
      onLeave(id) { if (id === drawer && (phase === 'draw' || phase === 'choose')) endTurn(); else renderSide(); },
      onRejoin(id) {
        if (phase === 'draw' && id !== drawer && !guessed.has(id)) ctx.send(id, guessUI());
        renderSide();
      },
      update(dt) {
        t -= dt;
        $('dBar').style.width = (phase === 'draw' || phase === 'choose' ? Math.max(0, t / tMax * 100) : 0) + '%';
        $('dTime').textContent = phase === 'draw' || phase === 'choose' ? Math.max(0, Math.ceil(t)) : '';
        if (phase === 'draw') {
          const frac = 1 - t / DRAW_T, want = frac > 0.75 ? 2 : frac > 0.5 ? 1 : 0;
          const letters = word.split('').map((c, i) => (isLetter(c) ? i : -1)).filter(i => i >= 0);
          const limit = Math.max(0, Math.floor(letters.length / 2) - 1);
          while (shown.size < Math.min(want, limit)) {
            shown.add(ctx.shuffle(letters.filter(i => !shown.has(i)))[0]); $('dHint').textContent = hint();
            guessers().filter(p => !guessed.has(p.id)).forEach(p => ctx.send(p.id, guessUI('Hint revealed!')));
          }
        }
        paint();
        if (t > 0) return;
        if (phase === 'choose') startDraw(choices[0]);
        else if (phase === 'draw') endTurn();
        else if (phase === 'reveal') {
          phase = 'between';
          ctx.roundOver(`Turn ${ti + 1} of ${drawers.length} · it was "${word}"`, nextTurn);
        }
      },
    };
  },
});
