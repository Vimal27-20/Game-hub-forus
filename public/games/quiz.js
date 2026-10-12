// QUIZ CLASH — fast trivia. Faster correct answers score more.
Hub.register({
  id: 'quiz', title: 'Quiz Clash', emoji: '🧠', genre: 'Trivia · Speed',
  tagline: 'Rapid-fire trivia on the big screen. Answer fast for big points and keep your streak alive.',
  min: 1, max: 12, time: '5 min', controls: '4 answer buttons', colors: ['#7b2ff7', '#f107a3'],

  create(ctx) {
    // [question, correct, wrong, wrong, wrong]
    const BANK = [
      ['What is the largest planet in our solar system?', 'Jupiter', 'Saturn', 'Neptune', 'Earth'],
      ['How many sides does a hexagon have?', '6', '5', '8', '7'],
      ['What is the chemical symbol for gold?', 'Au', 'Ag', 'Gd', 'Go'],
      ['The Cliffs of Moher are in which country?', 'Ireland', 'Scotland', 'Wales', 'Iceland'],
      ['What is the capital of Australia?', 'Canberra', 'Sydney', 'Melbourne', 'Perth'],
      ['Which is the largest ocean on Earth?', 'Pacific', 'Atlantic', 'Indian', 'Arctic'],
      ['How many minutes are in a day?', '1,440', '1,240', '1,400', '1,640'],
      ['Who painted the Mona Lisa?', 'Leonardo da Vinci', 'Michelangelo', 'Vincent van Gogh', 'Pablo Picasso'],
      ['Which gas do plants absorb from the air?', 'Carbon dioxide', 'Oxygen', 'Nitrogen', 'Helium'],
      ['What is the fastest land animal?', 'Cheetah', 'Lion', 'Pronghorn', 'Greyhound'],
      ['How many players does a soccer team have on the pitch?', '11', '10', '9', '12'],
      ['Which planet is known as the Red Planet?', 'Mars', 'Venus', 'Jupiter', 'Mercury'],
      ['At what temperature in °F does water freeze?', '32', '0', '100', '212'],
      ['What is the smallest prime number?', '2', '1', '3', '0'],
      ['Which instrument has 88 keys?', 'Piano', 'Accordion', 'Organ', 'Harp'],
      ['What is the longest river in Ireland?', 'River Shannon', 'River Liffey', 'River Boyne', 'River Suir'],
      ['Waterford is world-famous for making what?', 'Crystal', 'Whiskey', 'Linen', 'Pottery'],
      ['Which Irish city was founded by Vikings in 914?', 'Waterford', 'Galway', 'Kilkenny', 'Athlone'],
      ['How many continents are there?', '7', '5', '6', '8'],
      ['In which year did humans first land on the Moon?', '1969', '1959', '1972', '1965'],
      ['How many legs does a spider have?', '8', '6', '10', '12'],
      ['What is the largest animal ever known to have lived?', 'Blue whale', 'Argentinosaurus', 'African elephant', 'Megalodon'],
      ['Which element has atomic number 1?', 'Hydrogen', 'Helium', 'Oxygen', 'Carbon'],
      ['The Great Barrier Reef lies off which country?', 'Australia', 'Indonesia', 'Philippines', 'New Zealand'],
      ['What is the square root of 144?', '12', '14', '11', '16'],
      ['Which blood type is the universal donor?', 'O negative', 'AB positive', 'A negative', 'O positive'],
      ['Which country gave the Statue of Liberty to the USA?', 'France', 'Britain', 'Spain', 'Italy'],
      ['How many hearts does an octopus have?', '3', '1', '2', '8'],
      ['What is the currency of Japan?', 'Yen', 'Won', 'Yuan', 'Ringgit'],
      ['What is the tallest mountain above sea level?', 'Mount Everest', 'K2', 'Kilimanjaro', 'Mont Blanc'],
      ['How many bones are in the adult human body?', '206', '186', '226', '306'],
      ['The Titanic was built in which city?', 'Belfast', 'Southampton', 'Liverpool', 'Glasgow'],
      ['What is the main ingredient in guacamole?', 'Avocado', 'Peas', 'Cucumber', 'Lime'],
      ['Which Irish county is called the Rebel County?', 'Cork', 'Kerry', 'Mayo', 'Wexford'],
      ['Roughly how fast does light travel?', '300,000 km/s', '30,000 km/s', '3,000 km/s', '3 million km/s'],
      ['How many strings does a standard guitar have?', '6', '4', '5', '8'],
      ['What is the largest desert on Earth?', 'Antarctic', 'Sahara', 'Gobi', 'Arabian'],
      ['Who wrote "Romeo and Juliet"?', 'William Shakespeare', 'Charles Dickens', 'Jane Austen', 'Oscar Wilde'],
      ['Which of these is a mammal?', 'Dolphin', 'Shark', 'Trout', 'Eel'],
      ['How many days are in a leap year?', '366', '365', '364', '367'],
      ['Which planet is closest to the Sun?', 'Mercury', 'Venus', 'Mars', 'Earth'],
      ['What is the hardest natural substance?', 'Diamond', 'Quartz', 'Iron', 'Granite'],
      ['Which language has the most native speakers?', 'Mandarin Chinese', 'English', 'Spanish', 'Hindi'],
      ['What colour do you get by mixing blue and yellow?', 'Green', 'Purple', 'Orange', 'Brown'],
      ['Which famous playwright and wit was born in Dublin in 1854?', 'Oscar Wilde', 'George Bernard Shaw', 'W. B. Yeats', 'Samuel Beckett'],
    ];
    const N = 10, QTIME = 15;
    const SLOTS = [
      { color: '#e21b3c', shape: '▲' }, { color: '#1368ce', shape: '◆' },
      { color: '#d89e00', shape: '●' }, { color: '#26890c', shape: '■' },
    ];
    const P = ctx.players;
    const st = Object.fromEntries(P.map(p => [p.id, { score: 0, streak: 0, ans: null, at: 0, gain: 0 }]));
    const qs = shuffle(BANK).slice(0, N).map(([q, a, ...w]) => {
      const opts = shuffle([a, ...w]);
      return { q, opts, correct: opts.indexOf(a) };
    });
    let qi = -1, phase = 'intro', t = 3, tMax = 3, q;
    const S = ctx.stage;
    const live = () => P.filter(p => ctx.isConnected(p.id));

    function next() {
      qi++;
      if (qi >= qs.length) { phase = 'done'; return ctx.end(P.map(p => ({ id: p.id, score: st[p.id].score }))); }
      q = qs[qi]; phase = 'q'; t = tMax = QTIME;
      P.forEach(p => { st[p.id].ans = null; st[p.id].gain = 0; });
      ctx.sendAll({ ui: 'choices', prompt: `Question ${qi + 1} of ${qs.length}`, layout: 'grid',
        options: q.opts.map((o, i) => ({ id: i, label: o, color: SLOTS[i].color, shape: SLOTS[i].shape })), sub: 'Look at the TV for the question' });
      draw(); ctx.sfx('start');
    }
    function reveal() {
      phase = 'reveal'; t = 4.5;
      for (const p of P) {
        const s = st[p.id];
        if (s.ans === q.correct) {
          s.streak++;
          s.gain = Math.round(500 + 500 * Math.max(0, (QTIME - s.at)) / QTIME) + (s.streak >= 3 ? 100 : 0);
          s.score += s.gain;
          ctx.send(p.id, { ui: 'wait', big: '✅', text: `Correct! +${s.gain}`, sub: s.streak >= 3 ? `🔥 ${s.streak} in a row (+100 streak bonus)` : `Total ${s.score}`, vibrate: [40, 30, 40] });
        } else {
          s.streak = 0;
          ctx.send(p.id, { ui: 'wait', big: s.ans == null ? '⌛' : '❌', text: s.ans == null ? 'Too slow!' : 'Not this time', sub: `Answer: ${q.opts[q.correct]}`, vibrate: 200 });
        }
      }
      ctx.sfx('good'); draw();
    }
    function board() { phase = 'board'; t = 3.5; draw(); }

    function draw() {
      const ans = i => P.filter(p => st[p.id].ans === i);
      let html = `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 20% 0%,#7b2ff744,transparent 55%),radial-gradient(ellipse at 90% 100%,#f107a333,transparent 55%)"></div>
        <div class="timer-bar" id="qBar"></div>`;
      if (phase === 'intro') {
        html += `<div class="g-center"><div style="font-size:8rem">🧠</div><div class="g-big">Quiz Clash</div><div class="g-sub">${qs.length} questions · answer on your phone · faster = more points</div></div>`;
      } else if (phase === 'q' || phase === 'reveal') {
        const total = Math.max(1, P.filter(p => st[p.id].ans != null).length);
        html += `<div class="g-top"><div class="g-pill">Question ${qi + 1}/${qs.length}</div><div class="g-pill" id="qT" style="font-size:2rem;min-width:5rem;text-align:center">${Math.ceil(t)}</div></div>
          <div style="position:absolute;left:6rem;right:6rem;top:7rem;text-align:center;font-size:3.6rem;font-weight:800;line-height:1.15">${esc(q.q)}</div>
          <div style="position:absolute;left:6rem;right:6rem;bottom:9rem;display:grid;grid-template-columns:1fr 1fr;gap:1.4rem">
          ${q.opts.map((o, i) => {
            const right = phase === 'reveal' && i === q.correct, dim = phase === 'reveal' && i !== q.correct;
            const who = phase === 'reveal' ? ans(i) : [];
            return `<div style="position:relative;background:${SLOTS[i].color};border-radius:1rem;padding:1.6rem 2rem;display:flex;align-items:center;gap:1.4rem;font-size:2.2rem;font-weight:800;opacity:${dim ? 0.3 : 1};${right ? 'box-shadow:0 0 0 .4rem #fff;transform:scale(1.03)' : ''};transition:all .3s;overflow:hidden">
              <span style="font-size:2.6rem">${SLOTS[i].shape}</span><span style="flex:1">${esc(o)}</span>${right ? '<span>✔</span>' : ''}
              ${phase === 'reveal' ? `<div style="position:absolute;left:0;bottom:0;height:.5rem;background:rgba(255,255,255,.7);width:${who.length / total * 100}%"></div>
              <span style="display:flex;gap:.2rem;font-size:1.6rem">${who.map(p => p.emoji).join('')}</span>` : ''}</div>`;
          }).join('')}</div>
          <div style="position:absolute;left:0;right:0;bottom:3rem;display:flex;justify-content:center;gap:.8rem">
            ${P.map(p => `<div class="avatar" title="${esc(p.name)}" style="width:3.4rem;height:3.4rem;font-size:2rem;background:${p.color};opacity:${st[p.id].ans != null ? 1 : 0.3};transition:opacity .2s">${p.emoji}</div>`).join('')}</div>`;
      } else if (phase === 'board') {
        const sorted = P.slice().sort((a, b) => st[b.id].score - st[a.id].score);
        const max = Math.max(1, st[sorted[0].id].score);
        html += `<div class="g-center"><div class="g-sub" style="margin:0 0 2rem;letter-spacing:.25em;text-transform:uppercase;color:#f9a8ff">Leaderboard · after ${qi + 1} of ${qs.length}</div>
          <div style="width:60rem;display:flex;flex-direction:column;gap:.8rem">
          ${sorted.slice(0, 8).map((p, i) => `<div style="display:flex;align-items:center;gap:1rem;font-size:1.6rem;font-weight:700">
            <div style="width:2rem;color:#999">${i + 1}</div><div class="avatar" style="width:3rem;height:3rem;font-size:1.8rem;background:${p.color}">${p.emoji}</div>
            <div style="width:12rem;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</div>
            <div style="flex:1;height:2.4rem;background:rgba(255,255,255,.06);border-radius:.5rem;overflow:hidden"><div style="height:100%;width:${st[p.id].score / max * 100}%;background:linear-gradient(90deg,${p.color},#fff3);border-radius:.5rem"></div></div>
            <div style="width:7rem;text-align:right">${st[p.id].score}</div>
            <div style="width:6rem;text-align:left;color:#3ddc84;font-size:1.2rem">${st[p.id].gain ? '+' + st[p.id].gain : ''}${st[p.id].streak >= 3 ? ' 🔥' : ''}</div></div>`).join('')}</div></div>`;
      }
      S.innerHTML = html;
    }
    draw();
    ctx.sendAll({ ui: 'wait', big: '🧠', text: 'Get ready!', sub: 'Answer buttons appear here' });

    return {
      onInput(id, d) {
        if (phase !== 'q' || d.t !== 'choice') return;
        const s = st[id]; if (s.ans != null) return;
        const i = +d.id; if (!(i >= 0 && i < 4)) return;
        s.ans = i; s.at = QTIME - t;
        ctx.sfx('tick');
        ctx.send(id, { ui: 'wait', big: SLOTS[i].shape, text: 'Locked in!', sub: q.opts[i] });
        draw();
        if (live().every(p => st[p.id].ans != null)) t = Math.min(t, 0.6);
      },
      update(dt) {
        t -= dt;
        const bar = document.getElementById('qBar');
        if (bar) bar.style.width = (phase === 'q' ? Math.max(0, t / tMax * 100) : 0) + '%';
        const tt = document.getElementById('qT');
        if (tt) tt.textContent = phase === 'q' ? Math.max(0, Math.ceil(t)) : '✓';
        if (t > 0) return;
        if (phase === 'intro') next();
        else if (phase === 'q') reveal();
        else if (phase === 'reveal') board();
        else if (phase === 'board') next();
      },
    };
  },
});
