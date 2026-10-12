// QUICK DRAW — wait for the signal, then tap first. Fake-outs and early taps are fouls.
// Reaction time is measured ON EACH PHONE from the moment the signal shows, so network
// latency never decides the winner. Spec: 003 R7 (new game), design § Quick Draw fairness.
Hub.register({
  id: 'quickdraw', title: 'Quick Draw', emoji: '🤠', genre: 'Reflex · Duel', category: 'action',
  tagline: 'Watch your phone. When the signal comes, tap faster than everyone else.',
  how: ['Keep your thumb ready over your phone', 'Tap the instant the real signal appears', 'Tapping early or on a fake-out is a foul'],
  min: 2, max: 12, time: '2 min', controls: 'One big button', colors: ['#c76b29', '#5a2d0c'],
  settings: [
    { id: 'rounds', label: 'Duels', options: [5, 8, 12], def: { quick: 5, standard: 8, long: 12 } },
  ],

  create(ctx) {
    const TUNE = { minWait: 1800, maxWait: 5200, window: 2500, minHuman: 100, fakes: { chill: 0, normal: 1, wild: 2 }[ctx.room.difficulty] || 1 };
    const VARIANTS = [
      { id: 'flash', name: 'Colour Flash', tip: 'Tap when the screen turns GREEN. Not yellow. Not blue.' },
      { id: 'word', name: 'Say the Word', tip: 'Tap only when it says DRAW.' },
      { id: 'emoji', name: 'Spot the Cactus', tip: 'Tap only when you see 🌵' },
      { id: 'count', name: 'Countdown', tip: 'Tap on 5. Not before!' },
    ];
    const WORDS = ['DRAG', 'DRAWN', 'DREW', 'DRAMA', 'DROP', 'DRAIN', 'BRAW'];
    const EMOJI = ['🌲', '🌴', '🍀', '🐍', '🦎', '🥒', '🌿', '🍐'];
    const P = ctx.players, ROUNDS = ctx.settings.rounds;
    const best = Object.fromEntries(P.map(p => [p.id, Infinity])), fouls = Object.fromEntries(P.map(p => [p.id, 0]));
    let round = 0, phase = 'ready', t = 0, v, seq, res, r = 0, shown = null;
    const S = ctx.stage;

    function buildSeq() {
      const go = TUNE.minWait + Math.random() * (TUNE.maxWait - TUNE.minWait);
      const steps = [];
      if (v.id === 'flash') {
        steps.push({ at: 0, kind: 'wait', show: 'WAIT…', color: '#7a1f1f' });
        for (let i = 0; i < TUNE.fakes; i++) steps.push({ at: go * (0.35 + 0.25 * i), kind: 'fake', show: i % 2 ? 'BLUE' : 'YELLOW', color: i % 2 ? '#1e5bd8' : '#d8b21e' });
        for (let i = 0; i < TUNE.fakes; i++) steps.push({ at: go * (0.35 + 0.25 * i) + 450, kind: 'wait', show: 'WAIT…', color: '#7a1f1f' });
        steps.push({ at: go, kind: 'go', show: 'DRAW!', color: '#1fae4b' });
      } else if (v.id === 'word') {
        let at = 0;
        while (at < go - 500) { steps.push({ at, kind: at === 0 ? 'wait' : 'fake', show: WORDS[Math.random() * WORDS.length | 0], color: '#2a2a3a' }); at += 550 + Math.random() * 450; }
        steps.push({ at: go, kind: 'go', show: 'DRAW', color: '#1fae4b' });
      } else if (v.id === 'emoji') {
        let at = 0;
        while (at < go - 500) { steps.push({ at, kind: at === 0 ? 'wait' : 'fake', show: EMOJI[Math.random() * EMOJI.length | 0], color: '#2a2a3a' }); at += 600 + Math.random() * 500; }
        steps.push({ at: go, kind: 'go', show: '🌵', color: '#1fae4b' });
      } else {
        let at = 0;
        for (let n = 1; n <= 4; n++) { steps.push({ at, kind: 'wait', show: String(n), color: '#2a2a3a' }); at += 500 + Math.random() * 900; }
        steps.push({ at, kind: 'go', show: '5', color: '#1fae4b' });
      }
      return steps.sort((a, b) => a.at - b.at).map(s => Object.assign(s, { at: Math.round(s.at) }));
    }
    function startRound() {
      round++; r++;
      v = ctx.variant(VARIANTS);
      seq = buildSeq(); res = {}; phase = 'ready'; t = 2.2; shown = null;
      ctx.sendAll({ ui: 'wait', big: '🤠', text: `Duel ${round} of ${ROUNDS}: ${v.name}`, sub: v.tip });
      draw(); ctx.sfx('tick');
    }
    function beginDuel() {
      phase = 'duel'; t = 0;
      const goAt = seq.find(s => s.kind === 'go').at;
      P.filter(p => ctx.isConnected(p.id)).forEach(p => ctx.send(p.id, { ui: 'react', r, seq, title: v.tip }));
      ctx.after(goAt / 1000 + TUNE.window / 1000 + 0.4, () => { if (phase === 'duel') reveal(); });
    }
    function reveal() {
      phase = 'reveal'; t = 3.4;
      const valid = Object.keys(res).filter(id => res[id].ms != null).sort((a, b) => res[a].ms - res[b].ms);
      [3, 2, 1].forEach((pts, i) => { if (valid[i]) ctx.score(valid[i], pts); });
      valid.forEach(id => { best[id] = Math.min(best[id], res[id].ms); });
      Object.keys(res).filter(id => res[id].foul).forEach(id => { fouls[id]++; if (ctx.scores()[id] > 0) ctx.score(id, -1); });
      P.forEach(p => {
        const x = res[p.id], place = valid.indexOf(p.id);
        ctx.send(p.id, !x ? { ui: 'wait', big: '😴', text: 'Too slow!', sub: 'No tap this time' }
          : x.foul ? { ui: 'wait', big: '🚫', text: 'Foul!', sub: x.foul === 'fake' ? 'That was a fake-out · −1' : 'Too early · −1', vibrate: 300 }
          : { ui: 'wait', big: ['🥇', '🥈', '🥉'][place] || '🎯', text: `${x.ms} ms`, sub: place < 3 ? `+${3 - place}` : `#${place + 1}`, vibrate: place === 0 ? [60, 40, 60] : 40 });
      });
      ctx.sfx(valid.length ? 'win' : 'bad');
      draw();
    }
    function afterReveal() {
      if (round >= ROUNDS) return finish();
      if (round % 4 === 0) ctx.roundOver(`After ${round} of ${ROUNDS} duels`, startRound);
      else startRound();
    }
    function finish() {
      phase = 'done';
      const awards = [];
      const gun = P.slice().sort((a, b) => best[a.id] - best[b.id])[0];
      if (gun && isFinite(best[gun.id])) awards.push({ id: gun.id, emoji: '🔫', title: `Fastest gun · ${best[gun.id]} ms` });
      const sc = ctx.scores(), calm = P.filter(p => fouls[p.id] === 0 && isFinite(best[p.id])).sort((a, b) => sc[b.id] - sc[a.id]);
      if (calm.length && calm.length < P.length) awards.push({ id: calm[0].id, emoji: '🧊', title: 'Nerves of steel · no fouls' });
      ctx.end({ awards });
    }

    function draw() {
      let body = '';
      if (phase === 'ready') body = `<div class="g-sub" style="letter-spacing:.3em;text-transform:uppercase">Duel ${round} of ${ROUNDS}</div><div class="g-big" style="margin:1rem 0">${esc(v.name)}</div><div class="g-sub" style="color:#fff">${esc(v.tip)}</div>`;
      else if (phase === 'duel') {
        const s = shown || seq[0];
        body = `<div style="font-size:${s.show.length > 3 ? 10 : 16}rem;font-weight:900;line-height:1">${esc(s.show)}</div><div class="g-sub">Watch your phone!</div>`;
      } else if (phase === 'reveal') {
        const list = P.slice().sort((a, b) => {
          const x = res[a.id], y = res[b.id], ka = x && x.ms != null ? x.ms : x ? 1e6 : 2e6, kb = y && y.ms != null ? y.ms : y ? 1e6 : 2e6;
          return ka - kb;
        });
        const max = Math.max(300, ...list.map(p => (res[p.id] && res[p.id].ms) || 0));
        body = `<div class="g-sub" style="letter-spacing:.3em;text-transform:uppercase;margin-bottom:2rem">Reaction times</div>
          <div style="width:64rem;display:flex;flex-direction:column;gap:.7rem">${list.map((p, i) => {
            const x = res[p.id], ok = x && x.ms != null;
            return `<div style="display:flex;align-items:center;gap:1rem;font-size:1.6rem;font-weight:700">
              <div class="avatar" style="width:3rem;height:3rem;font-size:1.8rem;background:${p.color}">${p.emoji}</div><div style="width:12rem;text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">${esc(p.name)}</div>
              <div style="flex:1;height:2.2rem;background:rgba(255,255,255,.06);border-radius:.5rem;overflow:hidden">${ok ? `<div style="height:100%;width:${x.ms / max * 100}%;background:${i === 0 ? '#ffd85a' : p.color}"></div>` : ''}</div>
              <div style="width:9rem;text-align:right">${ok ? x.ms + ' ms' : x ? '🚫 foul' : '—'}</div></div>`;
          }).join('')}</div>`;
      }
      const bg = phase === 'duel' && shown ? shown.color : '#2a160b';
      S.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,${bg},#120804 75%);transition:background .1s"></div>
        <div class="g-top"><div class="g-pill">🤠 Duel ${round}/${ROUNDS}</div><div class="g-pill">${esc(v.name)}</div></div><div class="g-center">${body}</div>`;
    }

    startRound();

    return {
      onInput(id, d) {
        if (phase !== 'duel' || d.t !== 'react' || d.r !== r || res[id]) return;
        if (d.foul) res[id] = { foul: d.foul === 'fake' ? 'fake' : 'early' };
        else {
          const ms = Math.round(+d.ms);
          if (!(ms >= 0)) return;
          res[id] = ms < TUNE.minHuman ? { foul: 'early' } : { ms: Math.min(ms, TUNE.window) }; // <100 ms is anticipation, not reaction
        }
        ctx.send(id, { ui: 'wait', big: res[id].foul ? '🚫' : '✋', text: res[id].foul ? 'Foul!' : 'Got it!', sub: 'Waiting for the others…' });
        ctx.sfx('tick');
        if (ctx.live().every(p => res[p.id])) { const goAt = seq.find(s => s.kind === 'go').at / 1000; if (t > goAt) reveal(); else ctx.after(0.3, () => { if (phase === 'duel') reveal(); }); }
      },
      onRejoin(id) { if (phase === 'duel') ctx.send(id, { ui: 'wait', big: '🤠', text: 'Welcome back!', sub: 'You\'re in from the next duel' }); },
      update(dt) {
        t += phase === 'duel' ? dt : 0;
        if (phase === 'duel') {
          const ms = t * 1000, cur = seq.filter(s => s.at <= ms).pop();
          if (cur !== shown) { shown = cur; draw(); if (cur && cur.kind === 'go') ctx.sfx('start'); }
          return;
        }
        t -= dt;
        if (t > 0) return;
        if (phase === 'ready') beginDuel();
        else if (phase === 'reveal') afterReveal();
      },
    };
  },
});
