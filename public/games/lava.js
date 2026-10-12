// LAVA RISE — climb a tower of platforms as the lava rises. Bonk rivals on the head.
// Spec: 003 R7 (new game), R8 (fixed step, tuning block, input smoothing), R6.3 (modifiers).
Hub.register({
  id: 'lava', title: 'Lava Rise', emoji: '🌋', genre: 'Platformer · Climb', category: 'action',
  tagline: 'Jump up the tower before the lava gets you. Land on heads to bonk rivals.',
  how: ['Joystick left/right to run, JUMP to jump (hold for higher)', 'Keep climbing: the lava never stops rising', 'Land on someone\'s head to bonk them down'],
  min: 1, max: 12, time: '3 min', controls: 'Joystick + Jump', colors: ['#ff6a00', '#ee0979'],
  settings: [
    { id: 'rounds', label: 'Rounds', options: [2, 3, 4], def: { quick: 2, standard: 3, long: 4 } },
  ],

  create(ctx) {
    // ---- tuning (R8.2)
    const TUNE = {
      gravity: 2600, jump: -1050, cut: 0.45, run: 5200, air: 0.6, maxRun: 520, friction: 12, iceFriction: 1.5,
      coyote: 0.1, buffer: 0.12, lava0: 40 * ctx.diff, lavaAcc: 2.2 * ctx.diff, lavaRush: 60, bonk: -800, stun: 0.6,
      spring: -1550, crumble: 0.6, wind: 600 * ctx.diff, rowGap: 140, reach: 420, pw: 40, ph: 48, roundCap: 90,
    };
    const VARIANTS = [
      { id: 'classic', name: 'Classic', tip: 'Climb! The lava is coming.' },
      { id: 'crumble', name: 'Crumbling', tip: 'Platforms crumble soon after you land. Keep moving!' },
      { id: 'moving', name: 'Sliders', tip: 'Some platforms slide side to side.' },
      { id: 'springs', name: 'Springs', tip: 'Land on a spring pad to launch sky-high!' },
      { id: 'ice', name: 'Icy', tip: 'Slippery platforms: careful near the edges.' },
      { id: 'wind', name: 'Windy', tip: 'Gusts push everyone sideways.' },
    ];
    const WW = 1600, WH = 900, FLOOR = 800, P = ctx.players, ROUNDS = ctx.settings.rounds;
    const height = Object.fromEntries(P.map(p => [p.id, 0])), bonks = Object.fromEntries(P.map(p => [p.id, 0]));
    let round = 0, phase = 'count', t = 0, playT = 0, v = VARIANTS[0], plats = [], bodies = [], lavaY = 0, camY = 0, topRow = 0;
    let wind = 0, windT = 0, windNext = 4, parts = [], banner = '', bannerT = 0;

    function addRow() {
      const y = FLOOR - (topRow + 1) * TUNE.rowGap; topRow++;
      const prev = plats.filter(p => Math.abs(p.y - (y + TUNE.rowGap)) < 1);
      const n = 1 + (Math.random() * 3 | 0), row = [];
      for (let i = 0; i < n; i++) {
        const w = 180 + Math.random() * 160;
        let x;
        if (i === 0 && prev.length) { // guarantee one platform within reach of the row below
          const base = prev[Math.random() * prev.length | 0], cx = base.x + base.w / 2 + (Math.random() - 0.5) * TUNE.reach * 1.4;
          x = Math.max(20, Math.min(WW - 20 - w, cx - w / 2));
        } else x = 20 + Math.random() * (WW - 40 - w);
        if (row.some(r => x < r.x + r.w + 60 && x + w + 60 > r.x)) continue;
        const pl = { x, y, w, x0: x, ph: Math.random() * 6.28, crumble: -1, gone: false, spring: false, slide: 0 };
        if (v.id === 'moving' && Math.random() < 0.35) pl.slide = 90 + Math.random() * 60;
        if (v.id === 'springs' && Math.random() < 0.2 && topRow > 1) pl.spring = true;
        row.push(pl);
      }
      plats.push.apply(plats, row);
    }

    function startRound() {
      round++; phase = 'count'; t = 3.4; playT = 0; parts = [];
      v = ctx.variant(VARIANTS);
      plats = [{ x: 0, y: FLOOR, w: WW, x0: 0, ph: 0, crumble: -1, gone: false, spring: false, slide: 0, floor: true }];
      topRow = 0; for (let i = 0; i < 12; i++) addRow();
      lavaY = FLOOR + 400; camY = 0; wind = 0; windNext = 4; // lava reaches the floor ~8 s after GO
      const live = P.filter(p => ctx.isConnected(p.id)), n = live.length;
      bodies = live.map((p, i) => ({ id: p.id, p, x: WW * (i + 1) / (n + 1) - TUNE.pw / 2, y: FLOOR - TUNE.ph, vx: 0, vy: 0, ix: 0, tx: 0,
        ground: 0, buffer: 0, jumpHeld: false, stun: 0, alive: true, on: null, best: FLOOR }));
      bodies.forEach(b => ctx.send(b.id, { ui: 'joystick', btn: 'JUMP', label: `Round ${round} of ${ROUNDS} · ${v.name}` }));
      P.filter(p => !bodies.some(b => b.id === p.id)).forEach(p => ctx.send(p.id, { ui: 'wait', big: '⏳', text: 'Sitting this round out', sub: 'You\'re back in next round' }));
    }

    function die(b) {
      b.alive = false;
      for (const o of bodies) if (o.alive) ctx.score(o.id, 1);
      for (let i = 0; i < 20; i++) parts.push({ x: b.x + 20, y: lavaY, vx: (Math.random() - 0.5) * 500, vy: -200 - Math.random() * 500, life: 0.9, c: '#ffb13d' });
      ctx.send(b.id, { ui: 'wait', big: '🔥', text: 'Toasted!', sub: 'Watch the others climb on the TV', vibrate: 300 });
      ctx.sfx('bad');
    }
    function endRound() {
      phase = 'roundEnd';
      const alive = bodies.filter(b => b.alive);
      alive.forEach(b => ctx.score(b.id, 3));
      bodies.forEach(b => { const climbed = Math.round((FLOOR - b.best) / TUNE.rowGap); height[b.id] = Math.max(height[b.id], climbed); });
      const top = bodies.slice().sort((a, b) => a.best - b.best)[0];
      if (top) ctx.score(top.id, 2);
      banner = alive.length === 1 ? `${alive[0].p.emoji} ${alive[0].p.name} survives!` : alive.length ? 'Survivors share it!' : 'The lava wins!';
      bannerT = 2; ctx.sfx('win');
      ctx.after(1, () => ctx.roundOver(`Round ${round} of ${ROUNDS} · ${banner}${top ? ` · highest: ${top.p.name}` : ''}`, () => {
        if (round < ROUNDS) return startRound();
        const awards = [];
        const goat = P.slice().sort((a, b) => height[b.id] - height[a.id])[0];
        if (goat && height[goat.id] > 0) awards.push({ id: goat.id, emoji: '🐐', title: `Mountain goat · climbed ${height[goat.id]} floors` });
        const bk = P.slice().sort((a, b) => bonks[b.id] - bonks[a.id])[0];
        if (bk && bonks[bk.id] > 0) awards.push({ id: bk.id, emoji: '🔨', title: `Bonk master · ${bonks[bk.id]} bonk${bonks[bk.id] > 1 ? 's' : ''}` });
        ctx.end({ awards });
      }));
    }

    const platX = pl => (pl.slide ? pl.x0 + Math.sin(playT * 1.6 + pl.ph) * pl.slide : pl.x);

    startRound();

    return {
      onInput(id, d) {
        const b = bodies.find(x => x.id === id);
        if (!b || !b.alive) return;
        if (d.t === 'joy') b.tx = Math.max(-1, Math.min(1, +d.x || 0));
        if (d.t === 'btn') {
          if (d.down) { b.buffer = TUNE.buffer; b.jumpHeld = true; }
          else { b.jumpHeld = false; if (b.vy < 0) b.vy *= TUNE.cut; } // short hop on early release
        }
      },
      onLeave(id) { const b = bodies.find(x => x.id === id); if (b) { b.tx = 0; b.jumpHeld = false; } },
      onRejoin(id) {
        const b = bodies.find(x => x.id === id);
        if (!b || !b.alive) ctx.send(id, { ui: 'wait', big: '⏳', text: 'Welcome back!', sub: 'You\'re in from the next round' });
      },
      step(h) {
        if (phase !== 'play') return;
        const fr = v.id === 'ice' ? TUNE.iceFriction : TUNE.friction;
        for (const pl of plats) {
          pl.x = platX(pl);
          if (pl.crumble > 0) { pl.crumble -= h; if (pl.crumble <= 0) { pl.gone = true; for (let i = 0; i < 8; i++) parts.push({ x: pl.x + Math.random() * pl.w, y: pl.y, vx: 0, vy: 100, life: 0.8, c: '#8a7a6a' }); } }
        }
        for (const b of bodies) {
          if (!b.alive) continue;
          b.ix = ctx.smooth(b.ix, b.tx, h);
          const ctl = b.stun > 0 ? 0 : 1;
          b.vx += b.ix * TUNE.run * (b.ground > 0 ? 1 : TUNE.air) * ctl * h + wind * h;
          if (b.ground > 0 && Math.abs(b.ix) < 0.1) b.vx *= Math.exp(-fr * h);
          b.vx = Math.max(-TUNE.maxRun * 1.6, Math.min(TUNE.maxRun * 1.6, b.vx));
          if (Math.abs(b.vx) > TUNE.maxRun && b.ground > 0) b.vx *= Math.exp(-6 * h);
          b.vy += TUNE.gravity * h;
          b.buffer -= h; b.ground -= h; b.stun -= h;
          if (b.buffer > 0 && b.ground > 0 && ctl) { b.vy = TUNE.jump; b.buffer = 0; b.ground = 0; ctx.sfx('pop'); }
          const prevBottom = b.y + TUNE.ph;
          b.x += b.vx * h; b.y += b.vy * h;
          if (b.x < 0) { b.x = 0; b.vx = 0; } if (b.x > WW - TUNE.pw) { b.x = WW - TUNE.pw; b.vx = 0; }
          if (b.vy >= 0) { // one-way platforms: land only from above
            for (const pl of plats) {
              if (pl.gone || b.x + TUNE.pw < pl.x + 4 || b.x > pl.x + pl.w - 4) continue;
              if (prevBottom <= pl.y + 1 && b.y + TUNE.ph >= pl.y) {
                b.y = pl.y - TUNE.ph; b.vy = 0; b.ground = TUNE.coyote; b.on = pl;
                if (pl.spring) { b.vy = TUNE.spring; b.ground = 0; ctx.sfx('dash'); }
                if (v.id === 'crumble' && !pl.floor && pl.crumble < 0) pl.crumble = TUNE.crumble;
                if (pl.slide) b.x += (platX(pl) - pl.x);
                break;
              }
            }
          }
          b.best = Math.min(b.best, b.y);
        }
        // body vs body: bonk from above, otherwise push apart sideways
        for (let i = 0; i < bodies.length; i++) for (let j = 0; j < bodies.length; j++) {
          if (i === j) continue;
          const a = bodies[i], c = bodies[j];
          if (!a.alive || !c.alive) continue;
          const ox = Math.min(a.x + TUNE.pw, c.x + TUNE.pw) - Math.max(a.x, c.x), oy = Math.min(a.y + TUNE.ph, c.y + TUNE.ph) - Math.max(a.y, c.y);
          if (ox <= 0 || oy <= 0) continue;
          if (a.vy > 0 && a.y < c.y && oy < 22) {
            a.vy = TUNE.bonk; a.y = c.y - TUNE.ph; c.stun = TUNE.stun; c.vy = Math.max(c.vy, 300); bonks[a.id]++;
            ctx.sfx('bump'); ctx.send(c.id, { vibrate: 120, note: `Bonked by ${a.p.name}!` });
            for (let k = 0; k < 10; k++) parts.push({ x: c.x + 20, y: c.y, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 300, life: 0.5, c: '#ffe36e' });
          } else if (i < j && oy >= 22) {
            const push = ox / 2 * (a.x < c.x ? -1 : 1);
            a.x += push; c.x -= push;
          }
        }
      },
      update(dt) {
        t -= dt; bannerT -= dt;
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.life -= dt; }
        parts = parts.filter(p => p.life > 0);
        if (phase === 'count') { if (t <= 0) { phase = 'play'; banner = 'CLIMB!'; bannerT = 0.8; ctx.sfx('start'); } return; }
        if (phase !== 'play') return;
        playT += dt;
        const speed = (TUNE.lava0 + TUNE.lavaAcc * playT) * (playT > TUNE.lavaRush ? 1.6 : 1);
        lavaY -= speed * dt;
        if (v.id === 'wind') {
          windNext -= dt; windT -= dt;
          if (windNext <= 0) { wind = (Math.random() < 0.5 ? -1 : 1) * TUNE.wind; windT = 2.2; windNext = 4 + Math.random() * 3; }
          if (windT <= 0) wind *= Math.exp(-3 * dt);
        }
        const alive = bodies.filter(b => b.alive);
        const lead = alive.length ? Math.min.apply(null, alive.map(b => b.y)) : lavaY;
        const target = Math.min(lead - 320, lavaY - 820);
        if (target < camY) camY += (target - camY) * Math.min(1, dt * 3); // camera only ever rises
        while (FLOOR - topRow * TUNE.rowGap > camY - 400) addRow();
        plats = plats.filter(pl => pl.y < lavaY + 200);
        for (const b of alive) if (b.y + TUNE.ph > lavaY + 10) die(b);
        const left = bodies.filter(b => b.alive).length;
        if (left === 0 || (bodies.length > 1 && left === 1 && playT > 5) || playT > TUNE.roundCap) endRound();
      },
      render(g, W, H) {
        const sky = g.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, '#120318'); sky.addColorStop(1, v.id === 'ice' ? '#10324a' : '#3a0d12');
        g.fillStyle = sky; g.fillRect(0, 0, W, H);
        g.save(); ctx.fit(WW, WH); g.translate(0, -camY);
        g.fillStyle = 'rgba(255,255,255,.05)';
        for (let i = 0; i < 40; i++) g.fillRect((i * 397) % WW, camY + ((i * 211 - camY * 0.3) % WH + WH) % WH, 3, 3);
        for (const pl of plats) {
          if (pl.gone) continue;
          const shake = pl.crumble > 0 ? (Math.random() - 0.5) * 4 : 0;
          g.fillStyle = pl.floor ? '#4a2c2a' : v.id === 'ice' ? '#bfe9ff' : pl.crumble > 0 ? '#9a7a5a' : '#6b4f8f';
          g.fillRect(pl.x + shake, pl.y, pl.w, 18);
          g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(pl.x + shake, pl.y, pl.w, 4);
          if (pl.spring) { g.fillStyle = '#3ddc84'; g.fillRect(pl.x + pl.w / 2 - 22, pl.y - 10, 44, 10); }
        }
        for (const b of bodies) {
          if (!b.alive) continue;
          g.save(); g.translate(b.x + TUNE.pw / 2, b.y + TUNE.ph / 2);
          if (b.stun > 0) g.rotate(Math.sin(b.stun * 40) * 0.3);
          g.globalAlpha = ctx.isConnected(b.id) ? 1 : 0.4;
          g.fillStyle = b.p.color; g.fillRect(-TUNE.pw / 2, -TUNE.ph / 2, TUNE.pw, TUNE.ph);
          g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeRect(-TUNE.pw / 2, -TUNE.ph / 2, TUNE.pw, TUNE.ph);
          g.font = '30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(b.p.emoji, 0, 2);
          g.font = '700 18px Outfit, sans-serif'; g.fillStyle = '#fff'; g.fillText(b.p.name, 0, -TUNE.ph / 2 - 14);
          g.restore();
        }
        for (const p of parts) { g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c; g.fillRect(p.x - 4, p.y - 4, 8, 8); }
        g.globalAlpha = 1;
        // lava
        const lg = g.createLinearGradient(0, lavaY, 0, lavaY + 300);
        lg.addColorStop(0, '#ffb13d'); lg.addColorStop(0.2, '#ff4d1a'); lg.addColorStop(1, '#6a0b00');
        g.fillStyle = lg; g.beginPath(); g.moveTo(0, lavaY + 2000);
        for (let x = 0; x <= WW; x += 40) g.lineTo(x, lavaY + Math.sin(x * 0.02 + playT * 4) * 8);
        g.lineTo(WW, lavaY + 2000); g.closePath(); g.fill();
        g.restore();
        // off-screen markers for climbers below the view
        const u = W / 100, s = Math.min(W / WW, H / WH), oy = (H - WH * s) / 2, ox = (W - WW * s) / 2;
        for (const b of bodies) if (b.alive && b.y - camY > WH) { g.font = `${2 * u}px serif`; g.textAlign = 'center'; g.fillText('⬇' + b.p.emoji, ox + (b.x + 20) * s, oy + WH * s - 3 * u); }
        g.textAlign = 'left'; g.textBaseline = 'top'; g.font = `900 ${1.8 * u}px Outfit, sans-serif`; g.fillStyle = '#ffb13d';
        g.fillText(`ROUND ${round}/${ROUNDS} · ${v.name.toUpperCase()}`, 2.4 * u, 2 * u);
        if (wind) { g.textAlign = 'right'; g.fillText(wind > 0 ? 'WIND ➡➡' : '⬅⬅ WIND', W - 2.4 * u, 2 * u); }
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
