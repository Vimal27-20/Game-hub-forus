// TUG RALLY — team tug-of-war with rope physics. Tap fast to pull.
Hub.register({
  id: 'tug', title: 'Tug Rally', emoji: '🪢', genre: 'Teams · Physics',
  tagline: 'Red vs Blue. Hammer the button to haul the rope over the line. Best of three.',
  min: 2, max: 12, time: '2 min', controls: 'Tap as fast as you can', colors: ['#ff4757', '#3d8bff'],

  create(ctx) {
    const WW = 1600, WH = 900, GY = 600, LINE = 230, N = 34;
    const TEAMS = [{ name: 'Red', color: '#ff4757', dark: '#a61d2b' }, { name: 'Blue', color: '#3d8bff', dark: '#1a4aa0' }];
    const P = ctx.players;
    const mix = shuffle(P);
    const team = {}; mix.forEach((p, i) => team[p.id] = i % 2);
    const scores = Object.fromEntries(P.map(p => [p.id, 0]));
    const pw = Object.fromEntries(P.map(p => [p.id, { p: 0, taps: 0, bump: 0 }]));
    const wins = [0, 0];
    let round = 0, phase, t = 0, pos = 0, vel = 0, time = 0, banner = '', bannerT = 0, dust = [];
    let rope = [];

    function resetRope() {
      rope = [];
      for (let i = 0; i < N; i++) { const x = 200 + (1200 * i) / (N - 1); rope.push({ x, y: GY - 120, px: x, py: GY - 120 }); }
    }
    function startRound() {
      round++; pos = 0; vel = 0; time = 0; phase = 'count'; t = 3.4; resetRope();
      P.forEach(p => { pw[p.id].p = 0; pw[p.id].taps = 0; });
      P.forEach(p => {
        const tm = TEAMS[team[p.id]];
        ctx.send(p.id, { ui: 'tap', label: 'PULL!', sub: `Team ${tm.name} · tap tap tap!`, color: tm.color, top: `Round ${round} · ${TEAMS[0].name} ${wins[0]} – ${wins[1]} ${TEAMS[1].name}` });
      });
    }
    const teamForce = k => {
      const m = P.filter(p => team[p.id] === k && ctx.isConnected(p.id));
      return m.length ? m.reduce((s, p) => s + pw[p.id].p, 0) / m.length : 0;
    };
    function roundWon(k) {
      phase = 'roundEnd'; t = 3.8; wins[k]++;
      const members = P.filter(p => team[p.id] === k);
      members.forEach(p => scores[p.id] += 3);
      const mvp = P.slice().sort((a, b) => pw[b.id].taps - pw[a.id].taps)[0];
      if (mvp && pw[mvp.id].taps > 0) scores[mvp.id] += 2;
      banner = `Team ${TEAMS[k].name} takes round ${round}!`; bannerT = 3.6;
      P.forEach(p => ctx.send(p.id, { ui: 'wait', big: team[p.id] === k ? '💪' : '😩', text: team[p.id] === k ? 'Round won!' : 'Round lost',
        sub: `${pw[p.id].taps} taps${mvp && mvp.id === p.id ? ' · MVP +2!' : ''}`, vibrate: team[p.id] === k ? [60, 40, 60] : 200 }));
      ctx.sfx('win');
      for (let i = 0; i < 40; i++) dust.push({ x: 800 + pos, y: GY, vx: (Math.random() - 0.5) * 500, vy: -Math.random() * 400, life: 1 });
    }

    startRound();

    return {
      onInput(id, d) {
        if (d.t !== 'tap' || phase !== 'play') return;
        const n = Math.max(0, Math.min(3, +d.n || 0)); // ~100ms batches -> cap at ~30 taps/s
        const s = pw[id]; s.p += n; s.taps += n; s.bump = 1;
      },
      update(dt) {
        t -= dt; bannerT -= dt;
        for (const s of Object.values(pw)) { s.p *= Math.exp(-2.6 * dt); s.bump = Math.max(0, s.bump - dt * 5); }
        dust.forEach(d => { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 900 * dt; d.life -= dt; }); dust = dust.filter(d => d.life > 0);
        if (phase === 'count' && t <= 0) { phase = 'play'; banner = 'PULL!'; bannerT = 0.8; ctx.sfx('start'); }
        if (phase === 'play') {
          time += dt;
          const net = teamForce(1) - teamForce(0); // + pulls right (blue)
          vel += net * 70 * dt; vel *= Math.exp(-1.4 * dt);
          pos += vel * dt;
          if (pos <= -LINE) roundWon(0);
          else if (pos >= LINE) roundWon(1);
          else if (time > 35) roundWon(pos < 0 ? 0 : 1);
        }
        if (phase === 'roundEnd' && t <= 0) {
          if (wins[0] < 2 && wins[1] < 2) startRound();
          else { phase = 'done'; ctx.end(P.map(p => ({ id: p.id, score: scores[p.id] }))); return; }
        }
        // verlet rope: ends held by the two anchor players, jiggle with effort
        const f0 = teamForce(0), f1 = teamForce(1);
        const L = 1200 / (N - 1);
        for (let i = 0; i < N; i++) {
          const r = rope[i], vx = (r.x - r.px) * 0.96, vy = (r.y - r.py) * 0.96;
          r.px = r.x; r.py = r.y; r.x += vx; r.y += vy + 900 * dt * dt;
        }
        rope[0].x = 200 + pos - Math.min(30, f0 * 4); rope[0].y = GY - 120 + Math.sin(time * 30) * f0 * 0.8;
        rope[N - 1].x = 1400 + pos + Math.min(30, f1 * 4); rope[N - 1].y = GY - 120 + Math.cos(time * 27) * f1 * 0.8;
        for (let k = 0; k < 12; k++) for (let i = 0; i < N - 1; i++) {
          const a = rope[i], b = rope[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          const diff = (d - L * 0.995) / d / 2;
          if (i > 0) { a.x += dx * diff; a.y += dy * diff; }
          if (i + 1 < N - 1) { b.x -= dx * diff; b.y -= dy * diff; }
        }
      },
      render(g, W, H) {
        const sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#2b1055'); sky.addColorStop(0.6, '#d53369'); sky.addColorStop(1, '#ffb88c');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.save(); ctx.fit(WW, WH);
        // sun + hills
        g.fillStyle = 'rgba(255,230,160,.85)'; g.beginPath(); g.arc(800, 430, 150, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5a1d4f'; g.beginPath(); g.moveTo(-400, GY); for (let x = -400; x <= 2000; x += 100) g.lineTo(x, GY - 90 - Math.sin(x * 0.006) * 60); g.lineTo(2000, GY); g.fill();
        // ground split by a mud pit
        g.fillStyle = TEAMS[0].dark; g.fillRect(-400, GY, 1200 - 90, 600);
        g.fillStyle = TEAMS[1].dark; g.fillRect(890, GY, 1200, 600);
        g.fillStyle = '#4a3020'; g.fillRect(710, GY + 8, 180, 600);
        g.fillStyle = '#6b4630'; g.beginPath(); g.ellipse(800, GY + 10, 90, 14, 0, 0, Math.PI * 2); g.fill();
        // win lines
        [-LINE, LINE].forEach((lx, k) => {
          g.setLineDash([16, 12]); g.strokeStyle = TEAMS[k].color; g.lineWidth = 5;
          g.beginPath(); g.moveTo(800 + lx, GY - 330); g.lineTo(800 + lx, GY + 40); g.stroke(); g.setLineDash([]);
        });
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); g.moveTo(800, GY - 300); g.lineTo(800, GY + 40); g.stroke();
        // rope
        g.strokeStyle = '#d9b77a'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath();
        rope.forEach((r, i) => i ? g.lineTo(r.x, r.y) : g.moveTo(r.x, r.y)); g.stroke();
        g.strokeStyle = 'rgba(120,80,30,.5)'; g.lineWidth = 3; g.setLineDash([6, 10]); g.stroke(); g.setLineDash([]);
        // flag in the middle of the rope
        const mid = rope[N >> 1];
        g.fillStyle = '#fff'; g.fillRect(mid.x - 3, mid.y, 6, 70);
        g.fillStyle = pos < 0 ? TEAMS[0].color : pos > 0 ? TEAMS[1].color : '#ffd85a';
        g.beginPath(); g.moveTo(mid.x + 3, mid.y + 70); g.lineTo(mid.x + 60, mid.y + 85); g.lineTo(mid.x + 3, mid.y + 100); g.fill();
        // players along their side of the rope
        [0, 1].forEach(k => {
          const m = P.filter(p => team[p.id] === k);
          m.forEach((p, i) => {
            const idx = k === 0 ? Math.min(N >> 1, 1 + i * 2) : Math.max(N >> 1, N - 2 - i * 2);
            const r = rope[idx]; const s = pw[p.id];
            const lean = (k === 0 ? -1 : 1) * Math.min(0.55, 0.15 + s.p * 0.06);
            g.save(); g.translate(r.x, GY); g.rotate(lean);
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
        // HUD
        const u = W / 100;
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.font = `900 ${3.2 * u}px Outfit, sans-serif`;
        g.fillStyle = TEAMS[0].color; g.fillText(`RED ${wins[0]}`, W * 0.3, 2 * u);
        g.fillStyle = '#fff'; g.fillText('–', W / 2, 2 * u);
        g.fillStyle = TEAMS[1].color; g.fillText(`${wins[1]} BLUE`, W * 0.7, 2 * u);
        g.font = `600 ${1.2 * u}px Outfit, sans-serif`; g.fillStyle = 'rgba(255,255,255,.8)';
        g.fillText(`Round ${round} · best of 3 · first to drag the flag over their line`, W / 2, 6.4 * u);
        g.textBaseline = 'middle';
        if (phase === 'count') {
          const n = Math.ceil(t - 0.4);
          g.font = `900 ${12 * u}px Outfit, sans-serif`; g.fillStyle = '#fff'; g.fillText(n > 0 ? n : 'GO', W / 2, H * 0.4);
        }
        if (bannerT > 0) {
          g.globalAlpha = Math.min(1, bannerT * 2); g.font = `900 ${4.6 * u}px Outfit, sans-serif`;
          g.lineWidth = 0.6 * u; g.strokeStyle = 'rgba(0,0,0,.5)'; g.strokeText(banner, W / 2, H * 0.4); g.fillStyle = '#fff'; g.fillText(banner, W / 2, H * 0.4);
          g.globalAlpha = 1;
        }
      },
    };
  },
});
