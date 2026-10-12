// FAKE OUT — write a believable lie for a weird true fact, then spot the truth.
// Spec: 003 R7 (new game), R6.1 (no repeated facts), R2.3 (rejoin).
Hub.register({
  id: 'fakeout', title: 'Fake Out', emoji: '🎭', genre: 'Bluffing · Writing', category: 'social',
  tagline: 'Everyone writes a fake answer to a weird true fact. Find the truth, fool your friends.',
  how: ['Read the weird fact on the TV and type a believable fake answer', 'Then pick the answer you think is TRUE', '+3 for finding the truth, +2 for every friend your lie fools'],
  min: 3, max: 12, time: '6 min', controls: 'Type, then vote', colors: ['#f72585', '#7209b7'],
  settings: [
    { id: 'rounds', label: 'Rounds', options: [3, 5, 7], def: { quick: 3, standard: 5, long: 7 } },
    { id: 'writeTime', label: 'Writing time', options: [{ v: 45, label: '45 s' }, { v: 60, label: '60 s' }, { v: 75, label: '75 s' }], def: 60 },
  ],

  create(ctx) {
    const P = ctx.players, byId = Object.fromEntries(P.map(p => [p.id, p])), ROUNDS = ctx.settings.rounds;
    const facts = ctx.pick('fakeout', window.HUDDLE_CONTENT.fakeout, ROUNDS);
    const fooled = Object.fromEntries(P.map(p => [p.id, 0])), truths = Object.fromEntries(P.map(p => [p.id, 0]));
    let round = 0, phase, t = 0, tMax = 1, fact, lies, options, votes, revealIdx, revealList;
    const S = ctx.stage;
    const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
    function lev(a, b) {
      const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
      for (let j = 1; j <= b.length; j++) m[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
        m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return m[a.length][b.length];
    }
    const tooTrue = s => { const a = norm(s), b = norm(fact.a); return a === b || (b.length > 3 && (a.indexOf(b) >= 0 || lev(a, b) <= 1)); };
    const prompt = () => fact.q.replace('____', '_____');
    const writeUI = () => ({ ui: 'text', prompt: prompt(), max: 40, sub: 'Write a believable FAKE answer' });
    const authored = id => options && options.find(o => o.authors.indexOf(id) >= 0);
    const voteUI = id => ({ ui: 'choices', prompt: 'Which one is TRUE?', layout: 'list',
      options: options.filter(o => o !== authored(id)).map(o => ({ id: o.id, label: o.text })) });

    function newRound() {
      round++; fact = facts[round - 1]; lies = {}; votes = {};
      phase = 'write'; t = tMax = ctx.settings.writeTime;
      P.forEach(p => ctx.send(p.id, writeUI()));
      draw(); ctx.sfx('start');
    }
    function startVote() {
      // merge identical lies; top up with house lies so there are always 4+ options
      const groups = {};
      Object.keys(lies).forEach(id => { const k = norm(lies[id]); (groups[k] = groups[k] || { text: lies[id], authors: [] }).authors.push(id); });
      options = Object.keys(groups).map(k => groups[k]);
      for (const h of fact.lies) if (options.length < 4 && !options.some(o => norm(o.text) === norm(h))) options.push({ text: h, authors: [], house: true });
      options.push({ text: fact.a, authors: [], truth: true });
      options = ctx.shuffle(options).map((o, i) => Object.assign(o, { id: 'o' + i }));
      phase = 'vote'; t = tMax = 30;
      P.forEach(p => ctx.send(p.id, voteUI(p.id)));
      draw();
    }
    function startReveal() {
      phase = 'reveal'; revealIdx = -1;
      const picked = o => Object.keys(votes).filter(id => votes[id] === o.id);
      revealList = options.filter(o => !o.truth && (picked(o).length || o.authors.length)).concat(options.filter(o => o.truth));
      revealList.forEach(o => { o.voters = picked(o); });
      for (const o of revealList) {
        if (o.truth) o.voters.forEach(id => { ctx.score(id, 3); truths[id]++; });
        else o.authors.forEach(a => { const n = o.voters.filter(v => v !== a).length; if (n) { ctx.score(a, 2 * n); fooled[a] += n; } });
      }
      P.forEach(p => {
        const mine = authored(p.id), got = votes[p.id] && options.find(o => o.id === votes[p.id]);
        const n = mine ? mine.voters.filter(v => v !== p.id).length : 0;
        ctx.send(p.id, { ui: 'wait', big: got && got.truth ? '🎯' : '🎭', text: got && got.truth ? 'You found the truth! +3' : 'Fooled!', sub: `${n ? `Your lie fooled ${n} · +${2 * n}` : 'Nobody fell for your lie'} · truth: ${fact.a}` });
      });
      nextReveal();
    }
    function nextReveal() {
      revealIdx++;
      if (revealIdx >= revealList.length) {
        phase = 'between';
        return ctx.roundOver(`Round ${round} of ${ROUNDS} · the truth was "${fact.a}"`, () => {
          if (round < ROUNDS) return newRound();
          const awards = [];
          const liar = P.slice().sort((a, b) => fooled[b.id] - fooled[a.id])[0];
          if (liar && fooled[liar.id] > 0) awards.push({ id: liar.id, emoji: '🤥', title: `Master liar · fooled ${fooled[liar.id]} ${fooled[liar.id] > 1 ? 'times' : 'time'}` });
          const seer = P.slice().sort((a, b) => truths[b.id] - truths[a.id])[0];
          if (seer && truths[seer.id] > 0) awards.push({ id: seer.id, emoji: '🔮', title: `Truth seeker · found it ${truths[seer.id]} ${truths[seer.id] > 1 ? 'times' : 'time'}` });
          ctx.end({ awards });
        });
      }
      t = revealList[revealIdx].truth ? 3.6 : 2.6;
      ctx.sfx(revealList[revealIdx].truth ? 'win' : 'pop');
      draw();
    }

    function draw() {
      const av = (p, s) => `<div class="avatar" style="width:${s}rem;height:${s}rem;font-size:${s * 0.6}rem;background:${p.color}">${p.emoji}</div>`;
      let body = `<div style="font-size:3.2rem;font-weight:800;line-height:1.2;max-width:80rem">${esc(prompt())}</div>`;
      if (phase === 'write') {
        body += `<div class="g-sub" style="margin-top:2rem">✍️ Write a fake answer on your phone</div>
          <div class="p-row" style="margin-top:3rem">${P.map(p => `<div class="p-card ${lies[p.id] ? 'done' : ''}">${av(p, 5)}<div class="nm">${esc(p.name)}</div></div>`).join('')}</div>`;
      } else if (phase === 'vote') {
        body += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:2.5rem;width:80rem">${options.map(o => `<div style="background:rgba(255,255,255,.08);border-radius:.8rem;padding:1.2rem 1.6rem;font-size:1.8rem;font-weight:700">${esc(o.text)}</div>`).join('')}</div>
          <div class="p-row" style="margin-top:2rem">${P.map(p => `<div class="p-card ${votes[p.id] ? 'done' : ''}">${av(p, 3.6)}</div>`).join('')}</div>`;
      } else if (phase === 'reveal') {
        const o = revealList[revealIdx];
        body += `<div style="margin-top:2.5rem;font-size:4.6rem;font-weight:900;color:${o.truth ? '#3ddc84' : '#ff6b9a'}">${esc(o.text)}</div>
          <div class="g-sub" style="color:#fff;font-size:2rem">${o.truth ? '✅ THE TRUTH' : o.house ? '🏠 A house lie' : `🎭 A lie by ${o.authors.map(a => esc(byId[a].name)).join(' & ')}`}</div>
          <div class="p-row" style="margin-top:2rem">${o.voters.length ? o.voters.map(id => `<div class="p-card">${av(byId[id], 4)}<div class="nm">${esc(byId[id].name)}</div><div class="tag">${o.truth ? '+3' : 'fooled'}</div></div>`).join('') : '<div class="g-sub">Nobody picked this one</div>'}</div>`;
      }
      S.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 30% 0%,#f7258544,transparent 55%),radial-gradient(ellipse at 80% 100%,#7209b755,transparent 60%)"></div>
        <div class="timer-bar" id="foBar"></div>
        <div class="g-top"><div class="g-pill">🎭 Round ${round}/${ROUNDS}</div><div class="g-pill" id="foT"></div></div>
        <div class="g-center" style="padding:0 6rem 5rem">${body}</div>`;
    }

    newRound();

    return {
      onInput(id, d) {
        if (phase === 'write' && d.t === 'text' && !lies[id]) {
          const text = String(d.text || '').replace(/[<>]/g, '').trim().slice(0, 40);
          if (!text) return;
          if (tooTrue(text)) return ctx.send(id, { note: 'Too close to the real answer! Write a different lie.' });
          lies[id] = text;
          ctx.send(id, { ui: 'wait', big: '🤫', text: 'Lie locked in', sub: `"${text}"` });
          draw(); ctx.sfx('pop');
          if (ctx.live().every(p => lies[p.id])) t = Math.min(t, 0.8);
        } else if (phase === 'vote' && d.t === 'choice' && !votes[id]) {
          const o = options.find(x => x.id === d.id);
          if (!o || o === authored(id)) return;
          votes[id] = o.id;
          ctx.send(id, { ui: 'wait', big: '🗳️', text: 'Vote locked in', sub: `"${o.text}"` });
          draw(); ctx.sfx('pop');
          if (ctx.live().every(p => votes[p.id])) t = Math.min(t, 0.8);
        }
      },
      onRejoin(id) {
        if (phase === 'write' && !lies[id]) ctx.send(id, writeUI());
        else if (phase === 'vote' && !votes[id]) ctx.send(id, voteUI(id));
      },
      update(dt) {
        t -= dt;
        const bar = document.getElementById('foBar'), tt = document.getElementById('foT');
        if (bar) bar.style.width = (phase === 'write' || phase === 'vote' ? Math.max(0, t / tMax * 100) : 0) + '%';
        if (tt) tt.textContent = phase === 'write' ? `✍️ ${Math.max(0, Math.ceil(t))}` : phase === 'vote' ? `🗳️ ${Math.max(0, Math.ceil(t))}` : '🔍';
        if (t > 0) return;
        if (phase === 'write') startVote();
        else if (phase === 'vote') startReveal();
        else if (phase === 'reveal') nextReveal();
      },
    };
  },
});
