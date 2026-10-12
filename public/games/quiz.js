// QUIZ CLASH — fast trivia: 4-choice, true/false and closest-number questions.
// Spec: 001 R8, 003 (fresh content R6.1, styles R6.4, rejoin R2.3).
Hub.register({
  id: 'quiz', title: 'Quiz Clash', emoji: '🧠', genre: 'Trivia · Speed', category: 'brains',
  tagline: 'Rapid-fire trivia on the big screen. Answer fast for big points and keep your streak alive.',
  how: ['Read the question on the TV', 'Answer on your phone: faster answers score more', 'Number questions: the closest guess wins'],
  min: 1, max: 12, time: '5 min', controls: 'Answer buttons + number pad', colors: ['#7b2ff7', '#f107a3'],
  settings: [
    { id: 'count', label: 'Questions', options: [8, 12, 16], def: { quick: 8, standard: 12, long: 16 } },
    { id: 'timer', label: 'Answer time', options: [{ v: 10, label: '10 s' }, { v: 15, label: '15 s' }, { v: 20, label: '20 s' }], def: 15 },
  ],

  create(ctx) {
    const C = window.HUDDLE_CONTENT;
    const P = ctx.players, N = ctx.settings.count, QTIME = ctx.settings.timer, PER_ROUND = 4;
    const SLOTS = [
      { color: '#e21b3c', shape: '▲' }, { color: '#1368ce', shape: '◆' },
      { color: '#d89e00', shape: '●' }, { color: '#26890c', shape: '■' },
    ];
    const TF = [{ color: '#26890c', shape: '✔' }, { color: '#e21b3c', shape: '✖' }];
    const st = Object.fromEntries(P.map(p => [p.id, { ans: null, at: 0, gain: 0, streak: 0, best: 0, rightT: [], num: null }]));

    // Build the question list: ~2 number questions, ~1 in 5 true/false, rest 4-choice. No repeats this session.
    const nNum = Math.max(1, Math.round(N / 6));
    const bank = ctx.pick('quiz', C.quiz, N - nNum, q => q.q);
    const nums = ctx.pick('numbers', C.numbers, nNum);
    const qs = bank.map(item => {
      if ('tf' in item) return { kind: 'tf', c: item.c, q: item.q, opts: ['True', 'False'], correct: item.tf ? 0 : 1 };
      const opts = ctx.shuffle([item.a].concat(item.w));
      return { kind: 'choice', c: item.c, q: item.q, opts, correct: opts.indexOf(item.a) };
    });
    nums.forEach((x, i) => qs.splice(Math.min(qs.length, 3 + i * 5), 0, { kind: 'num', c: 'Closest number', q: x.q, a: x.a, unit: x.unit }));
    let qi = -1, phase = 'q', t = 0, q = null;
    const S = ctx.stage;
    const slots = () => (q.kind === 'tf' ? TF : SLOTS);
    const fmt = n => Number(n).toLocaleString('en-IE');

    function uiFor(id) {
      const s = st[id];
      if (phase !== 'q') return null;
      if (s.ans != null || s.num != null) return { ui: 'wait', big: '🔒', text: 'Locked in!', sub: q.kind === 'num' ? `${fmt(s.num)} ${q.unit}` : q.opts[s.ans] };
      if (q.kind === 'num') return { ui: 'number', prompt: q.q, unit: q.unit, sub: 'Closest guess wins' };
      return { ui: 'choices', prompt: `Question ${qi + 1} of ${qs.length}`, layout: q.kind === 'tf' ? 'list' : 'grid',
        options: q.opts.map((o, i) => ({ id: i, label: o, color: slots()[i].color, shape: slots()[i].shape })), sub: 'Look at the TV for the question' };
    }
    function next() {
      qi++;
      if (qi >= qs.length) return finish();
      q = qs[qi]; phase = 'q'; t = q.kind === 'num' ? QTIME + 10 : QTIME;
      P.forEach(p => { Object.assign(st[p.id], { ans: null, num: null, gain: 0 }); ctx.send(p.id, uiFor(p.id)); });
      draw(); ctx.sfx('start');
    }
    function reveal() {
      phase = 'reveal'; t = 3.2;
      if (q.kind === 'num') {
        const guesses = P.filter(p => st[p.id].num != null).map(p => ({ id: p.id, d: Math.abs(st[p.id].num - q.a) }))
          .sort((a, b) => a.d - b.d);
        const prizes = [1000, 700, 500];
        let place = 0, prev = null;
        guesses.forEach((g, i) => {
          if (g.d !== prev) place = i; prev = g.d;
          let pts = prizes[place] || (g.d <= q.a * 0.1 ? 300 : 100);
          if (g.d === 0) pts += 500;
          st[g.id].gain = pts; ctx.score(g.id, pts);
        });
      } else {
        for (const p of P) {
          const s = st[p.id];
          if (s.ans === q.correct) {
            s.streak++; s.best = Math.max(s.best, s.streak); s.rightT.push(s.at);
            s.gain = Math.round(500 + 500 * Math.max(0, QTIME - s.at) / QTIME) + (s.streak >= 3 ? 100 : 0);
            ctx.score(p.id, s.gain);
          } else s.streak = 0;
        }
      }
      for (const p of P) {
        const s = st[p.id], ok = s.gain > 0;
        const answer = q.kind === 'num' ? `${fmt(q.a)} ${q.unit}` : q.opts[q.correct];
        ctx.send(p.id, ok
          ? { ui: 'wait', big: q.kind === 'num' ? '🎯' : '✅', text: `+${s.gain}`, sub: q.kind === 'num' ? `Answer: ${answer} · you said ${fmt(s.num)}` : s.streak >= 3 ? `🔥 ${s.streak} in a row` : 'Correct!', vibrate: [40, 30, 40] }
          : { ui: 'wait', big: s.ans == null && s.num == null ? '⌛' : '❌', text: s.ans == null && s.num == null ? 'Too slow!' : 'Not this time', sub: `Answer: ${answer}`, vibrate: 200 });
      }
      ctx.sfx('good'); draw();
    }
    function afterReveal() {
      if ((qi + 1) % PER_ROUND === 0 && qi + 1 < qs.length) ctx.roundOver(`After ${qi + 1} of ${qs.length} questions`, next);
      else next();
    }
    function finish() {
      phase = 'done';
      const awards = [];
      const fast = P.filter(p => st[p.id].rightT.length >= 2).map(p => ({ p, avg: st[p.id].rightT.reduce((a, b) => a + b, 0) / st[p.id].rightT.length }))
        .sort((a, b) => a.avg - b.avg)[0];
      if (fast) awards.push({ id: fast.p.id, emoji: '⚡', title: `Speed demon · ${fast.avg.toFixed(1)} s average` });
      const hot = P.slice().sort((a, b) => st[b.id].best - st[a.id].best)[0];
      if (hot && st[hot.id].best >= 3) awards.push({ id: hot.id, emoji: '🔥', title: `On fire · ${st[hot.id].best} in a row` });
      ctx.end({ awards });
    }

    function draw() {
      const answered = id => st[id].ans != null || st[id].num != null;
      let html = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 20% 0%,#7b2ff744,transparent 55%),radial-gradient(ellipse at 90% 100%,#f107a333,transparent 55%)"></div>
        <div class="timer-bar" id="qBar"></div>
        <div class="g-top"><div class="g-pill">Question ${qi + 1}/${qs.length} · ${esc(q.c)}</div>
        <div style="display:flex;gap:.5rem">${P.map(p => `<div class="avatar" style="width:2.8rem;height:2.8rem;font-size:1.6rem;background:${p.color};opacity:${answered(p.id) ? 1 : 0.3}">${p.emoji}</div>`).join('')}</div>
        <div class="g-pill" id="qT" style="font-size:2rem;min-width:5rem;text-align:center">${phase === 'q' ? Math.ceil(t) : '✓'}</div></div>
        <div style="position:absolute;left:6rem;right:6rem;top:7.5rem;text-align:center;font-size:3.4rem;font-weight:800;line-height:1.15">${esc(q.q)}</div>`;
      if (q.kind === 'num') {
        if (phase === 'reveal') {
          const list = P.filter(p => st[p.id].num != null).sort((a, b) => Math.abs(st[a.id].num - q.a) - Math.abs(st[b.id].num - q.a));
          html += `<div class="g-center" style="top:12rem"><div class="g-big" style="color:#ffd85a">${fmt(q.a)} <span style="font-size:2rem">${esc(q.unit)}</span></div>
            <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:2rem;font-size:1.6rem">${list.slice(0, 6).map(p => `<div><span class="avatar" style="width:2.4rem;height:2.4rem;font-size:1.4rem;background:${p.color}">${p.emoji}</span> ${esc(p.name)}: <b>${fmt(st[p.id].num)}</b> <span style="color:#3ddc84">+${st[p.id].gain}</span></div>`).join('')}</div></div>`;
        } else html += `<div class="g-center" style="top:12rem"><div style="font-size:7rem">📏</div><div class="g-sub">Type your best guess${q.unit ? ` in ${esc(q.unit)}` : ''} · closest wins</div></div>`;
      } else {
        const total = Math.max(1, P.filter(p => st[p.id].ans != null).length);
        html += `<div style="position:absolute;left:6rem;right:6rem;bottom:7rem;display:grid;grid-template-columns:${q.kind === 'tf' ? '1fr 1fr' : '1fr 1fr'};gap:1.4rem">
          ${q.opts.map((o, i) => {
            const right = phase === 'reveal' && i === q.correct, dim = phase === 'reveal' && i !== q.correct;
            const who = phase === 'reveal' ? P.filter(p => st[p.id].ans === i) : [];
            return `<div style="position:relative;background:${slots()[i].color};border-radius:1rem;padding:1.6rem 2rem;display:flex;align-items:center;gap:1.4rem;font-size:2.2rem;font-weight:800;opacity:${dim ? 0.3 : 1};${right ? 'box-shadow:0 0 0 .4rem #fff;transform:scale(1.03)' : ''};transition:all .3s;overflow:hidden">
              <span style="font-size:2.6rem">${slots()[i].shape}</span><span style="flex:1">${esc(o)}</span>${right ? '<span>✔</span>' : ''}
              ${phase === 'reveal' ? `<div style="position:absolute;left:0;bottom:0;height:.5rem;background:rgba(255,255,255,.7);width:${who.length / total * 100}%"></div>
              <span style="display:flex;gap:.2rem;font-size:1.6rem">${who.map(p => p.emoji).join('')}</span>` : ''}</div>`;
          }).join('')}</div>`;
      }
      S.innerHTML = html;
    }

    next();

    return {
      onInput(id, d) {
        if (phase !== 'q') return;
        const s = st[id];
        if (q.kind === 'num') {
          if (d.t !== 'number' || s.num != null) return;
          const v = Number(d.v);
          if (!isFinite(v)) return;
          s.num = v;
        } else {
          if (d.t !== 'choice' || s.ans != null) return;
          const i = +d.id; if (!(i >= 0 && i < q.opts.length)) return;
          s.ans = i; s.at = QTIME - t;
        }
        ctx.sfx('tick'); ctx.send(id, uiFor(id)); draw();
        if (ctx.live().every(p => st[p.id].ans != null || st[p.id].num != null)) t = Math.min(t, 0.6);
      },
      onRejoin(id) { const m = uiFor(id); if (m) ctx.send(id, m); },
      update(dt) {
        t -= dt;
        const bar = document.getElementById('qBar');
        if (bar) bar.style.width = (phase === 'q' ? Math.max(0, t / (q.kind === 'num' ? QTIME + 10 : QTIME) * 100) : 0) + '%';
        const tt = document.getElementById('qT');
        if (tt) tt.textContent = phase === 'q' ? Math.max(0, Math.ceil(t)) : '✓';
        if (t > 0) return;
        if (phase === 'q') reveal();
        else if (phase === 'reveal') afterReveal();
      },
    };
  },
});
