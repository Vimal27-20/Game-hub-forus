// CLOSE CALL — "How many…?" number guessing. Closest wins; an exact hit gets a bonus.
// Spec: 003 R7 (new game), R6.1 (shared no-repeat `numbers` bank with Quiz Clash).
Hub.register({
  id: 'closecall', title: 'Close Call', emoji: '📏', genre: 'Estimation · Numbers', category: 'brains',
  tagline: 'Nobody knows the exact answer. Get closer than everyone else.',
  how: ['Read the question on the TV', 'Type your best guess on the number pad', 'Closest wins; hit it exactly for a big bonus'],
  min: 1, max: 12, time: '4 min', controls: 'Number pad', colors: ['#06d6a0', '#118ab2'],
  settings: [
    { id: 'count', label: 'Questions', options: [6, 8, 12], def: { quick: 6, standard: 8, long: 12 } },
    { id: 'timer', label: 'Answer time', options: [{ v: 20, label: '20 s' }, { v: 30, label: '30 s' }, { v: 40, label: '40 s' }], def: 30 },
  ],

  create(ctx) {
    const PRIZES = [1000, 600, 400], NEAR = 200, EXACT = 1000;
    const P = ctx.players, qs = ctx.pick('numbers', window.HUDDLE_CONTENT.numbers, ctx.settings.count);
    const exact = Object.fromEntries(P.map(p => [p.id, 0])), wins = Object.fromEntries(P.map(p => [p.id, 0]));
    let qi = -1, phase, t = 0, tMax = 1, q, g = {}, gain = {};
    const S = ctx.stage;
    const fmt = n => Number(n).toLocaleString('en-IE');
    const numUI = () => ({ ui: 'number', prompt: q.q, unit: q.unit, sub: `Question ${qi + 1} of ${qs.length}` });

    function next() {
      qi++;
      if (qi >= qs.length) return finish();
      q = qs[qi]; g = {}; gain = {}; phase = 'q'; t = tMax = ctx.settings.timer;
      P.forEach(p => ctx.send(p.id, numUI()));
      draw(); ctx.sfx('start');
    }
    function reveal() {
      phase = 'reveal'; t = 5;
      const list = Object.keys(g).map(id => ({ id, d: Math.abs(g[id] - q.a) })).sort((a, b) => a.d - b.d);
      let place = 0, prev = null;
      list.forEach((x, i) => {
        if (x.d !== prev) place = i; prev = x.d;
        let pts = PRIZES[place] || (x.d <= Math.abs(q.a) * 0.1 ? NEAR : 0);
        if (x.d === 0) { pts += EXACT; exact[x.id]++; }
        if (place === 0) wins[x.id]++;
        gain[x.id] = pts; if (pts) ctx.score(x.id, pts);
      });
      P.forEach(p => ctx.send(p.id, g[p.id] == null ? { ui: 'wait', big: '⌛', text: 'No guess!', sub: `Answer: ${fmt(q.a)} ${q.unit}` }
        : { ui: 'wait', big: gain[p.id] >= PRIZES[0] ? '🎯' : '📏', text: gain[p.id] ? `+${gain[p.id]}` : 'Not close enough', sub: `Answer: ${fmt(q.a)} ${q.unit} · you said ${fmt(g[p.id])}`, vibrate: gain[p.id] ? [40, 30, 40] : 120 }));
      ctx.sfx('win'); draw();
    }
    function afterReveal() {
      if ((qi + 1) % 3 === 0 && qi + 1 < qs.length) ctx.roundOver(`After ${qi + 1} of ${qs.length} questions`, next);
      else next();
    }
    function finish() {
      phase = 'done';
      const awards = [];
      const bull = P.slice().sort((a, b) => exact[b.id] - exact[a.id])[0];
      if (bull && exact[bull.id] > 0) awards.push({ id: bull.id, emoji: '🎯', title: `Bullseye · ${exact[bull.id]} exact answer${exact[bull.id] > 1 ? 's' : ''}` });
      const calc = P.slice().sort((a, b) => wins[b.id] - wins[a.id])[0];
      if (calc && wins[calc.id] > 0) awards.push({ id: calc.id, emoji: '🧮', title: `Human calculator · closest ${wins[calc.id]}×` });
      ctx.end({ awards });
    }

    function draw() {
      let body = '';
      if (phase === 'q') {
        body = `<div style="font-size:7rem">📏</div><div class="g-sub">Type your guess${q.unit ? ` in ${esc(q.unit)}` : ''} on your phone</div>
          <div class="p-row" style="margin-top:2.5rem">${P.map(p => `<div class="p-card ${g[p.id] != null ? 'done' : ''}"><div class="avatar" style="width:4.4rem;height:4.4rem;font-size:2.6rem;background:${p.color}">${p.emoji}</div><div class="nm">${esc(p.name)}</div></div>`).join('')}</div>`;
      } else if (phase === 'reveal') {
        const ids = Object.keys(g);
        const vals = ids.map(id => g[id]).concat([q.a]);
        let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
        if (hi === lo) { lo -= 1; hi += 1; }
        const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
        const X = v => ((v - lo) / (hi - lo)) * 100;
        body = `<div class="g-big" style="color:#06d6a0">${fmt(q.a)} <span style="font-size:2.2rem">${esc(q.unit)}</span></div>
          <div style="position:relative;width:84rem;height:11rem;margin-top:3rem">
            <div style="position:absolute;left:0;right:0;top:5.4rem;height:.4rem;background:rgba(255,255,255,.25);border-radius:1rem"></div>
            <div style="position:absolute;left:${X(q.a)}%;top:2.6rem;width:.5rem;height:6rem;margin-left:-.25rem;background:#06d6a0;border-radius:.3rem"></div>
            ${ids.map((id, i) => { const p = ctx.players.find(x => x.id === id); return `<div style="position:absolute;left:${X(g[id])}%;top:${i % 2 ? 6.4 : 0}rem;transform:translateX(-50%);text-align:center;font-size:1rem;font-weight:700">
              <div class="avatar" style="width:3rem;height:3rem;font-size:1.8rem;background:${p.color}">${p.emoji}</div><div>${fmt(g[id])}</div></div>`; }).join('')}
          </div>
          <div class="p-row" style="margin-top:1.5rem;font-size:1.4rem">${Object.keys(gain).filter(id => gain[id]).sort((a, b) => gain[b] - gain[a]).map(id => { const p = ctx.players.find(x => x.id === id); return `<span>${p.emoji} ${esc(p.name)} <b style="color:#3ddc84">+${gain[id]}</b></span>`; }).join(' · ')}</div>`;
      }
      S.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,#118ab255,transparent 60%),radial-gradient(ellipse at 50% 120%,#06d6a033,transparent 60%)"></div>
        <div class="timer-bar" id="ccBar"></div>
        <div class="g-top"><div class="g-pill">📏 Question ${qi + 1}/${qs.length}</div><div class="g-pill" id="ccT" style="font-size:2rem;min-width:5rem;text-align:center"></div></div>
        <div style="position:absolute;left:6rem;right:6rem;top:7rem;text-align:center;font-size:3.4rem;font-weight:800;line-height:1.15">${esc(q.q)}</div>
        <div class="g-center" style="top:12rem;bottom:5rem">${body}</div>`;
    }

    next();

    return {
      onInput(id, d) {
        if (phase !== 'q' || d.t !== 'number' || g[id] != null) return;
        const v = Number(d.v);
        if (!isFinite(v) || v < 0 || v > 1e12) return;
        g[id] = v;
        ctx.send(id, { ui: 'wait', big: '🔒', text: 'Locked in!', sub: `${fmt(v)} ${q.unit}` });
        draw(); ctx.sfx('tick');
        if (ctx.live().every(p => g[p.id] != null)) t = Math.min(t, 0.6);
      },
      onRejoin(id) { if (phase === 'q' && g[id] == null) ctx.send(id, numUI()); },
      update(dt) {
        t -= dt;
        const bar = document.getElementById('ccBar'), tt = document.getElementById('ccT');
        if (bar) bar.style.width = (phase === 'q' ? Math.max(0, t / tMax * 100) : 0) + '%';
        if (tt) tt.textContent = phase === 'q' ? Math.max(0, Math.ceil(t)) : '✓';
        if (t > 0) return;
        if (phase === 'q') reveal();
        else if (phase === 'reveal') afterReveal();
      },
    };
  },
});
