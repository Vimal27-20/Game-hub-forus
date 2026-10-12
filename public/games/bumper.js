// BUMPER BRAWL — physics brawler. Shove everyone off a shrinking arena.
Hub.register({
  id: 'bumper', title: 'Bumper Brawl', emoji: '💥', genre: 'Physics · Brawler',
  tagline: 'Ram your friends off a shrinking arena. Last one standing wins the round.',
  min: 2, max: 12, time: '3 min', controls: 'Joystick + Dash', colors: ['#ff3d6e', '#ff9a3d'],

  create(ctx) {
    const WW = 1600, WH = 900, CX = 800, CY = 470;
    const ROUNDS = 3, R0 = 400, RMIN = 150, BR = 34;
    const scores = Object.fromEntries(ctx.players.map(p => [p.id, 0]));
    let round = 0, phase = 'count', t = 0, playT = 0, R = R0;
    let bodies = [], pegs = [], parts = [], feed = [], shake = 0, banner = '', bannerT = 0, spin = 0;

    function startRound() {
      round++; R = R0; playT = 0; phase = 'count'; t = 3.4; parts = [];
      const list = ctx.players.filter(p => ctx.isConnected(p.id));
      const n = list.length;
      bodies = list.map((p, i) => {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        return { id: p.id, p, x: CX + Math.cos(a) * R0 * 0.62, y: CY + Math.sin(a) * R0 * 0.62, vx: 0, vy: 0,
          ix: 0, iy: 0, alive: true, fall: 0, dashCd: 0, hitBy: null, hitT: -9, flash: 0, trail: [] };
      });
      // Round 2+: spinning bumper posts make the middle dangerous too
      pegs = round === 1 ? [] : [0, 1, 2].map(i => ({ a: (i / 3) * Math.PI * 2, d: round === 2 ? 0 : 150, r: 30 }));
      if (round === 2) pegs = [{ a: 0, d: 0, r: 46 }];
      for (const b of bodies) ctx.send(b.id, { ui: 'joystick', btn: 'DASH', label: `Round ${round} of ${ROUNDS} · stay on the platform!` });
    }

    function burst(x, y, color, n, sp) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * sp;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, c: color });
      }
    }
    const say = txt => { feed.unshift({ txt, t: 4 }); feed.length = Math.min(feed.length, 4); };

    function eliminate(b, quiet) {
      b.alive = false; b.fall = 1;
      if (quiet) return;
      const alive = bodies.filter(x => x.alive);
      for (const a of alive) scores[a.id] += 1; // survivors gain a point per elimination
      const killer = b.hitBy && playT - b.hitT < 2.5 && bodies.find(x => x.id === b.hitBy);
      if (killer) { scores[killer.id] += 2; say(`${killer.p.emoji} ${killer.p.name} knocked out ${b.p.name}  +2`); }
      else say(`${b.p.emoji} ${b.p.name} fell off!`);
      ctx.send(b.id, { ui: 'wait', big: '😵', text: 'You fell off!', sub: 'Watch the rest of the round on the TV', vibrate: 300 });
      ctx.sfx('bad'); shake = 14;
    }

    function endRound() {
      phase = 'roundEnd'; t = 3.6;
      const alive = bodies.filter(b => b.alive);
      alive.forEach(b => { scores[b.id] += 3; ctx.send(b.id, { ui: 'wait', big: '🏆', text: 'You survived!', sub: '+3 points', vibrate: [60, 40, 60] }); });
      banner = alive.length === 1 ? `${alive[0].p.emoji} ${alive[0].p.name} wins round ${round}!` : alive.length ? 'Time! Survivors share the win' : 'Nobody survived!';
      bannerT = 3.6; ctx.sfx('win');
    }

    startRound();

    return {
      onInput(id, d) {
        const b = bodies.find(x => x.id === id);
        if (!b) return;
        if (d.t === 'joy') { b.ix = Math.max(-1, Math.min(1, +d.x || 0)); b.iy = Math.max(-1, Math.min(1, +d.y || 0)); }
        if (d.t === 'btn' && d.down && phase === 'play' && b.alive && b.dashCd <= 0) {
          let dx = b.ix, dy = b.iy, l = Math.hypot(dx, dy);
          if (l < 0.2) { dx = b.vx; dy = b.vy; l = Math.hypot(dx, dy) || 1; }
          b.vx += (dx / l) * 640; b.vy += (dy / l) * 640;
          b.dashCd = 1.1; b.flash = 0.25; ctx.sfx('dash');
          burst(b.x, b.y, '#fff', 8, 200);
        }
      },
      onLeave(id) { const b = bodies.find(x => x.id === id); if (b && b.alive) eliminate(b, true); },

      update(dt) {
        t -= dt; bannerT -= dt; shake *= 0.86; spin += dt;
        feed.forEach(f => f.t -= dt); feed = feed.filter(f => f.t > 0);
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
        parts = parts.filter(p => p.life > 0);
        for (const b of bodies) if (!b.alive && b.fall > 0) { b.fall -= dt * 1.4; b.x += b.vx * dt * 0.4; b.y += b.vy * dt * 0.4; }

        if (phase === 'count') { if (t <= 0) { phase = 'play'; ctx.sfx('start'); banner = 'BRAWL!'; bannerT = 0.9; } return; }
        if (phase === 'roundEnd') {
          if (t <= 0) {
            if (round < ROUNDS) startRound();
            else ctx.end(ctx.players.map(p => ({ id: p.id, score: scores[p.id] })));
          }
          return;
        }
        // ---- play
        playT += dt;
        R = playT < 8 ? R0 : Math.max(RMIN, R0 - (playT - 8) * 6.5);
        const steps = 3, h = dt / steps;
        for (let s = 0; s < steps; s++) {
          for (const b of bodies) {
            if (!b.alive) continue;
            b.vx += b.ix * 1700 * h; b.vy += b.iy * 1700 * h;
            const damp = Math.exp(-1.9 * h); b.vx *= damp; b.vy *= damp;
            const sp = Math.hypot(b.vx, b.vy); if (sp > 1100) { b.vx *= 1100 / sp; b.vy *= 1100 / sp; }
            b.x += b.vx * h; b.y += b.vy * h;
          }
          // body vs body: elastic impulse with a little extra "bump"
          for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
            const a = bodies[i], c = bodies[j];
            if (!a.alive || !c.alive) continue;
            let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
            if (d >= BR * 2 || d === 0) continue;
            const nx = dx / d, ny = dy / d, ov = BR * 2 - d;
            a.x -= nx * ov / 2; a.y -= ny * ov / 2; c.x += nx * ov / 2; c.y += ny * ov / 2;
            const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
            if (rel <= 0) continue;
            const jimp = rel * (1 + 0.95) / 2 * 1.22;
            a.vx -= jimp * nx; a.vy -= jimp * ny; c.vx += jimp * nx; c.vy += jimp * ny;
            a.hitBy = c.id; a.hitT = playT; c.hitBy = a.id; c.hitT = playT;
            if (rel > 260) {
              burst((a.x + c.x) / 2, (a.y + c.y) / 2, '#ffe36e', Math.min(18, rel / 40 | 0), rel * 0.5);
              shake = Math.max(shake, Math.min(16, rel / 70)); ctx.sfx('bump');
              ctx.send(a.id, { vibrate: 40 }); ctx.send(c.id, { vibrate: 40 });
            }
          }
          // pegs
          for (const pg of pegs) {
            const ang = pg.a + spin * 0.8;
            const px = CX + Math.cos(ang) * pg.d, py = CY + Math.sin(ang) * pg.d;
            for (const b of bodies) {
              if (!b.alive) continue;
              const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), m = BR + pg.r;
              if (d >= m || d === 0) continue;
              const nx = dx / d, ny = dy / d;
              b.x = px + nx * m; b.y = py + ny * m;
              const vn = b.vx * nx + b.vy * ny;
              if (vn < 0) { b.vx -= 2.3 * vn * nx; b.vy -= 2.3 * vn * ny; }
              b.vx += nx * 180; b.vy += ny * 180;
              burst(px + nx * pg.r, py + ny * pg.r, '#7df9ff', 6, 220); ctx.sfx('pop');
            }
          }
        }
        for (const b of bodies) {
          if (!b.alive) continue;
          b.dashCd -= dt; b.flash -= dt;
          b.trail.push(b.x, b.y); if (b.trail.length > 16) b.trail.splice(0, 2);
          if (Math.hypot(b.x - CX, b.y - CY) > R + BR * 0.3) eliminate(b);
        }
        const alive = bodies.filter(b => b.alive).length;
        if (alive <= 1 || playT > 75) endRound();
      },

      render(g, W, H) {
        const bg = g.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#1a0f2e'); bg.addColorStop(1, '#07060d');
        g.fillStyle = bg; g.fillRect(0, 0, W, H);
        g.save();
        ctx.fit(WW, WH);
        if (shake > 0.5) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

        // void stars
        g.fillStyle = 'rgba(255,255,255,.25)';
        for (let i = 0; i < 70; i++) { const x = (i * 397) % WW, y = (i * 211 + spin * 8 * (1 + i % 3)) % WH; g.fillRect(x, y, 2, 2); }

        // arena: danger ring, floor, grid
        const shrinking = phase === 'play' && playT > 8 && R > RMIN;
        g.beginPath(); g.arc(CX, CY + 24, R + 6, 0, Math.PI * 2); g.fillStyle = '#2b1640'; g.fill();
        const fl = g.createRadialGradient(CX, CY - R * 0.3, 20, CX, CY, R);
        fl.addColorStop(0, '#4a3a7a'); fl.addColorStop(1, '#2a2050');
        g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.fillStyle = fl; g.fill();
        g.save(); g.clip();
        g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 2;
        for (let x = CX - R0; x <= CX + R0; x += 60) { g.beginPath(); g.moveTo(x, CY - R0); g.lineTo(x, CY + R0); g.stroke(); }
        for (let y = CY - R0; y <= CY + R0; y += 60) { g.beginPath(); g.moveTo(CX - R0, y); g.lineTo(CX + R0, y); g.stroke(); }
        g.restore();
        g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2);
        g.lineWidth = 10; g.strokeStyle = shrinking ? `rgba(255,70,90,${0.6 + Math.sin(spin * 10) * 0.4})` : '#ff9a3d'; g.stroke();

        // pegs
        for (const pg of pegs) {
          const ang = pg.a + spin * 0.8, px = CX + Math.cos(ang) * pg.d, py = CY + Math.sin(ang) * pg.d;
          g.beginPath(); g.arc(px, py, pg.r, 0, Math.PI * 2); g.fillStyle = '#123'; g.fill();
          g.lineWidth = 6; g.strokeStyle = '#7df9ff'; g.stroke();
        }

        // trails
        for (const b of bodies) {
          if (!b.alive || b.trail.length < 4) continue;
          g.beginPath(); g.moveTo(b.trail[0], b.trail[1]);
          for (let i = 2; i < b.trail.length; i += 2) g.lineTo(b.trail[i], b.trail[i + 1]);
          g.strokeStyle = b.p.color + '55'; g.lineWidth = BR; g.lineCap = 'round'; g.stroke();
        }

        // players
        const order = bodies.slice().sort((a, b) => (a.alive - b.alive) || a.y - b.y);
        for (const b of order) {
          const sc = b.alive ? 1 : Math.max(0, b.fall);
          if (sc <= 0) continue;
          g.save(); g.translate(b.x, b.y); g.scale(sc, sc);
          if (b.alive) { g.beginPath(); g.ellipse(0, BR * 0.9, BR * 0.9, BR * 0.35, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(); }
          g.beginPath(); g.arc(0, 0, BR, 0, Math.PI * 2); g.fillStyle = b.p.color; g.fill();
          g.lineWidth = 5; g.strokeStyle = b.flash > 0 ? '#fff' : 'rgba(255,255,255,.75)'; g.stroke();
          if (b.alive && b.dashCd > 0) {
            g.beginPath(); g.arc(0, 0, BR + 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - b.dashCd / 1.1));
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

        // HUD (screen space)
        const u = W / 100;
        g.textBaseline = 'top'; g.textAlign = 'left';
        g.font = `900 ${1.8 * u}px Outfit, sans-serif`; g.fillStyle = '#ff9a3d';
        g.fillText(`ROUND ${round}/${ROUNDS}`, 2.4 * u, 2 * u);
        g.font = `600 ${1.1 * u}px Outfit, sans-serif`; g.fillStyle = 'rgba(255,255,255,.75)';
        feed.forEach((f, i) => { g.globalAlpha = Math.min(1, f.t); g.fillText(f.txt, 2.4 * u, 4.8 * u + i * 1.7 * u); });
        g.globalAlpha = 1;
        const sorted = ctx.players.slice().sort((a, b) => scores[b.id] - scores[a.id]).slice(0, 6);
        g.textAlign = 'right';
        sorted.forEach((p, i) => {
          g.font = `700 ${1.2 * u}px Outfit, sans-serif`; g.fillStyle = i === 0 ? '#ffd85a' : '#fff';
          g.fillText(`${p.emoji} ${p.name}   ${scores[p.id]}`, W - 2.4 * u, 2 * u + i * 1.9 * u);
        });
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (phase === 'count') {
          const n = Math.ceil(t - 0.4);
          g.font = `900 ${12 * u}px Outfit, sans-serif`; g.fillStyle = '#fff';
          g.fillText(n > 0 ? n : 'GO', W / 2, H / 2);
          g.font = `600 ${1.5 * u}px Outfit, sans-serif`; g.fillStyle = 'rgba(255,255,255,.8)';
          g.fillText(round === 1 ? 'Joystick to move · DASH to ram · don\'t fall off!' : round === 2 ? 'Watch out for the bumper in the middle!' : 'Final round — spinning bumpers!', W / 2, H / 2 + 8 * u);
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
