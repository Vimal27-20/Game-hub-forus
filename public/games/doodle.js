// DOODLE DASH — one player draws on their phone, it appears live on the TV, everyone else guesses.
Hub.register({
  id: 'doodle', title: 'Doodle Dash', emoji: '🎨', genre: 'Drawing · Guessing',
  tagline: 'Draw on your phone, watch it appear live on the TV, and race to guess what it is.',
  min: 2, max: 12, time: '8 min', controls: 'Draw + type guesses', colors: ['#00b4d8', '#90e0ef'],

  create(ctx) {
    const WORDS = ['cat', 'house', 'pizza', 'rocket', 'banana', 'guitar', 'snowman', 'rainbow', 'bicycle', 'castle',
      'spider', 'umbrella', 'volcano', 'robot', 'dragon', 'cupcake', 'tree', 'fish', 'sun', 'car', 'ghost', 'crown',
      'penguin', 'lighthouse', 'pirate', 'tornado', 'mermaid', 'cactus', 'dinosaur', 'glasses', 'balloon', 'ladder',
      'octopus', 'clock', 'helicopter', 'sandwich', 'toothbrush', 'treasure', 'unicorn', 'whale', 'airplane', 'bridge',
      'camera', 'candle', 'carrot', 'cloud', 'diamond', 'drum', 'elephant', 'fire', 'flower', 'giraffe', 'hamburger',
      'island', 'kite', 'moon', 'mountain', 'mushroom', 'pumpkin', 'scissors', 'snail', 'tent', 'train', 'waterfall', 'sheep'];
    const DRAW_T = 75, P = ctx.players, byId = Object.fromEntries(P.map(p => [p.id, p]));
    const scores = Object.fromEntries(P.map(p => [p.id, 0]));
    const drawers = shuffle(P.map(p => p.id)).slice(0, 8);
    const used = new Set();
    let ti = -1, phase, t = 0, tMax = 1, drawer, word, choices, strokes, guessed, feed, shown;
    const S = ctx.stage;

    S.innerHTML = `<div style="position:absolute;inset:0;background:linear-gradient(160deg,#03304a,#071422)"></div>
      <div class="timer-bar" id="dBar"></div>
      <div class="g-top"><div class="g-pill" id="dTurn"></div><div class="g-pill" id="dTime" style="font-size:1.8rem;min-width:5rem;text-align:center"></div></div>
      <div id="dHint" style="position:absolute;top:2.2rem;left:0;right:0;text-align:center;font-size:2.6rem;font-weight:900;letter-spacing:.4em;pointer-events:none"></div>
      <div style="position:absolute;left:3rem;top:7rem;bottom:3rem;width:60rem;display:flex;align-items:center">
        <div style="position:relative;width:min(100%,calc((100vh - 10rem) * 4 / 3));aspect-ratio:4/3;background:#fff;border-radius:1rem;box-shadow:0 2rem 4rem rgba(0,0,0,.5);overflow:hidden">
          <canvas id="dCv" style="width:100%;height:100%;display:block"></canvas>
          <div id="dOver" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#111"></div></div></div>
      <div style="position:absolute;right:3rem;top:7rem;bottom:3rem;width:30rem;display:flex;flex-direction:column;gap:1rem">
        <div id="dPlayers" style="display:flex;flex-direction:column;gap:.5rem"></div>
        <div id="dFeed" style="flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;gap:.4rem;font-size:1.2rem"></div></div>`;
    const cv = document.getElementById('dCv'), g = cv.getContext('2d');
    const $ = id => document.getElementById(id);

    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
    function lev(a, b) {
      const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
      for (let j = 1; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
        m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return m[a.length][b.length];
    }
    const hint = () => word.split('').map((c, i) => shown.has(i) ? c.toUpperCase() : '_').join(' ');
    const guessers = () => P.filter(p => p.id !== drawer && ctx.isConnected(p.id));

    function nextTurn() {
      ti++;
      while (ti < drawers.length && !ctx.isConnected(drawers[ti])) ti++;
      if (ti >= drawers.length) { phase = 'done'; return ctx.end(P.map(p => ({ id: p.id, score: scores[p.id] }))); }
      drawer = drawers[ti]; strokes = []; guessed = new Map(); feed = []; shown = new Set();
      choices = shuffle(WORDS.filter(w => !used.has(w))).slice(0, 3);
      phase = 'choose'; t = tMax = 12;
      ctx.send(drawer, { ui: 'choices', prompt: 'Pick a word to draw', layout: 'list', options: choices.map(w => ({ id: w, label: w.toUpperCase() })), vibrate: [50, 40, 50] });
      P.filter(p => p.id !== drawer).forEach(p => ctx.send(p.id, { ui: 'wait', big: '✏️', text: `${byId[drawer].name} is choosing a word…`, sub: 'Get your guessing fingers ready' }));
      $('dOver').innerHTML = `<div style="font-size:6rem">${byId[drawer].emoji}</div><div style="font-size:3rem;font-weight:900">${esc(byId[drawer].name)} is up!</div><div style="font-size:1.4rem;color:#555;margin-top:.6rem">Choosing a word on their phone…</div>`;
      $('dHint').textContent = '';
      renderSide(); ctx.sfx('start');
    }
    function startDraw(w) {
      word = w; used.add(w); phase = 'draw'; t = tMax = DRAW_T;
      $('dOver').innerHTML = '';
      ctx.send(drawer, { ui: 'draw', word: word.toUpperCase() });
      guessers().forEach(p => ctx.send(p.id, { ui: 'guess', prompt: `Guess ${byId[drawer].name}'s drawing!`, hint: hint() }));
      $('dHint').textContent = hint();
      renderSide();
    }
    function endTurn() {
      phase = 'reveal'; t = 5;
      $('dOver').innerHTML = `<div style="background:rgba(255,255,255,.88);padding:2rem 4rem;border-radius:1rem"><div style="font-size:1.4rem;letter-spacing:.3em;color:#666">THE WORD WAS</div>
        <div style="font-size:5rem;font-weight:900">${esc(word.toUpperCase())}</div><div style="font-size:1.4rem;color:#444">${guessed.size} of ${guessers().length} guessed it</div></div>`;
      $('dHint').textContent = word.toUpperCase().split('').join(' ');
      ctx.sfx(guessed.size ? 'win' : 'bad');
      P.forEach(p => ctx.send(p.id, { ui: 'wait', big: p.id === drawer ? '🎨' : guessed.has(p.id) ? '🎉' : '🤷', text: `It was "${word}"`, sub: `${scores[p.id]} points so far` }));
    }

    function renderSide() {
      $('dTurn').textContent = `🎨 Turn ${ti + 1} of ${drawers.length}`;
      const sorted = P.slice().sort((a, b) => scores[b.id] - scores[a.id]);
      $('dPlayers').innerHTML = sorted.map(p => {
        const state = p.id === drawer ? '✏️ drawing' : guessed && guessed.has(p.id) ? `✅ +${guessed.get(p.id)}` : '';
        return `<div style="display:flex;align-items:center;gap:.8rem;background:${guessed && guessed.has(p.id) ? '#3ddc8422' : 'rgba(255,255,255,.05)'};border-radius:.6rem;padding:.5rem .8rem;font-size:1.25rem;font-weight:700">
          <div class="avatar" style="width:2.6rem;height:2.6rem;font-size:1.6rem;background:${p.color}">${p.emoji}</div>
          <div style="flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(p.name)}</div><div style="color:#9fe;font-size:1rem">${state}</div><div style="width:3.5rem;text-align:right">${scores[p.id]}</div></div>`;
      }).join('');
      $('dFeed').innerHTML = (feed || []).slice(-9).map(f => `<div style="opacity:.9">${f}</div>`).join('');
    }

    function paint() {
      const r = cv.getBoundingClientRect();
      if (cv.width !== Math.round(r.width * 1.5)) { cv.width = Math.round(r.width * 1.5); cv.height = Math.round(r.height * 1.5); }
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      g.lineCap = g.lineJoin = 'round';
      for (const s of strokes || []) {
        g.strokeStyle = s.c; g.lineWidth = s.w * cv.width; g.beginPath();
        for (let i = 0; i < s.p.length; i += 2) { const x = s.p[i] * cv.width, y = s.p[i + 1] * cv.height; i ? g.lineTo(x, y) : g.moveTo(x, y); }
        if (s.p.length === 2) g.lineTo(s.p[0] * cv.width + 0.1, s.p[1] * cv.height);
        g.stroke();
      }
    }

    nextTurn();

    return {
      onInput(id, d) {
        if (phase === 'choose' && id === drawer && d.t === 'choice' && choices.includes(d.id)) return startDraw(d.id);
        if (phase !== 'draw') return;
        if (id === drawer) {
          if (d.t === 'pts' && Array.isArray(d.p)) {
            let s = strokes.find(x => x.id === d.s);
            if (!s) { s = { id: String(d.s), c: /^#[0-9a-f]{6}$/i.test(d.c) ? d.c : '#111', w: Math.min(0.08, Math.max(0.002, +d.w || 0.01)), p: [] }; strokes.push(s); }
            for (const v of d.p.slice(0, 600)) s.p.push(Math.max(0, Math.min(1, +v || 0)));
          } else if (d.t === 'undo') strokes = strokes.filter(s => s.id !== d.s);
          else if (d.t === 'clear') strokes = [];
          return;
        }
        if (d.t !== 'guess' || guessed.has(id)) return;
        const p = byId[id], gs = norm(d.text);
        if (!gs) return;
        if (gs === norm(word)) {
          const pts = Math.round(100 + 200 * t / DRAW_T) + (guessed.size === 0 ? 50 : 0);
          guessed.set(id, pts); scores[id] += pts; scores[drawer] += 60;
          feed.push(`<b style="color:#3ddc84">${p.emoji} ${esc(p.name)} got it! +${pts}</b>`);
          ctx.send(id, { ui: 'wait', big: '🎉', text: `You got it! +${pts}`, sub: `The word is "${word}"`, vibrate: [40, 30, 40] });
          ctx.send(drawer, { note: `${p.name} guessed it! +60 for you`, vibrate: 40 });
          ctx.sfx('good');
          if (guessers().every(x => guessed.has(x.id))) t = Math.min(t, 1);
          else if (guessed.size === 1) t = Math.min(t, Math.max(20, t * 0.7)); // speed up after first correct guess
        } else {
          const close = gs.length > 3 && lev(gs, norm(word)) === 1;
          feed.push(`${p.emoji} <b>${esc(p.name)}</b>: ${esc(String(d.text).slice(0, 30))}`);
          if (close) ctx.send(id, { note: 'So close! 🔥' });
        }
        renderSide();
      },
      onLeave(id) { if (id === drawer && (phase === 'draw' || phase === 'choose')) endTurn(); },
      update(dt) {
        t -= dt;
        $('dBar').style.width = (phase === 'draw' || phase === 'choose' ? Math.max(0, t / tMax * 100) : 0) + '%';
        $('dTime').textContent = phase === 'draw' || phase === 'choose' ? Math.max(0, Math.ceil(t)) : '';
        if (phase === 'draw') {
          const frac = 1 - t / DRAW_T, want = frac > 0.75 ? 2 : frac > 0.5 ? 1 : 0;
          const limit = Math.max(0, Math.floor(word.length / 2) - 1);
          while (shown.size < Math.min(want, limit)) {
            const i = shuffle([...word].map((_, i) => i).filter(i => !shown.has(i)))[0];
            shown.add(i); $('dHint').textContent = hint();
            guessers().filter(p => !guessed.has(p.id)).forEach(p => ctx.send(p.id, { ui: 'guess', prompt: `Guess ${byId[drawer].name}'s drawing!`, hint: hint(), sub: 'Hint revealed!' }));
          }
        }
        paint();
        if (t > 0) return;
        if (phase === 'choose') startDraw(choices[0]);
        else if (phase === 'draw') endTurn();
        else if (phase === 'reveal') nextTurn();
      },
    };
  },
});
