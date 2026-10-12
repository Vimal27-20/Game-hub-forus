// BUMPER BRAWL — physics brawler. Shove everyone off a shrinking arena.
// Spec: 001 R8, 003 (variants R6.3, fixed step R8.1, rejoin R2.3).
Hub.register({
  id: 'bumper', title: 'Bumper Brawl', emoji: '💥', genre: 'Physics · Brawler', category: 'action',
  tagline: 'Ram your friends off a shrinking arena. Last one standing wins the round.',
  how: ['Move with the joystick on your phone', 'Tap DASH to ram people', 'Stay on the platform: it shrinks!'],
  min: 2, max: 12, time: '3 min', controls: 'Joystick + Dash', colors: ['#ff3d6e', '#ff9a3d'],
  settings: [
    { id: 'rounds', label: 'Rounds', options: [3, 5, 7], def: { quick: 3, standard: 5, long: 7 } },
    { id: 'arena', label: 'Arena size', options: [{ v: 's', label: 'Small' }, { v: 'm', label: 'Medium' }, { v: 'l', label: 'Large' }], def: 'm' },
  ],

  create(ctx) {
    // ---- tuning (Normal difficulty; R8.2)
    const TUNE = {
      accel: 1700 * ctx.diff, damping: 1.9, maxSpeed: 1100 * ctx.diff, dash: 640 * ctx.diff, dashCd: 1.1,
      restitution: 0.95, bump: 1.22, radius: 34, shrinkAfter: 8, shrinkRate: 6.5 * ctx.diff, roundCap: 75,
      ice: { damping: 0.5, accel: 0.65 }, wind: 420 * ctx.diff,
    };
    const VARIANTS = [
      { id: 'classic', name: 'Classic', tip: 'Joystick to move · DASH to ram · don\'t fall off!' },
      { id: 'ice', name: 'Ice Rink', tip: 'Slippery! You slide further than you think.' },
      { id: 'donut', name: 'Donut', tip: 'Mind the hole in the middle!' },
      { id: 'pinball', name: 'Pinball', tip: 'Spinning bumpers fling you around.' },
      { id: 'wind', name: 'Gusty', tip: 'Watch the wind arrows: gusts push everyone.' },
    ];
    const WW = 1600, WH = 900, CX = 800, CY = 470, BR = TUNE.radius;
    const R0 = { s: 330, m: 400, l: 440 }[ctx.settings.arena] || 400, RMIN = R0 * 0.38, HOLE = 110;
    const ROUNDS = ctx.settings.rounds;
    const kos = {}, survived = {};
    ctx.players.forEach(p => { kos[p.id] = 0; survived[p.id] = 0; });
    let round = 0, phase = 'count', t = 0, playT = 0, R = R0, v = VARIANTS[0];
    let bodies = [], pegs = [], parts = [], feed = [], shake = 0, banner = '', bannerT = 0, spin = 0;
    let wind = { x: 0, y: 0, tx: 0, ty: 0, next: 5 };

    function startRound() {
      round++; R = R0; playT = 0; phase = 'count'; t = 3.4; parts = [];
      v = ctx.variant(VARIANTS);
      const list = ctx.players.filter(p => ctx.isConnected(p.id)), n = list.length;
      bodies = list.map((p, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return { id: p.id, p, x: CX + Math.cos(a) * R0 * 0.62, y: CY + Math.sin(a) * R0 * 0.62, vx: 0, vy: 0,
          ix: 0, iy: 0, tx: 0, ty: 0, alive: true, fall: 0, dashCd: 0, hitBy: null, hitT: -9, flash: 0, trail: [] };
      });
      pegs = v.id === 'pinball' ? [{ a: 0, d: 0, r: 40 }, { a: 0, d: R0 * 0.36, r: 26 }, { a: 2.09, d: R0 * 0.36, r: 26 }, { a: 4.19, d: R0 * 0.36, r: 26 }] : [];
      wind = { x: 0, y: 0, tx: 0, ty: 0, next: 4 };
      for (const b of bodies) ctx.send(b.id, { ui: 'joystick', btn: 'DASH', label: `Round ${round} of ${ROUNDS} · ${v.name}` });
      ctx.players.filter(p => !bodies.some(b => b.id === p.id)).forEach(p => ctx.send(p.id, { ui: 'wait', big: '⏳', text: 'Sitting this round out', sub: 'You\'re back in next round' }));
    }

    function burst(x, y, color, n, sp) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * sp;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, c: color });
      }
    }
    const say = txt => { feed.unshift({ txt, t: 4 }); feed.length = Math.min(feed.length, 4); };

    function eliminate(b) {
      b.alive = false; b.fall = 1;
      for (const a of bodies) if (a.alive) ctx.score(a.id, 1); // survivors gain a point per elimination
      const killer = b.hitBy && playT - b.hitT < 2.5 && bodies.find(x => x.id === b.hitBy);
      if (killer) { ctx.score(killer.id, 2); kos[killer.id]++; say(`${killer.p.emoji} ${killer.p.name} knocked out ${b.p.name}  +2`); }
      else say(`${b.p.emoji} ${b.p.name} fell off!`);
      ctx.send(b.id, { ui: 'wait', big: '😵', text: 'You fell off!', sub: 'Watch the rest of the round on the TV', vibrate: 300 });
      ctx.sfx('bad'); shake = 14;
    }

    function endRound() {
      phase = 'roundEnd';
      const alive = bodies.filter(b => b.alive);
      alive.forEach(b => { ctx.score(b.id, 3); survived[b.id]++; });
      banner = alive.length === 1 ? `${alive[0].p.emoji} ${alive[0].p.name} wins round ${round}!` : alive.length ? 'Time! Survivors share the win' : 'Nobody survived!';
      bannerT = 2; ctx.sfx('win');
      ctx.after(1.2, () => ctx.roundOver(`Round ${round} of ${ROUNDS} · ${banner}`, () => {
        if (round < ROUNDS) startRound();
        else finish();
      }));
    }
    function finish() {
      const awards = [];
      const topKo = ctx.players.slice().sort((a, b) => kos[b.id] - kos[a.id])[0];
      if (topKo && kos[topKo.id] > 0) awards.push({ id: topKo.id, emoji: '🚜', title: `Wrecking ball · ${kos[topKo.id]} knockout${kos[topKo.id] > 1 ? 's' : ''}` });
      const topSv = ctx.players.slice().sort((a, b) => survived[b.id] - survived[a.id])[0];
      if (topSv && survived[topSv.id] > 0) awards.push({ id: topSv.id, emoji: '🧱', title: `Unshakeable · survived ${survived[topSv.id]} round${survived[topSv.id] > 1 ? 's' : ''}` });
      ctx.end({ awards });
    }

    const pegPos = pg => { const a = pg.a + spin * 0.8; return { x: CX + Math.cos(a) * pg.d, y: CY + Math.sin(a) * pg.d }; };
    const offArena = b => {
      const d = Math.hypot(b.x - CX, b.y - CY);
      return d > R + BR * 0.3 || (v.id === 'donut' && d < HOLE - BR * 0.3);
    };

    startRound();

    return {
      onInput(id, d) {
        const b = bodies.find(x => x.id === id);
        if (!b) return;
        if (d.t === 'joy') { b.tx = Math.max(-1, Math.min(1, +d.x || 0)); b.ty = Math.max(-1, Math.min(1, +d.y || 0)); }
        if (d.t === 'btn' && d.down && phase === 'play' && b.alive && b.dashCd <= 0) {
          let dx = b.tx, dy = b.ty, l = Math.hypot(dx, dy);
          if (l < 0.2) { dx = b.vx; dy = b.vy; l = Math.hypot(dx, dy) || 1; }
          b.vx += (dx / l) * TUNE.dash; b.vy += (dy / l) * TUNE.dash;
          b.dashCd = TUNE.dashCd; b.flash = 0.25; ctx.sfx('dash');
          burst(b.x, b.y, '#fff', 8, 200);
        }
      },
      onLeave(id) { const b = bodies.find(x => x.id === id); if (b) { b.tx = b.ty = 0; } }, // body stays, frozen input
      onRejoin(id) {
        const b = bodies.find(x => x.id === id);
        if (!b || !b.alive) ctx.send(id, { ui: 'wait', big: '⏳', text: 'Welcome back!', sub: 'You\'re in from the next round' });
      },

      step(h) {
        if (phase !== 'play') return;
        const ice = v.id === 'ice', damp = Math.exp(-(ice ? TUNE.ice.damping : TUNE.damping) * h);
        const acc = TUNE.accel * (ice ? TUNE.ice.accel : 1);
        for (const b of bodies) {
          if (!b.alive) continue;
          b.ix = ctx.smooth(b.ix, b.tx, h); b.iy = ctx.smooth(b.iy, b.ty, h);
          b.vx += (b.ix * acc + wind.x) * h; b.vy += (b.iy * acc + wind.y) * h;
          b.vx *= damp; b.vy *= damp;
          const sp = Math.hypot(b.vx, b.vy); if (sp > TUNE.maxSpeed) { b.vx *= TUNE.maxSpeed / sp; b.vy *= TUNE.maxSpeed / sp; }
          b.x += b.vx * h; b.y += b.vy * h;
        }
        // body vs body: elastic impulse with a little extra "bump"
        for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i], c = bodies[j];
          if (!a.alive || !c.alive) continue;
          const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
          if (d >= BR * 2 || d === 0) continue;
          const nx = dx / d, ny = dy / d, ov = BR * 2 - d;
          a.x -= nx * ov / 2; a.y -= ny * ov / 2; c.x += nx * ov / 2; c.y += ny * ov / 2;
          const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (rel <= 0) continue;
          const jimp = rel * (1 + TUNE.restitution) / 2 * TUNE.bump;
          a.vx -= jimp * nx; a.vy -= jimp * ny; c.vx += jimp * nx; c.vy += jimp * ny;
          a.hitBy = c.id; a.hitT = playT; c.hitBy = a.id; c.hitT = playT;
          if (rel > 260) {
            burst((a.x + c.x) / 2, (a.y + c.y) / 2, '#ffe36e', Math.min(18, rel / 40 | 0), rel * 0.5);
            shake = Math.max(shake, Math.min(16, rel / 70)); ctx.sfx('bump');
            ctx.send(a.id, { vibrate: 40 }); ctx.send(c.id, { vibrate: 40 });
          }
        }
        for (const pg of pegs) {
          const pp = pegPos(pg);
          for (const b of bodies) {
            if (!b.alive) continue;
            const dx = b.x - pp.x, dy = b.y - pp.y, d = Math.hypot(dx, dy), m = BR + pg.r;
            if (d >= m || d === 0) continue;
            const nx = dx / d, ny = dy / d;
            b.x = pp.x + nx * m; b.y = pp.y + ny * m;
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= 2.3 * vn * nx; b.vy -= 2.3 * vn * ny; }
            b.vx += nx * 180; b.vy += ny * 180;
            burst(pp.x + nx * pg.r, pp.y + ny * pg.r, '#7df9ff', 6, 220); ctx.sfx('pop');
          }
        }
      },

      update(dt) {
        t -= dt; bannerT -= dt; shake *= 0.86; spin += dt;
        feed.forEach(f => { f.t -= dt; }); feed = feed.filter(f => f.t > 0);
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
        parts = parts.filter(p => p.life > 0);
        for (const b of bodies) if (!b.alive && b.fall > 0) { b.fall -= dt * 1.4; b.x += b.vx * dt * 0.4; b.y += b.vy * dt * 0.4; }
        if (phase === 'count') { if (t <= 0) { phase = 'play'; ctx.sfx('start'); banner = 'BRAWL!'; bannerT = 0.9; } return; }
        if (phase !== 'play') return;
        playT += dt;
        R = playT < TUNE.shrinkAfter ? R0 : Math.max(RMIN, R0 - (playT - TUNE.shrinkAfter) * TUNE.shrinkRate);
        if (v.id === 'wind') {
          wind.next -= dt;
          if (wind.next <= 0) { const a = Math.random() * Math.PI * 2; wind.tx = Math.cos(a) * TUNE.wind; wind.ty = Math.sin(a) * TUNE.wind; wind.next = 4 + Math.random() * 3; ctx.sfx('dash'); }
          wind.x += (wind.tx - wind.x) * Math.min(1, dt * 2); wind.y += (wind.ty - wind.y) * Math.min(1, dt * 2);
        }
        for (const b of bodies) {
          if (!b.alive) continue;
          b.dashCd -= dt; b.flash -= dt;
          b.trail.push(b.x, b.y); if (b.trail.length > 16) b.trail.splice(0, 2);
          if (offArena(b)) eliminate(b);
        }
        const alive = bodies.filter(b => b.alive).length;
        if (alive <= (bodies.length > 1 ? 1 : 0) || playT > TUNE.roundCap) endRound();
      },

      render(g, W, H) {
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, v.id === 'ice' ? '#0d2236' : '#1a0f2e'); bg.addColorStop(1, '#07060d');
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.save();
        ctx.fit(WW, WH);
        if (shake > 0.5) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        g.fillStyle = 'rgba(255,255,255,.25)';
        for (let i = 0; i < 70; i++) { const x = (i * 397) % WW, y = (i * 211 + spin * 8 * (1 + i % 3)) % WH; g.fillRect(x, y, 2, 2); }

        const shrinking = phase === 'play' && playT > TUNE.shrinkAfter && R > RMIN;
        g.beginPath(); g.arc(CX, CY + 24, R + 6, 0, Math.PI * 2); g.fillStyle = '#2b1640'; g.fill();
        const fl = g.createRadialGradient(CX, CY - R * 0.3, 20, CX, CY, R);
        if (v.id === 'ice') { fl.addColorStop(0, '#bfe9ff'); fl.addColorStop(1, '#6fb3d9'); } else { fl.addColorStop(0, '#4a3a7a'); fl.addColorStop(1, '#2a2050'); }
        g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.fillStyle = fl; g.fill();
        g.save(); g.clip();
        g.strokeStyle = v.id === 'ice' ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.06)'; g.lineWidth = 2;
        for (let x = CX - R0; x <= CX + R0; x += 60) { g.beginPath(); g.moveTo(x, CY - R0); g.lineTo(x, CY + R0); g.stroke(); }
        for (let y = CY - R0; y <= CY + R0; y += 60) { g.beginPath(); g.moveTo(CX - R0, y); g.lineTo(CX + R0, y); g.stroke(); }
        g.restore();
        if (v.id === 'donut') { g.beginPath(); g.arc(CX, CY, HOLE, 0, Math.PI * 2); g.fillStyle = '#07060d'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#ff4f8b'; g.stroke(); }
        g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2);
        g.lineWidth = 10; g.strokeStyle = shrinking ? `rgba(255,70,90,${0.6 + Math.sin(spin * 10) * 0.4})` : '#ff9a3d'; g.stroke();
        for (const pg of pegs) {
          const pp = pegPos(pg);
          g.beginPath(); g.arc(pp.x, pp.y, pg.r, 0, Math.PI * 2); g.fillStyle = '#123'; g.fill();
          g.lineWidth = 6; g.strokeStyle = '#7df9ff'; g.stroke();
        }
        if (v.id === 'wind' && (wind.x || wind.y)) { // drifting arrows show the gust
          const a = Math.atan2(wind.y, wind.x), s = Math.hypot(wind.x, wind.y) / TUNE.wind;
          g.save(); g.globalAlpha = 0.25 + s * 0.4; g.strokeStyle = '#cfe8ff'; g.lineWidth = 5;
          for (let i = 0; i < 9; i++) {
            const ox = ((i * 233 + spin * 160) % 1400) - 700, oy = ((i * 151) % 700) - 350;
            g.save(); g.translate(CX + ox, CY + oy); g.rotate(a);
            g.beginPath(); g.moveTo(-30, 0); g.lineTo(30, 0); g.lineTo(16, -12); g.moveTo(30, 0); g.lineTo(16, 12); g.stroke(); g.restore();
          }
          g.restore();
        }
        for (const b of bodies) {
          if (!b.alive || b.trail.length < 4) continue;
          g.beginPath(); g.moveTo(b.trail[0], b.trail[1]);
          for (let i = 2; i < b.trail.length; i += 2) g.lineTo(b.trail[i], b.trail[i + 1]);
          g.strokeStyle = b.p.color + '55'; g.lineWidth = BR; g.lineCap = 'round'; g.stroke();
        }
        const order = bodies.slice().sort((a, b) => (a.alive - b.alive) || a.y - b.y);
        for (const b of order) {
          const sc = b.alive ? 1 : Math.max(0, b.fall);
          if (sc <= 0) continue;
          g.save(); g.translate(b.x, b.y); g.scale(sc, sc);
          if (b.alive) { g.beginPath(); g.ellipse(0, BR * 0.9, BR * 0.9, BR * 0.35, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(); }
          g.beginPath(); g.arc(0, 0, BR, 0, Math.PI * 2); g.fillStyle = b.p.color; g.fill();
          g.lineWidth = 5; g.strokeStyle = b.flash > 0 ? '#fff' : ctx.isConnected(b.id) ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.2)'; g.stroke();
          if (b.alive && b.dashCd > 0) {
            g.beginPath(); g.arc(0, 0, BR + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - b.dashCd / TUNE.dashCd));
            g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 4; g.stroke();
          }
          g.font = `${BR * 1.15}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(b.p.emoji, 0, 3);
          g.font = '700 20px Outfit, sans-serif'; g.fillStyle = '#fff';
          g.fillText(b.p.name, 0, -BR - 18);
          g.restore();
        }
        for (const p of parts) { g.globalAlpha = Math.max(0, p.life * 1.6); g.fillStyle = p.c; g.fillRect(p.x - 3, p.y - 3, 6, 6); }
        g.globalAlpha = 1;
        g.restore();

        const u = W / 100;
        g.textBaseline = 'top'; g.textAlign = 'left';
        g.font = `900 ${1.8 * u}px Outfit, sans-serif`; g.fillStyle = '#ff9a3d';
        g.fillText(`ROUND ${round}/${ROUNDS} · ${v.name.toUpperCase()}`, 2.4 * u, 2 * u);
        g.font = `600 ${1.1 * u}px Outfit, sans-serif`; g.fillStyle = 'rgba(255,255,255,.75)';
        feed.forEach((f, i) => { g.globalAlpha = Math.min(1, f.t); g.fillText(f.txt, 2.4 * u, 4.8 * u + i * 1.7 * u); });
        g.globalAlpha = 1;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (phase === 'count') {
          const n = Math.ceil(t - 0.4);
          g.font = `900 ${12 * u}px Outfit, sans-serif`; g.fillStyle = '#fff';
          g.fillText(n > 0 ? n : 'GO', W / 2, H / 2);
          g.font = `600 ${1.5 * u}px Outfit, sans-serif`; g.fillStyle = 'rgba(255,255,255,.85)';
          g.fillText(v.tip, W / 2, H / 2 + 8 * u);
        }
        if (bannerT > 0 && banner) {
          g.globalAlpha = Math.min(1, bannerT * 2);
          g.font = `900 ${4.5 * u}px Outfit, sans-serif`; g.fillStyle = '#fff';
          g.lineWidth = 0.6 * u; g.strokeStyle = 'rgba(0,0,0,.6)';
          g.strokeText(banner, W / 2, H * 0.14); g.fillText(banner, W / 2, H * 0.14);
          g.globalAlpha = 1;
        }
      },
    };
  },
});
