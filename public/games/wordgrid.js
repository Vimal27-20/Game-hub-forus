// WORD GRID — a shared letter grid on the TV; everyone traces words on their phone at once.
// Party take on the classic word-grid game (not affiliated with any brand).
// Spec: specs/004-word-grid-and-netflix-menu (R1, R2).
(function () {
  // English letter weights for word games; Q always comes as "Qu".
  const WEIGHTS = { E: 12, A: 8.5, R: 7.6, I: 7.5, O: 7.2, T: 6.9, N: 6.7, S: 5.7, L: 5.5, C: 4.5, U: 3.6, D: 3.4, P: 3.2,
    M: 3, H: 3, G: 2.5, B: 2.1, F: 1.8, Y: 1.8, W: 1.3, K: 1.1, V: 1, X: 0.3, Z: 0.3, J: 0.2, Q: 0.2 };
  const VOWELS = 'AEIOU';
  const BAG = Object.keys(WEIGHTS), TOTAL = BAG.reduce((s, k) => s + WEIGHTS[k], 0);
  const POINTS = [0, 0, 0, 1, 1, 2, 3, 5]; // by length; 8+ = 11 (R1.4)
  const points = len => (len >= 8 ? 11 : POINTS[len] || 0);

  let dictCache = null;
  function dictionary() {
    if (dictCache) return dictCache;
    const words = new Set(String((window.HUDDLE_CONTENT || {}).dict || '').split(' ').filter(Boolean));
    const pre = new Set();
    words.forEach(w => { for (let k = 1; k < w.length; k++) pre.add(w.slice(0, k)); });
    dictCache = { words, pre };
    return dictCache;
  }
  function neighbours(n) {
    const out = [];
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n, list = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if ((dr || dc) && rr >= 0 && cc >= 0 && rr < n && cc < n) list.push(rr * n + cc);
      }
      out.push(list);
    }
    return out;
  }
  // Every dictionary word on the board (DFS pruned by the prefix set).
  function solve(board, n, min) {
    const d = dictionary(), nb = neighbours(n), used = [], found = new Set();
    function walk(i, s) {
      const t = s + board[i].toLowerCase();
      const isWord = d.words.has(t), isPre = d.pre.has(t);
      if (!isWord && !isPre) return;
      if (isWord && t.length >= min) found.add(t);
      if (!isPre) return;
      used[i] = true;
      for (const j of nb[i]) if (!used[j]) walk(j, t);
      used[i] = false;
    }
    for (let i = 0; i < n * n; i++) walk(i, '');
    return found;
  }
  function roll() { let x = Math.random() * TOTAL; for (const k of BAG) { x -= WEIGHTS[k]; if (x <= 0) return k; } return 'E'; }
  // Random boards, accepted only if rich enough (R2.1); otherwise the best of 40 tries.
  function makeBoard(n, min) {
    const need = n === 4 ? 60 : 150, minVowels = n === 4 ? 4 : 6;
    let best = null;
    for (let tries = 0; tries < 40; tries++) {
      const b = [];
      for (let i = 0; i < n * n; i++) b.push(roll());
      let v = b.filter(l => VOWELS.indexOf(l) >= 0).length;
      while (v < minVowels) { const i = Math.random() * b.length | 0; if (VOWELS.indexOf(b[i]) < 0) { b[i] = VOWELS[Math.random() * 5 | 0]; v++; } }
      if (b.filter(l => l === 'Q').length > 1) continue;
      const board = b.map(l => (l === 'Q' ? 'QU' : l));
      const words = solve(board, n, min), long = [...words].some(w => w.length >= 6);
      if (!best || words.size > best.words.size) best = { board, words };
      if (words.size >= need && long) return { board, words };
    }
    return best;
  }
  window.WordGrid = { solve, points, makeBoard, neighbours };

  Hub.register({
    id: 'wordgrid', title: 'Word Grid', emoji: '🔠', genre: 'Words · Speed', category: 'brains',
    tagline: 'One letter grid, everyone hunting at once. Trace words on your phone before time runs out.',
    how: ['Drag across touching letters on your phone (diagonals count) and let go', 'Longer words score much more: 8+ letters is 11 points', 'A word nobody else found scores double at the end of the round'],
    min: 1, max: 12, time: '4 min', controls: 'Trace letters', colors: ['#ffb703', '#fb5607'],
    settings: [
      { id: 'rounds', label: 'Rounds', options: [2, 3, 5], def: { quick: 2, standard: 3, long: 5 } },
      { id: 'time', label: 'Round time', options: [{ v: 60, label: '60 s' }, { v: 90, label: '90 s' }, { v: 120, label: '2 min' }], def: { quick: 60, standard: 90, long: 120 } },
      { id: 'size', label: 'Board', options: [{ v: 4, label: '4 × 4' }, { v: 5, label: '5 × 5' }], def: 4 },
    ],

    create(ctx) {
      const P = ctx.players, byId = Object.fromEntries(P.map(p => [p.id, p]));
      const N = ctx.settings.size, MIN = N === 5 ? 4 : 3, ROUNDS = ctx.settings.rounds, TIME = ctx.settings.time;
      const d = dictionary(), nb = neighbours(N);
      const total = Object.fromEntries(P.map(p => [p.id, { words: 0, longest: '' }]));
      let round = 0, phase = 'count', t = 0, board, all, found, feed, reveal, last = {};
      const S = ctx.stage;

      function uiFor(id) {
        const f = found[id];
        return { ui: 'grid', board, n: N, min: MIN, round, rounds: ROUNDS, left: Math.max(0, Math.ceil(t)), count: f.size, score: ctx.scores()[id] || 0 };
      }
      function startRound() {
        round++;
        const b = makeBoard(N, MIN);
        board = b.board; all = b.words;
        found = Object.fromEntries(P.map(p => [p.id, new Set()]));
        feed = []; reveal = null; phase = 'count'; t = 3;
        ctx.sendAll({ ui: 'wait', big: '🔠', text: `Round ${round} of ${ROUNDS}`, sub: 'Get your tracing finger ready…' });
        draw(); ctx.sfx('tick');
      }
      function startPlay() {
        phase = 'play'; t = TIME;
        P.forEach(p => ctx.send(p.id, uiFor(p.id)));
        draw(); ctx.sfx('start');
      }
      function endRound() {
        phase = 'reveal'; t = 7;
        const owners = {};
        P.forEach(p => found[p.id].forEach(w => { (owners[w] = owners[w] || []).push(p.id); }));
        const unique = {};
        Object.keys(owners).forEach(w => {
          if (owners[w].length !== 1) return;
          const id = owners[w][0], pts = points(w.length);
          unique[id] = (unique[id] || 0) + pts;
        });
        Object.keys(unique).forEach(id => ctx.score(id, unique[id]));
        const foundAny = Object.keys(owners).sort((a, b) => b.length - a.length || a.localeCompare(b));
        const longest = foundAny[0];
        const missed = [...all].filter(w => !owners[w]).sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 6);
        reveal = { longest, longestBy: longest ? owners[longest] : [], unique, missed, total: Object.keys(owners).length };
        P.forEach(p => {
          total[p.id].words += found[p.id].size;
          found[p.id].forEach(w => { if (w.length > total[p.id].longest.length) total[p.id].longest = w; });
          ctx.send(p.id, { ui: 'wait', big: '⏱', text: `Time! ${found[p.id].size} word${found[p.id].size === 1 ? '' : 's'}`, sub: unique[p.id] ? `Unique bonus +${unique[p.id]}` : 'Look at the TV for the best words' });
        });
        ctx.sfx('win'); draw();
      }
      function finish() {
        const awards = [];
        const smith = P.slice().sort((a, b) => total[b.id].longest.length - total[a.id].longest.length)[0];
        if (smith && total[smith.id].longest) awards.push({ id: smith.id, emoji: '📜', title: `Wordsmith · "${total[smith.id].longest.toUpperCase()}"` });
        const vocab = P.slice().sort((a, b) => total[b.id].words - total[a.id].words)[0];
        if (vocab && total[vocab.id].words) awards.push({ id: vocab.id, emoji: '📚', title: `Walking dictionary · ${total[vocab.id].words} words` });
        ctx.end({ awards });
      }

      function boardHTML(big) {
        return `<div class="wg-board" style="grid-template-columns:repeat(${N},1fr);width:${big ? (N === 4 ? 34 : 38) : 20}rem">${board.map(l => `<div class="wg-tile">${l === 'QU' ? 'Qu' : l}</div>`).join('')}</div>`;
      }
      function sidebar() {
        const sc = ctx.scores();
        return `<div class="wg-side">${P.slice().sort((a, b) => sc[b.id] - sc[a.id]).map(p => `<div class="wg-row" style="opacity:${ctx.isConnected(p.id) ? 1 : 0.4}">
          <div class="avatar" style="width:2.8rem;height:2.8rem;font-size:1.7rem;background:${p.color}">${p.emoji}</div>
          <div class="wg-nm">${esc(p.name)}</div><div class="wg-ct">${found[p.id].size} 🔤</div><div class="wg-sc">${sc[p.id]}</div></div>`).join('')}
          <div class="wg-feed" id="wgFeed">${feed.slice(-6).map(f => `<div>${f}</div>`).join('')}</div></div>`;
      }
      function draw() {
        let body = '';
        if (phase === 'count') body = `<div class="g-center"><div class="g-sub" style="letter-spacing:.3em;text-transform:uppercase">Round ${round} of ${ROUNDS}</div><div class="g-big" style="font-size:12rem" id="wgCount">${Math.ceil(t)}</div><div class="g-sub">Words of ${MIN}+ letters · touching tiles · diagonals count</div></div>`;
        else if (phase === 'play') body = `<div class="wg-wrap">${boardHTML(true)}${sidebar()}</div>`;
        else if (phase === 'reveal' && reveal) {
          const lb = reveal.longestBy.map(id => esc(byId[id].name)).join(' & ');
          body = `<div class="wg-wrap">${boardHTML(false)}<div class="wg-reveal">
            <div class="g-sub" style="margin:0;letter-spacing:.25em;text-transform:uppercase">Longest word</div>
            <div class="g-big" style="font-size:4.4rem;color:#ffb703">${reveal.longest ? esc(reveal.longest.toUpperCase()) : '—'}</div>
            <div class="g-sub" style="margin-top:.4rem">${reveal.longest ? `by ${lb} · ${points(reveal.longest.length)} pts` : 'Nobody found a word!'}</div>
            ${Object.keys(reveal.unique).length ? `<div class="wg-chips">${Object.keys(reveal.unique).map(id => `<span class="chip">${byId[id].emoji} ${esc(byId[id].name)} unique bonus <b>+${reveal.unique[id]}</b></span>`).join('')}</div>` : ''}
            <div class="g-sub" style="margin-top:1.6rem;letter-spacing:.2em;text-transform:uppercase;font-size:1.1rem">Best words nobody found</div>
            <div class="wg-chips">${reveal.missed.map(w => `<span class="chip">${esc(w.toUpperCase())} · ${points(w.length)}</span>`).join('') || '<span class="chip">You found them all! 🤯</span>'}</div>
            <div class="g-sub" style="font-size:1.1rem">${reveal.total} of ${all.size} words found on this board</div></div></div>`;
        }
        S.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 20%,#fb560733,transparent 55%),radial-gradient(ellipse at 80% 90%,#ffb70322,transparent 60%),#120a06"></div>
          <div class="timer-bar" id="wgBar"></div>
          <div class="g-top"><div class="g-pill">🔠 Round ${round}/${ROUNDS} · ${N}×${N}</div><div class="g-pill" id="wgT" style="font-size:2rem;min-width:5rem;text-align:center"></div></div>${body}`;
      }
      function sidebarRefresh() { if (phase !== 'play') return; const side = S.querySelector('.wg-side'); if (side) side.outerHTML = sidebar(); }

      startRound();

      return {
        onInput(id, msg) {
          if (phase !== 'play' || msg.t !== 'word' || !Array.isArray(msg.path)) return;
          if (last[id] != null && ctx.time - last[id] < 0.08) return; // one word per swipe (game time)
          last[id] = ctx.time;
          const path = msg.path.slice(0, N * N).map(x => x | 0);
          const fb = r => ctx.send(id, { wg: Object.assign({ count: found[id].size, score: ctx.scores()[id] }, r) });
          const okPath = path.every((x, i) => x >= 0 && x < N * N && path.indexOf(x) === i && (i === 0 || nb[path[i - 1]].indexOf(x) >= 0));
          if (!okPath || !path.length) return fb({ ok: false, reason: 'path' });
          const word = path.map(i => board[i]).join('').toLowerCase();
          if (word.length < MIN) return fb({ ok: false, word, reason: 'short' });
          if (!d.words.has(word)) return fb({ ok: false, word, reason: 'unknown' });
          if (found[id].has(word)) return fb({ ok: false, word, reason: 'again' });
          found[id].add(word);
          const pts = points(word.length);
          ctx.score(id, pts);
          feed.push(`${byId[id].emoji} <b>${esc(byId[id].name)}</b> found a ${word.length}-letter word${word.length >= 6 ? '! 🔥' : ''}`);
          if (word.length >= 6) ctx.sfx('good'); else ctx.sfx('pop');
          fb({ ok: true, word, pts });
          sidebarRefresh();
        },
        onRejoin(id) { if (phase === 'play') ctx.send(id, uiFor(id)); },
        update(dt) {
          t -= dt;
          const tt = document.getElementById('wgT'), bar = document.getElementById('wgBar');
          if (tt) { tt.textContent = phase === 'play' ? Math.max(0, Math.ceil(t)) : phase === 'count' ? '…' : '✓'; tt.style.color = phase === 'play' && t < 10 ? '#ff6b6b' : ''; }
          if (bar) bar.style.width = (phase === 'play' ? Math.max(0, t / TIME * 100) : 0) + '%';
          const cnt = document.getElementById('wgCount'); if (cnt) cnt.textContent = Math.max(1, Math.ceil(t));
          if (t > 0) return;
          if (phase === 'count') startPlay();
          else if (phase === 'play') endRound();
          else if (phase === 'reveal') {
            phase = 'between';
            ctx.roundOver(`Round ${round} of ${ROUNDS} · ${reveal.total} words found`, () => (round < ROUNDS ? startRound() : finish()));
          }
        },
      };
    },
  });
})();
