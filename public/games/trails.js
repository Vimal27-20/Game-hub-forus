// LIGHT TRAILS — light cycles on a grid. Avoid every trail; last rider standing wins.
// Spec: 003 R7 (new game), R8 (fixed-step ticks, tuning block), R6.3 (arena modifiers).
Hub.register({
  id: 'trails', title: 'Light Trails', emoji: '🐍', genre: 'Light cycles · Survival', category: 'action',
  tagline: 'Leave a wall of light behind you. Make everyone else crash into it.',
  how: ['Steer with the arrow pad on your phone', 'Don\'t hit any trail, wall or block', 'BOOST for a burst of speed. Last one riding wins the round'],
  min: 2, max: 12, time: '3 min', controls: 'Arrow pad + Boost', colors: ['#00e5ff', '#7c4dff'],
  settings: [
    { id: 'rounds', label: 'Rounds', options: [3, 5, 7], def: { quick: 3, standard: 5, long: 7 } },
    { id: 'speed', label: 'Speed', options: [{ v: 0.8, label: 'Cruise' }, { v: 1, label: 'Normal' }, { v: 1.25, label: 'Turbo' }], def: 1 },
  ],

  create(ctx) {
    // ---- tuning (R8.2)
    const TUNE = { cols: 96, rows: 54, rate: 14 * ctx.settings.speed * ctx.diff, boost: 1.8, boostLen: 1.2, boostCd: 5, roundCap: 90, shrinkEvery: 5, speedUp: 0.035 };
    const VARIANTS = [
      { id: 'classic', name: 'Classic', tip: 'Walls are deadly. Box them in!' },
      { id: 'wrap', name: 'Wrap Around', tip: 'No walls! Ride off one edge and appear on the other.' },
      { id: 'blocks', name: 'Blocks', tip: 'Watch out for the blocks in the arena.' },
      { id: 'shrink', name: 'Closing In', tip: 'The arena edge closes in every few seconds.' },
      { id: 'speedup', name: 'Overdrive', tip: 'Everyone gets faster and faster…' },
    ];
    const C = TUNE.cols, R = TUNE.rows, WW = 1600, WH = 900, CS = WW / C;
    const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
    const P = ctx.players, ROUNDS = ctx.settings.rounds;
    const kills = Object.fromEntries(P.map(p => [p.id, 0])), wins = Object.fromEntries(P.map(p => [p.id, 0]));
    let round = 0, phase = 'count', t = 0, playT = 0, v = VARIANTS[0], grid, owner, riders = [], acc = 0, rate = TUNE.rate, border = 0, shrinkT = 0;
    let off = null, offG = null, banner = '', bannerT = 0, sparks = [];

    function newOffscreen() {
      off = document.createElement('canvas'); off.width = C * 10; off.height = R * 10;
      offG = off.getContext('2d'); offG.clearRect(0, 0, off.width, off.height);
    }
    const idx = (x, y) => y * C + x;
    function paintCell(x, y, color) { offG.fillStyle = color; offG.fillRect(x * 10, y * 10, 10, 10); }
    function block(x, y, color) { grid[idx(x, y)] = 1; paintCell(x, y, color); }

    function startRound() {
      round++; phase = 'count'; t = 3.4; playT = 0; acc = 0; border = 0; shrinkT = TUNE.shrinkEvery; sparks = [];
      v = ctx.variant(VARIANTS); rate = TUNE.rate;
      grid = new Uint8Array(C * R); owner = new Array(C * R).fill(null); newOffscreen();
      const live = P.filter(p => ctx.isConnected(p.id)), n = live.length;
      riders = live.map((p, i) => {
        // spawn on an ellipse, facing the centre (R8.4: spaced apart, nothing in front)
        const a = (i / n) * Math.PI * 2 + Math.PI / 4;
        const x = Math.round(C / 2 + Math.cos(a) * C * 0.36), y = Math.round(R / 2 + Math.sin(a) * R * 0.36);
        const ddx = C / 2 - x, ddy = R / 2 - y, d = Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 1 : 3) : (ddy > 0 ? 2 : 0);
        return { id: p.id, p, x, y, d, q: [], alive: true, boost: 0, cd: 0, half: 0 };
      });
      riders.forEach(r => { grid[idx(r.x, r.y)] = 1; owner[idx(r.x, r.y)] = r.id; paintCell(r.x, r.y, r.p.color); });
      if (v.id === 'blocks') {
        for (let k = 0; k < 9; k++) {
          const bw = 2 + (Math.random() * 4 | 0), bh = 2 + (Math.random() * 4 | 0);
          const bx = 6 + (Math.random() * (C - 12 - bw) | 0), by = 5 + (Math.random() * (R - 10 - bh) | 0);
          const nearRider = riders.some(r => Math.abs(r.x - bx - bw / 2) < 9 && Math.abs(r.y - by - bh / 2) < 7);
          if (nearRider) continue;
          for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) block(x, y, '#3a3f5c');
        }
      }
      riders.forEach(r => ctx.send(r.id, { ui: 'dpad', btn: 'BOOST', label: `Round ${round} of ${ROUNDS} · ${v.name}`, color: r.p.color }));
      P.filter(p => !riders.some(r => r.id === p.id)).forEach(p => ctx.send(p.id, { ui: 'wait', big: '⏳', text: 'Sitting this round out', sub: 'You\'re back in next round' }));
    }

    function crash(r, by) {
      r.alive = false;
      for (const o of riders) if (o.alive) ctx.score(o.id, 1);
      if (by && by !== r.id) { kills[by]++; }
      for (let i = 0; i < 26; i++) { const a = Math.random() * 6.28; sparks.push({ x: (r.x + 0.5) * CS, y: (r.y + 0.5) * CS, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 0.7, c: r.p.color }); }
      ctx.send(r.id, { ui: 'wait', big: '💥', text: 'Crashed!', sub: 'Watch the others on the TV', vibrate: 300 });
      ctx.sfx('bad');
    }
    function tick(half) {
      // Riders move on every half-tick while boosting, otherwise on even half-ticks only.
      const movers = riders.filter(r => r.alive && (r.boost > 0 || half % 2 === 0));
      for (const r of movers) {
        while (r.q.length) { const d = r.q.shift(); if (d !== r.d && d !== (r.d + 2) % 4) { r.d = d; break; } }
        let nx = r.x + DX[r.d], ny = r.y + DY[r.d];
        if (v.id === 'wrap') { nx = (nx + C) % C; ny = (ny + R) % R; }
        r.nx = nx; r.ny = ny;
      }
      const dead = new Map();
      for (const r of movers) {
        const out = r.nx < border || r.ny < border || r.nx >= C - border || r.ny >= R - border;
        if (out) { dead.set(r, null); continue; }
        const k = idx(r.nx, r.ny);
        if (grid[k]) { dead.set(r, owner[k]); continue; }
        const clash = movers.find(o => o !== r && o.nx === r.nx && o.ny === r.ny);
        if (clash) { dead.set(r, clash.id); continue; }
        const swap = movers.find(o => o !== r && o.nx === r.x && o.ny === r.y && r.nx === o.x && r.ny === o.y);
        if (swap) dead.set(r, swap.id);
      }
      for (const r of movers) {
        if (dead.has(r)) { crash(r, dead.get(r)); continue; }
        r.x = r.nx; r.y = r.ny;
        const k = idx(r.x, r.y); grid[k] = 1; owner[k] = r.id; paintCell(r.x, r.y, r.p.color);
      }
    }
    function closeIn() {
      border++;
      for (let x = 0; x < C; x++) { block(x, border - 1, '#5a1d3a'); block(x, R - border, '#5a1d3a'); }
      for (let y = 0; y < R; y++) { block(border - 1, y, '#5a1d3a'); block(C - border, y, '#5a1d3a'); }
      ctx.sfx('tick');
    }
    function endRound() {
      phase = 'roundEnd';
      const alive = riders.filter(r => r.alive);
      alive.forEach(r => { ctx.score(r.id, 3); wins[r.id]++; });
      banner = alive.length === 1 ? `${alive[0].p.emoji} ${alive[0].p.name} rides alone!` : alive.length ? 'Time! Survivors share it' : 'Total wipeout!';
      bannerT = 2; ctx.sfx('win');
      ctx.after(1, () => ctx.roundOver(`Round ${round} of ${ROUNDS} · ${banner}`, () => {
        if (round < ROUNDS) return startRound();
        const awards = [];
        const k = P.slice().sort((a, b) => kills[b.id] - kills[a.id])[0];
        if (k && kills[k.id] > 0) awards.push({ id: k.id, emoji: '🧱', title: `Wall builder · ${kills[k.id]} riders crashed into their trail` });
        const w = P.slice().sort((a, b) => wins[b.id] - wins[a.id])[0];
        if (w && wins[w.id] > 0) awards.push({ id: w.id, emoji: '🏍️', title: `Last rider ${wins[w.id]}×` });
        ctx.end({ awards });
      }));
    }

    startRound();
    let half = 0;

    return {
      onInput(id, d) {
        const r = riders.find(x => x.id === id);
        if (!r || !r.alive) return;
        if (d.t === 'dir') { const dir = d.d | 0; if (dir >= 0 && dir < 4 && r.q.length < 2) r.q.push(dir); }
        if (d.t === 'btn' && d.down && phase === 'play' && r.cd <= 0) { r.boost = TUNE.boostLen; r.cd = TUNE.boostCd; ctx.sfx('dash'); ctx.send(id, { vibrate: 40 }); }
      },
      onRejoin(id) {
        const r = riders.find(x => x.id === id);
        if (!r || !r.alive) ctx.send(id, { ui: 'wait', big: '⏳', text: 'Welcome back!', sub: 'You\'re in from the next round' });
      },
      step(h) {
        if (phase !== 'play') return;
        acc += h;
        const per = 1 / (rate * 2);
        while (acc >= per) { acc -= per; tick(half++); if (phase !== 'play') return; }
        for (const r of riders) { r.boost -= h; r.cd -= h; }
      },
      update(dt) {
        t -= dt; bannerT -= dt;
        for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.9; s.vy *= 0.9; s.life -= dt; }
        sparks = sparks.filter(s => s.life > 0);
        if (phase === 'count') { if (t <= 0) { phase = 'play'; banner = 'RIDE!'; bannerT = 0.8; ctx.sfx('start'); } return; }
        if (phase !== 'play') return;
        playT += dt;
        if (v.id === 'speedup') rate = TUNE.rate * (1 + playT * TUNE.speedUp);
        if (v.id === 'shrink') { shrinkT -= dt; if (shrinkT <= 0 && border < 18) { shrinkT = TUNE.shrinkEvery; closeIn(); } }
        const alive = riders.filter(r => r.alive).length;
        if (alive <= (riders.length > 1 ? 1 : 0) || playT > TUNE.roundCap) endRound();
      },
      render(g, W, H) {
        g.fillStyle = '#05060f'; g.fillRect(0, 0, W, H);
        g.save(); ctx.fit(WW, WH);
        g.strokeStyle = 'rgba(0,229,255,.07)'; g.lineWidth = 1;
        for (let x = 0; x <= C; x += 4) { g.beginPath(); g.moveTo(x * CS, 0); g.lineTo(x * CS, WH); g.stroke(); }
        for (let y = 0; y <= R; y += 4) { g.beginPath(); g.moveTo(0, y * CS); g.lineTo(WW, y * CS); g.stroke(); }
        g.imageSmoothingEnabled = false;
        g.drawImage(off, 0, 0, WW, WH);
        g.lineWidth = 6; g.strokeStyle = v.id === 'wrap' ? 'rgba(124,77,255,.35)' : '#00e5ff';
        if (v.id === 'wrap') g.setLineDash([20, 16]);
        g.strokeRect(border * CS, border * CS, WW - border * 2 * CS, WH - border * 2 * CS); g.setLineDash([]);
        for (const r of riders) {
          if (!r.alive) continue;
          const x = (r.x + 0.5) * CS, y = (r.y + 0.5) * CS;
          g.beginPath(); g.arc(x, y, r.boost > 0 ? 22 : 16, 0, 6.29); g.fillStyle = r.p.color + '55'; g.fill();
          g.beginPath(); g.arc(x, y, 9, 0, 6.29); g.fillStyle = '#fff'; g.fill();
          g.font = '26px serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(r.p.emoji, x, y - 12);
          if (phase === 'count') { // show which way each rider will go
            g.strokeStyle = r.p.color; g.lineWidth = 4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + DX[r.d] * 50, y + DY[r.d] * 50); g.stroke();
          }
        }
        for (const s of sparks) { g.globalAlpha = Math.max(0, s.life); g.fillStyle = s.c; g.fillRect(s.x - 3, s.y - 3, 6, 6); }
        g.globalAlpha = 1;
        g.restore();
        const u = W / 100;
        g.textAlign = 'left'; g.textBaseline = 'top'; g.font = `900 ${1.8 * u}px Outfit, sans-serif`; g.fillStyle = '#00e5ff';
        g.fillText(`ROUND ${round}/${ROUNDS} · ${v.name.toUpperCase()}`, 2.4 * u, 2 * u);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (phase === 'count') {
          const n = Math.ceil(t - 0.4);
          g.font = `900 ${12 * u}px Outfit, sans-serif`; g.fillStyle = '#fff'; g.fillText(n > 0 ? n : 'GO', W / 2, H / 2);
          g.font = `600 ${1.5 * u}px Outfit, sans-serif`; g.fillText(v.tip, W / 2, H / 2 + 8 * u);
        }
        if (bannerT > 0) {
          g.globalAlpha = Math.min(1, bannerT * 2); g.font = `900 ${4.5 * u}px Outfit, sans-serif`;
          g.lineWidth = 0.6 * u; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(banner, W / 2, H * 0.14); g.fillStyle = '#fff'; g.fillText(banner, W / 2, H * 0.14);
          g.globalAlpha = 1;
        }
      },
    };
  },
});
