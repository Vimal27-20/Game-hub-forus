// UNDERCOVER — secret roles. Everyone gets the secret word except the spy.
// Spec: 001 R8, 003 (fresh content R6.1, turn skipping R2.3).
Hub.register({
  id: 'spy', title: 'Undercover', emoji: '🕵️', genre: 'Secret roles · Social', category: 'social',
  tagline: 'One of you is the spy and doesn\'t know the secret word. Give clues, find the faker.',
  how: ['Hold your phone card to peek at the secret word', 'Take turns saying ONE clue word out loud', 'Vote for the spy. A caught spy can still steal it by guessing the word'],
  min: 3, max: 12, time: '8 min', controls: 'Hold-to-reveal + vote', colors: ['#3a2bd8', '#00c2a8'],
  settings: [
    { id: 'rounds', label: 'Rounds', options: [2, 3, 4], def: { quick: 2, standard: 3, long: 4 } },
    { id: 'laps', label: 'Clue laps', options: [{ v: 1, label: '1 lap' }, { v: 2, label: '2 laps' }], def: { quick: 1, standard: 2, long: 2 } },
  ],

  create(ctx) {
    const CATS = window.HUDDLE_CONTENT.spy;
    const P = ctx.players, byId = Object.fromEntries(P.map(p => [p.id, p]));
    const ROUNDS = Math.min(ctx.settings.rounds, P.length), LAPS = ctx.settings.laps;
    const cats = ctx.pick('spy', Object.keys(CATS), ROUNDS);
    const pastSpies = [], escaped = {}, sharp = {};
    P.forEach(p => { escaped[p.id] = 0; sharp[p.id] = 0; });
    let round = 0, phase, t = 0, tMax = 1, cat, word, spy, ready, order, turn, votes, guess, outcome;
    const live = () => ctx.live();
    const av = (p, cls) => `<div class="avatar ${cls || ''}" style="background:${p.color}">${p.emoji}</div>`;
    const S = ctx.stage;

    function secretFor(id, done) {
      const isSpy = id === spy;
      return { ui: 'secret', title: `Round ${round} · your secret`, word: isSpy ? '🕵️ YOU ARE THE SPY' : word,
        sub: isSpy ? `Category: ${cat}. You don't know the word: blend in and work it out from the clues.` : `Category: ${cat}. Give clues, but don't make it too obvious for the spy!`,
        button: 'Got it', done: !!done };
    }
    function newRound() {
      round++;
      cat = cats[round - 1] || ctx.shuffle(Object.keys(CATS))[0];
      word = ctx.shuffle(CATS[cat])[0];
      const pool = live().filter(p => pastSpies.indexOf(p.id) < 0);
      spy = ctx.shuffle(pool.length ? pool : live())[0].id; pastSpies.push(spy);
      ready = new Set(); votes = {}; guess = null; outcome = null;
      setPhase('reveal', 60);
      P.forEach(p => ctx.send(p.id, secretFor(p.id)));
    }
    function setPhase(ph, secs) { phase = ph; t = tMax = secs; draw(); }

    function startClues() {
      const lap = ctx.shuffle(live().map(p => p.id));
      order = [];
      for (let i = 0; i < LAPS; i++) order = order.concat(lap);
      turn = -1; nextTurn();
    }
    function nextTurn() {
      turn++;
      while (turn < order.length && !ctx.isConnected(order[turn])) turn++;
      if (turn >= order.length) return startVote();
      const cur = order[turn];
      setPhase('clue', 25);
      for (const p of P) {
        if (p.id === cur) ctx.send(p.id, { ui: 'turn', big: '🎤', text: 'Your turn!', sub: 'Say ONE word out loud that hints at the secret. Tap Done when finished.', button: 'Done', vibrate: [50, 40, 50] });
        else ctx.send(p.id, { ui: 'wait', big: '👂', text: `Listen to ${byId[cur].name}`, sub: 'Who sounds like they\'re bluffing?' });
      }
      ctx.sfx('pop');
    }
    function voteUI(id) {
      return { ui: 'choices', prompt: 'Who is the spy?', layout: 'list',
        options: live().filter(o => o.id !== id).map(o => ({ id: o.id, label: o.name, char: o.char })) };
    }
    function startVote() {
      setPhase('vote', 40);
      P.forEach(p => ctx.send(p.id, voteUI(p.id)));
    }
    function resolveVote() {
      const tally = {};
      Object.keys(votes).forEach(k => { tally[votes[k]] = (tally[votes[k]] || 0) + 1; });
      const max = Math.max(0, ...Object.values(tally));
      const top = Object.keys(tally).filter(k => tally[k] === max);
      const accused = top.length === 1 ? top[0] : null;
      if (accused === spy && ctx.isConnected(spy)) {
        setPhase('spyGuess', 25);
        ctx.send(spy, { ui: 'choices', prompt: 'You\'ve been caught! Guess the secret word to steal the win:', layout: 'list', options: CATS[cat].map(w => ({ id: w, label: w })) });
        P.filter(p => p.id !== spy).forEach(p => ctx.send(p.id, { ui: 'wait', big: '😬', text: 'Spy caught!', sub: 'They get one guess at the secret word…' }));
      } else finish(accused ? 'wrong' : 'tie', accused);
    }
    function finish(kind, accused) {
      // kind: 'wrong' (innocent accused) | 'tie' | 'caught' | 'stole'
      outcome = { kind, accused };
      const voters = Object.keys(votes).filter(v => votes[v] === spy);
      voters.forEach(v => { sharp[v]++; });
      if (kind === 'wrong' || kind === 'tie') { ctx.score(spy, 4); escaped[spy]++; }
      else if (kind === 'stole') { ctx.score(spy, 3); escaped[spy]++; voters.forEach(v => ctx.score(v, 1)); }
      else { P.filter(p => p.id !== spy).forEach(p => ctx.score(p.id, 2)); voters.forEach(v => ctx.score(v, 1)); }
      setPhase('outcome', 6);
      const spyWon = kind !== 'caught';
      ctx.sfx(spyWon ? 'bad' : 'win');
      for (const p of P) {
        const won = (p.id === spy) === spyWon;
        ctx.send(p.id, { ui: 'wait', big: won ? '🎉' : '💀', text: won ? 'Your side wins!' : 'Your side lost', sub: `The word was ${word}`, vibrate: won ? [60, 40, 60] : 200 });
      }
    }
    function endRound() {
      phase = 'between';
      ctx.roundOver(`Round ${round} of ${ROUNDS} · the word was ${word}`, () => {
        if (round < ROUNDS) return newRound();
        phase = 'done';
        const awards = [];
        const sly = P.slice().sort((a, b) => escaped[b.id] - escaped[a.id])[0];
        if (sly && escaped[sly.id] > 0) awards.push({ id: sly.id, emoji: '🎭', title: 'Master of disguise' });
        const eye = P.slice().sort((a, b) => sharp[b.id] - sharp[a.id])[0];
        if (eye && sharp[eye.id] > 0) awards.push({ id: eye.id, emoji: '🔎', title: `Sharp eye · spotted the spy ${sharp[eye.id]}×` });
        ctx.end({ awards });
      });
    }

    function draw() {
      const head = `<div class="g-top"><div class="g-pill">🕵️ Round ${round}/${ROUNDS}</div>
        <div class="g-pill" style="background:#00c2a822;color:#7ff5e3">Category: <b>${esc(cat)}</b></div></div>
        <div class="timer-bar" id="spyBar"></div>`;
      let body = '';
      if (phase === 'reveal') {
        body = `<div class="g-big">Check your phone 📱</div><div class="g-sub">Press and hold to see your secret word. One of you is the <b style="color:#7ff5e3">spy</b>.</div>
          <div class="p-row" style="margin-top:4rem">${P.map(p => `<div class="p-card ${ready.has(p.id) ? 'done' : ''}">${av(p)}<div class="nm">${esc(p.name)}</div></div>`).join('')}</div>`;
      } else if (phase === 'clue') {
        const cur = byId[order[turn]], per = order.length / LAPS, lap = Math.floor(turn / per) + 1;
        body = `<div class="g-sub" style="margin:0 0 2rem;font-size:1.4rem;letter-spacing:.2em;text-transform:uppercase">Clue lap ${lap} of ${LAPS} · ${turn % per + 1} of ${per}</div>
          <div class="p-row">${P.map(p => `<div class="p-card ${p.id === cur.id ? 'hot' : 'dim'}">${av(p)}<div class="nm">${esc(p.name)}</div></div>`).join('')}</div>
          <div class="g-big" style="margin-top:3.5rem">${esc(cur.name)}, give a clue!</div>
          <div class="g-sub">One word, out loud. Everyone else: listen for the bluffer.</div>`;
      } else if (phase === 'vote') {
        body = `<div class="g-big">Vote on your phone 🗳️</div><div class="g-sub">Who is the spy? A tie means the spy escapes.</div>
          <div class="p-row" style="margin-top:4rem">${P.map(p => `<div class="p-card ${votes[p.id] ? 'done' : ''}">${av(p)}<div class="nm">${esc(p.name)}</div><div class="tag">${votes[p.id] ? 'voted' : 'thinking…'}</div></div>`).join('')}</div>`;
      } else if (phase === 'spyGuess') {
        body = `<div class="p-row"><div class="p-card hot">${av(byId[spy])}</div></div><div class="g-big" style="margin-top:2rem">${esc(byId[spy].name)} was the spy!</div>
          <div class="g-sub">But they can still steal the round by guessing the secret word…</div>`;
      } else if (phase === 'outcome') {
        const s = byId[spy], kind = outcome.kind;
        const tally = {}; Object.keys(votes).forEach(k => { tally[votes[k]] = (tally[votes[k]] || 0) + 1; });
        const line = kind === 'caught' ? `Caught! ${esc(s.name)} guessed ${guess ? `"${esc(guess)}"` : 'nothing'}: wrong.`
          : kind === 'stole' ? `${esc(s.name)} was caught but guessed the word. Spy steals it!`
          : kind === 'tie' ? `The vote tied: ${esc(s.name)} the spy slips away!`
          : `You accused ${esc(byId[outcome.accused].name)}… the spy was ${esc(s.name)}!`;
        body = `<div class="g-sub" style="margin:0 0 1rem;letter-spacing:.2em;text-transform:uppercase">The secret word was</div>
          <div class="g-big" style="color:#7ff5e3">${esc(word)}</div>
          <div class="g-sub" style="color:#fff;font-size:2rem;margin-top:2rem">${line}</div>
          <div class="p-row" style="margin-top:3rem">${P.map(p => `<div class="p-card">${av(p)}<div class="nm">${p.id === spy ? '🕵️ ' : ''}${esc(p.name)}</div><div class="tag">${tally[p.id] ? `${tally[p.id]} vote${tally[p.id] > 1 ? 's' : ''}` : ''}</div></div>`).join('')}</div>`;
      }
      S.innerHTML = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 120%,#00c2a833,transparent 60%),radial-gradient(ellipse at 50% -20%,#3a2bd855,transparent 60%)"></div>${head}<div class="g-center">${body}</div>`;
    }

    newRound();

    return {
      onInput(id, d) {
        if (phase === 'reveal' && d.t === 'ready') {
          ready.add(id); ctx.send(id, secretFor(id, true));
          draw(); ctx.sfx('pop');
          if (live().every(p => ready.has(p.id))) ctx.after(0.8, () => { if (phase === 'reveal') startClues(); });
        } else if (phase === 'clue' && d.t === 'done' && order[turn] === id) {
          nextTurn();
        } else if (phase === 'vote' && d.t === 'choice' && byId[d.id] && d.id !== id) {
          if (votes[id]) return;
          votes[id] = d.id; draw(); ctx.sfx('pop');
          ctx.send(id, { ui: 'wait', big: '🗳️', text: 'Vote locked in', sub: `You voted for ${byId[d.id].name}` });
          if (live().every(p => votes[p.id])) ctx.after(0.8, () => { if (phase === 'vote') resolveVote(); });
        } else if (phase === 'spyGuess' && id === spy && d.t === 'choice') {
          guess = String(d.id);
          finish(guess === word ? 'stole' : 'caught', spy);
        }
      },
      onLeave(id) {
        if (phase === 'clue' && order[turn] === id) nextTurn();
        if (phase === 'spyGuess' && id === spy) finish('caught', spy);
      },
      onRejoin(id) {
        if (phase === 'reveal') ctx.send(id, secretFor(id, ready.has(id)));
        else if (phase === 'vote' && !votes[id]) ctx.send(id, voteUI(id));
      },
      update(dt) {
        t -= dt;
        const bar = document.getElementById('spyBar');
        if (bar) bar.style.width = Math.max(0, t / tMax * 100) + '%';
        if (t > 0) return;
        if (phase === 'reveal') startClues();
        else if (phase === 'clue') nextTurn();
        else if (phase === 'vote') resolveVote();
        else if (phase === 'spyGuess') finish('caught', spy);
        else if (phase === 'outcome') endRound();
      },
    };
  },
});
