// TUG RALLY — Red vs Blue tug-of-war with a verlet rope. Tap to pull.
// Spec: 001 R8, 003 (variants R6.3, fixed step R8.1, rejoin R2.3).
Hub.register({
  id: 'tug', title: 'Tug Rally', emoji: '🪢', genre: 'Teams · Rope physics', category: 'action',
  tagline: 'Red vs Blue. Hammer the button to haul the flag over your line.',
  how: ['You\'re on Red or Blue: check your phone colour', 'Tap PULL as fast as you can', 'Drag the flag over your team\'s line to win the round'],
  min: 2, max: 12, time: '2 min', controls: 'Tap as fast as you can', colors: ['#ff4757', '#3d8bff'],
  settings: [
    { id: 'bestOf', label: 'Match', options: [{ v: 3, label: 'Best of 3' }, { v: 5, label: 'Best of 5' }, { v: 7, label: 'Best of 7' }], def: { quick: 3, standard: 5, long: 7 } },
  ],

  create(ctx) {
    // ---- tuning (R8.2)
    const TUNE = { decay: 2.6, gain: 70 * ctx.diff, damping: 1.4, line: 230, roundCap: 35, tapCap: 3, golden: { every: 4, len: 1.3 } };
    const VARIANTS = [
      { id: 'classic', name: 'Classic', tip: 'Tap tap tap!' },
      { id: 'slippery', name: 'Slippery Rope', tip: 'Your pull fades fast: never stop tapping.' },
      { id: 'golden', name: 'Golden Beats', tip: 'Taps count DOUBLE while the rope glows gold!' },
      { id: 'short', name: 'Short Field', tip: 'The lines are close. Every tap counts!' },
      { id: 'mud', name: 'Mud Pit', tip: 'Heavy going. Pull together!' },
    ];
    const WW = 1600, WH = 900, GY = 600, N = 34;
    const TEAMS = [{ name: 'Red', color: '#ff4757', dark: '#a61d2b' }, { name: 'Blue', color: '#3d8bff', dark: '#1a4aa0' }];
    const P = ctx.players, need = Math.ceil(ctx.settings.bestOf / 2);
    const team = {}; ctx.shuffle(P).forEach((p, i) => { team[p.id] = i % 2; });
    const pw = Object.fromEntries(P.map(p => [p.id, { p: 0, taps: 0, total: 0, bump: 0 }]));
    const wins = [0, 0];
    let round = 0, phase = 'count', t = 0, pos = 0, vel = 0, time = 0, banner = '', bannerT = 0, dust = [], rope = [];
    let v = VARIANTS[0], line = TUNE.line, gold = 0, goldNext = 3;

    function resetRope() {
      rope = [];
      for (let i = 0; i < N; i++) { const x = 200 + (1200 * i) / (N - 1); rope.push({ x, y: GY - 120, px: x, py: GY - 120 }); }
    }
    function tapUI(p) {
      const tm = TEAMS[team[p.id]];
      return { ui: 'tap', label: 'PULL!', sub: `Team ${tm.name} · tap tap tap!`, color: tm.color, top: `Round ${round} · ${v.name} · Red ${wins[0]} – ${wins[1]} Blue` };
    }
    function startRound() {
      round++; pos = 0; vel = 0; time = 0; phase = 'count'; t = 3.4; resetRope();
      v = ctx.variant(VARIANTS); line = v.id === 'short' ? 150 : TUNE.line; gold = 0; goldNext = 3;
      P.forEach(p => { pw[p.id].p = 0; pw[p.id].taps = 0; ctx.send(p.id, tapUI(p)); });
    }
    const teamForce = k => {
      const m = P.filter(p => team[p.id] === k && ctx.isConnected(p.id));
      return m.length ? m.reduce((s, p) => s + pw[p.id].p, 0) / m.length : 0;
    };
    function roundWon(k) {
      phase = 'roundEnd'; wins[k]++;
      P.filter(p => team[p.id] === k).forEach(p => ctx.score(p.id, 3));
      const mvp = P.slice().sort((a, b) => pw[b.id].taps - pw[a.id].taps)[0];
      if (mvp && pw[mvp.id].taps > 0) { ctx.score(mvp.id, 2); ctx.send(mvp.id, { note: 'Round MVP! +2', vibrate: [60, 40, 60] }); }
      banner = `Team ${TEAMS[k].name} takes round ${round}!`; bannerT = 2;
      ctx.sfx('win');
      for (let i = 0; i < 40; i++) dust.push({ x: 800 + pos, y: GY, vx: (Math.random() - 0.5) * 500, vy: -Math.random() * 400, life: 1 });
      ctx.after(1.2, () => ctx.roundOver(`${banner}  Red ${wins[0]} – ${wins[1]} Blue`, () => {
        if (wins[0] < need && wins[1] < need) return startRound();
        const champ = wins[0] >= need ? 0 : 1;
        const top = P.slice().sort((a, b) => pw[b.id].total - pw[a.id].total)[0];
        ctx.end({ awards: [
          top && pw[top.id].total > 0 ? { id: top.id, emoji: '👍', title: `Turbo thumbs · ${pw[top.id].total} taps` } : null,
        ].concat(P.filter(p => team[p.id] === champ).sort((a, b) => pw[b.id].total - pw[a.id].total).slice(0, 1).map(p => ({ id: p.id, emoji: '🏁', title: `Captain of Team ${TEAMS[champ].name} · won ${wins[champ]}–${wins[1 - champ]}` }))).filter(Boolean) });
      }));
    }

    resetRope();
    startRound();

    return {
      onInput(id, d) {
        if (d.t !== 'tap' || phase !== 'play') return;
        let n = Math.max(0, Math.min(TUNE.tapCap, +d.n || 0)); // ~100 ms batches -> cap at ~30 taps/s
        if (gold > 0) n *= 2;
        const s = pw[id]; s.p += n; s.taps += n; s.total += n; s.bump = 1;
      },
      onRejoin(id) { if (phase === 'play' || phase === 'count') ctx.send(id, tapUI(P.find(p => p.id === id))); },

      step(h) {
        const decay = v.id === 'slippery' ? 4.2 : TUNE.decay;
        for (const id in pw) { const s = pw[id]; s.p *= Math.exp(-decay * h); s.bump = Math.max(0, s.bump - h * 5); }
        if (phase === 'play') {
          const net = teamForce(1) - teamForce(0); // + pulls right (blue)
          const gain = TUNE.gain * (v.id === 'mud' ? 0.7 : 1), damp = TUNE.damping * (v.id === 'mud' ? 1.6 : 1);
          vel += net * gain * h; vel *= Math.exp(-damp * h);
          pos += vel * h;
        }
        // verlet rope: ends held by the anchors, jiggle with effort
        const f0 = teamForce(0), f1 = teamForce(1), L = 1200 / (N - 1);
        for (let i = 0; i < N; i++) {
          const r = rope[i], vx = (r.x - r.px) * 0.98, vy = (r.y - r.py) * 0.98;
          r.px = r.x; r.py = r.y; r.x += vx; r.y += vy + 900 * h * h;
        }
        rope[0].x = 200 + pos - Math.min(30, f0 * 4); rope[0].y = GY - 120 + Math.sin(time * 30) * f0 * 0.8;
        rope[N - 1].x = 1400 + pos + Math.min(30, f1 * 4); rope[N - 1].y = GY - 120 + Math.cos(time * 27) * f1 * 0.8;
        for (let k = 0; k < 8; k++) for (let i = 0; i < N - 1; i++) {
          const a = rope[i], b = rope[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const diff = (d - L * 0.995) / d / 2;
          if (i > 0) { a.x += dx * diff; a.y += dy * diff; }
          if (i + 1 < N - 1) { b.x -= dx * diff; b.y -= dy * diff; }
        }
      },
      update(dt) {
        t -= dt; bannerT -= dt;
        dust.forEach(d => { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 900 * dt; d.life -= dt; }); dust = dust.filter(d => d.life > 0);
        if (phase === 'count' && t <= 0) { phase = 'play'; banner = 'PULL!'; bannerT = 0.8; ctx.sfx('start'); }
        if (phase !== 'play') return;
        time += dt;
        if (v.id === 'golden') {
          gold -= dt; goldNext -= dt;
          if (goldNext <= 0) { gold = TUNE.golden.len; goldNext = TUNE.golden.every + Math.random() * 2; ctx.sfx('good'); P.forEach(p => ctx.send(p.id, { vibrate: 60 })); }
        }
        if (pos <= -line) roundWon(0);
        else if (pos >= line) roundWon(1);
        else if (time > TUNE.roundCap) roundWon(pos < 0 ? 0 : 1);
      },
      render(g, W, H) {
        const sky = g.createLinearGradient(0, 0, 0, H);
        if (v.id === 'mud') { sky.addColorStop(0, '#2e2416'); sky.addColorStop(1, '#8a6b3c'); } else { sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.6, '#d53369'); sky.addColorStop(1, '#ffb88c'); }
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.save(); ctx.fit(WW, WH);
        g.fillStyle = 'rgba(255,230,160,.85)'; g.beginPath(); g.arc(800, 430, 150, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5a1d4f'; g.beginPath(); g.moveTo(-400, GY); for (let x = -400; x <= 2000; x += 100) g.lineTo(x, GY - 90 - Math.sin(x * 0.006) * 60); g.lineTo(2000, GY); g.fill();
        g.fillStyle = TEAMS[0].dark; g.fillRect(-400, GY, 1200 - 90, 600);
        g.fillStyle = TEAMS[1].dark; g.fillRect(890, GY, 1200, 600);
        g.fillStyle = v.id === 'mud' ? '#3b2512' : '#4a3020'; g.fillRect(710, GY + 8, 180, 600);
        g.fillStyle = '#6b4630'; g.beginPath(); g.ellipse(800, GY + 10, 90, 14, 0, 0, Math.PI * 2); g.fill();
        [-line, line].forEach((lx, k) => {
          g.setLineDash([16, 12]); g.strokeStyle = TEAMS[k].color; g.lineWidth = 5;
          g.beginPath(); g.moveTo(800 + lx, GY - 330); g.lineTo(800 + lx, GY + 40); g.stroke(); g.setLineDash([]);
        });
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(800, GY - 300); g.lineTo(800, GY + 40); g.stroke();
        g.strokeStyle = gold > 0 ? '#ffd85a' : v.id === 'slippery' ? '#b8f0ff' : '#d9b77a'; g.lineWidth = gold > 0 ? 16 : 12; g.lineCap = 'round'; g.beginPath();
        rope.forEach((r, i) => (i ? g.lineTo(r.x, r.y) : g.moveTo(r.x, r.y))); g.stroke();
        g.strokeStyle = 'rgba(120,80,30,.5)'; g.lineWidth = 3; g.setLineDash([6, 10]); g.stroke(); g.setLineDash([]);
        const mid = rope[N >> 1];
        g.fillStyle = '#fff'; g.fillRect(mid.x - 3, mid.y, 6, 70);
        g.fillStyle = pos < 0 ? TEAMS[0].color : pos > 0 ? TEAMS[1].color : '#ffd85a';
        g.beginPath(); g.moveTo(mid.x + 3, mid.y + 70); g.lineTo(mid.x + 60, mid.y + 85); g.lineTo(mid.x + 3, mid.y + 100); g.fill();
        [0, 1].forEach(k => {
          P.filter(p => team[p.id] === k).forEach((p, i) => {
            const idx = k === 0 ? Math.min(N >> 1, 1 + i * 2) : Math.max(N >> 1, N - 2 - i * 2);
            const r = rope[idx], s = pw[p.id];
            const lean = (k === 0 ? -1 : 1) * Math.min(0.55, 0.15 + s.p * 0.06);
            g.save(); g.translate(r.x, GY); g.rotate(lean);
            g.globalAlpha = ctx.isConnected(p.id) ? 1 : 0.35;
            g.strokeStyle = '#111'; g.lineWidth = 8; g.beginPath(); g.moveTo(-14, 0); g.lineTo(0, -60); g.lineTo(14, 0); g.stroke();
            g.beginPath(); g.arc(0, -95 - s.bump * 6, 34, 0, Math.PI * 2); g.fillStyle = p.color; g.fill();
            g.lineWidth = 4; g.strokeStyle = TEAMS[k].color; g.stroke();
            g.font = '38px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(p.emoji, 0, -92 - s.bump * 6);
            g.rotate(-lean); g.font = '700 18px Outfit, sans-serif'; g.fillStyle = '#fff'; g.fillText(p.name, 0, 30);
            g.restore();
          });
        });
        dust.forEach(d => { g.globalAlpha = Math.max(0, d.life); g.fillStyle = '#ffe9a8'; g.fillRect(d.x, d.y, 7, 7); });
        g.globalAlpha = 1;
        g.restore();
        const u = W / 100;
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.font = `900 ${3.2 * u}px Outfit, sans-serif`;
        g.fillStyle = TEAMS[0].color; g.fillText(`RED ${wins[0]}`, W * 0.3, 2 * u);
        g.fillStyle = '#fff'; g.fillText('–', W / 2, 2 * u);
        g.fillStyle = TEAMS[1].color; g.fillText(`${wins[1]} BLUE`, W * 0.7, 2 * u);
        g.font = `600 ${1.2 * u}px Outfit, sans-serif`; g.fillStyle = 'rgba(255,255,255,.85)';
        g.fillText(`Round ${round} · ${v.name} · first to ${need} rounds`, W / 2, 6.4 * u);
        g.textBaseline = 'middle';
        if (phase === 'count') {
          const n = Math.ceil(t - 0.4);
          g.font = `900 ${12 * u}px Outfit, sans-serif`; g.fillStyle = '#fff'; g.fillText(n > 0 ? n : 'GO', W / 2, H * 0.4);
          g.font = `600 ${1.5 * u}px Outfit, sans-serif`; g.fillText(v.tip, W / 2, H * 0.4 + 8 * u);
        }
        if (gold > 0) { g.font = `900 ${3 * u}px Outfit, sans-serif`; g.fillStyle = '#ffd85a'; g.fillText('✨ GOLDEN BEAT · DOUBLE TAPS ✨', W / 2, H * 0.22); }
        if (bannerT > 0) {
          g.globalAlpha = Math.min(1, bannerT * 2); g.font = `900 ${4.6 * u}px Outfit, sans-serif`;
          g.lineWidth = 0.6 * u; g.strokeStyle = 'rgba(0,0,0,.5)'; g.strokeText(banner, W / 2, H * 0.4); g.fillStyle = '#fff'; g.fillText(banner, W / 2, H * 0.4);
          g.globalAlpha = 1;
        }
      },
    };
  },
});
