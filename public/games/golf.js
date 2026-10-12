// MINI GOLF MAYHEM — everyone putts the same hole at once; balls collide.
// Spec: 003 R7 (new game), R8 (fixed-step physics, tuning block), R6.3 (holes never repeat).
Hub.register({
  id: 'golf', title: 'Mini Golf Mayhem', emoji: '⛳', genre: 'Golf · Physics', category: 'action',
  tagline: 'Everyone putts at the same time. Knock rivals away and sink it first.',
  how: ['Drag back on your phone to aim, release to putt', 'Everyone plays at once and balls bounce off each other', 'Fewest strokes wins. First in the cup gets a bonus'],
  min: 1, max: 12, time: '4 min', controls: 'Drag to aim, release to putt', colors: ['#2fbf71', '#0f7d4a'],
  settings: [
    { id: 'holes', label: 'Holes', options: [3, 5, 7], def: { quick: 3, standard: 5, long: 7 } },
  ],

  create(ctx) {
    // ---- tuning (R8.2)
    const TUNE = {
      maxShot: 1500 * Math.pow(ctx.diff, 0.3), decel: 260, damping: 0.6, sandMult: 5, rest: 8,
      wall: 0.72, bumper: 1.25, ballE: 0.9, r: 10, cupR: 18, capture: 900, maxV: 1800, holeTime: 75,
    };
    const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const HOLES = [
      { id: 'h1', name: 'Straight Shot', par: 2, shape: rect(200, 300, 1200, 300), tee: [300, 450], cup: [1300, 450], bumpers: [[800, 450, 40]] },
      { id: 'h2', name: 'Dogleg', par: 3, shape: [[200, 620], [900, 620], [900, 150], [1100, 150], [1100, 800], [200, 800]], tee: [300, 710], cup: [1000, 240], sand: [[930, 650, 140, 120]] },
      { id: 'h3', name: 'The Gate', par: 3, shape: rect(200, 250, 1200, 400), tee: [300, 450], cup: [1300, 450], movers: [{ a: [800, 250], b: [800, 420], dx: 0, dy: 230, period: 3.2 }] },
      { id: 'h4', name: 'The Hill', par: 3, shape: rect(200, 200, 1200, 500), tee: [300, 600], cup: [1300, 300], slopes: [[600, 200, 400, 500, 0, 380]] },
      { id: 'h5', name: 'The Bridge', par: 3, shape: rect(200, 150, 1200, 600), tee: [300, 450], cup: [1300, 450], water: [[700, 150, 120, 270], [700, 480, 120, 270]] },
      { id: 'h6', name: 'Pinball', par: 3, shape: rect(200, 200, 1200, 500), tee: [300, 450], cup: [1300, 600], bumpers: [[800, 350, 34], [800, 550, 34], [650, 450, 34], [950, 450, 34], [1100, 300, 30]] },
      { id: 'h7', name: 'Zigzag', par: 4, shape: rect(150, 150, 1300, 600), tee: [300, 650], cup: [1300, 250], walls: [[550, 150, 550, 560], [1000, 340, 1000, 750]] },
      { id: 'h8', name: 'Sand Trap', par: 3, shape: rect(200, 250, 1200, 400), tee: [300, 450], cup: [1250, 450], sand: [[700, 250, 250, 180], [700, 470, 250, 180]], bumpers: [[1050, 450, 24]] },
      { id: 'h9', name: 'Sliders', par: 3, shape: rect(200, 200, 1200, 500), tee: [300, 450], cup: [1300, 450], movers: [{ a: [450, 350], b: [700, 350], dx: 450, dy: 0, period: 4 }, { a: [900, 550], b: [1150, 550], dx: -450, dy: 0, period: 3.4 }] },
      { id: 'h10', name: 'Funnel', par: 2, shape: [[200, 150], [1400, 380], [1400, 520], [200, 750]], tee: [350, 450], cup: [1300, 450], bumpers: [[800, 320, 30], [800, 580, 30]] },
    ];
    const WW = 1600, WH = 900, P = ctx.players;
    const holes = ctx.pick('golf-holes', HOLES, ctx.settings.holes);
    const total = Object.fromEntries(P.map(p => [p.id, 0])), firsts = Object.fromEntries(P.map(p => [p.id, 0]));
    let aces = [];
    let hi = -1, hole, phase = 'intro', t = 0, clock = 0, balls = [], segs = [], firstIn = null, banner = '', bannerT = 0, parts = [];

    function edges(poly) { return poly.map((p, i) => [p[0], p[1], poly[(i + 1) % poly.length][0], poly[(i + 1) % poly.length][1]]); }
    function inPoly(x, y, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    }
    const inRect = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
    const maxStrokes = () => hole.par + 4;
    const label = b => `Hole ${hi + 1}/${holes.length} · ${hole.name} · Par ${hole.par} · Stroke ${b.strokes + 1}`;

    function startHole() {
      hi++;
      hole = holes[hi]; phase = 'play'; t = TUNE.holeTime; clock = 0; firstIn = null;
      segs = edges(hole.shape).concat(hole.walls || []);
      const live = P.filter(p => ctx.isConnected(p.id)), cols = 4;
      balls = P.map((p, i) => {
        const k = live.indexOf(p) >= 0 ? live.indexOf(p) : i;
        const x = hole.tee[0] + ((k % cols) - (cols - 1) / 2) * 26, y = hole.tee[1] + (Math.floor(k / cols) - 1) * 26;
        return { id: p.id, p, x, y, vx: 0, vy: 0, lx: x, ly: y, strokes: 0, sunk: false, moving: false, aim: null, aimT: 0, out: false };
      });
      banner = `Hole ${hi + 1}: ${hole.name}`; bannerT = 2.2;
      balls.forEach(b => ctx.send(b.id, { ui: 'aim', label: label(b) }));
      ctx.sfx('start');
    }
    function moverSeg(m) {
      const k = (Math.sin(clock * Math.PI * 2 / m.period) + 1) / 2;
      const ox = m.dx * k, oy = m.dy * k;
      const vk = Math.cos(clock * Math.PI * 2 / m.period) * Math.PI / m.period; // d(k)/dt
      return { s: [m.a[0] + ox, m.a[1] + oy, m.b[0] + ox, m.b[1] + oy], vx: m.dx * vk, vy: m.dy * vk };
    }
    function collideSeg(b, s, wvx, wvy, e) {
      const x1 = s[0], y1 = s[1], x2 = s[2], y2 = s[3], dx = x2 - x1, dy = y2 - y1;
      const l2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((b.x - x1) * dx + (b.y - y1) * dy) / l2));
      const cx = x1 + u * dx, cy = y1 + u * dy;
      let nx = b.x - cx, ny = b.y - cy;
      const d = Math.hypot(nx, ny);
      if (d >= TUNE.r) return false;
      if (d === 0) { nx = -dy; ny = dx; } // exactly on the line: push sideways
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      b.x = cx + nx * TUNE.r; b.y = cy + ny * TUNE.r;
      const rvx = b.vx - wvx, rvy = b.vy - wvy, vn = rvx * nx + rvy * ny;
      if (vn < 0) { b.vx = rvx - (1 + e) * vn * nx + wvx; b.vy = rvy - (1 + e) * vn * ny + wvy; }
      return true;
    }
    function sinkBall(b) {
      b.sunk = true; b.moving = false; b.vx = b.vy = 0; b.x = hole.cup[0]; b.y = hole.cup[1];
      const pts = b.strokes === 1 ? 10 : Math.max(1, 2 * (hole.par + 3 - b.strokes));
      ctx.score(b.id, pts);
      if (!firstIn) { firstIn = b.id; ctx.score(b.id, 2); firsts[b.id]++; }
      if (b.strokes === 1) aces.push(b.id);
      total[b.id] += b.strokes;
      for (let i = 0; i < 24; i++) { const a = Math.random() * 6.28; parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.8, c: b.p.color }); }
      banner = b.strokes === 1 ? `${b.p.emoji} HOLE IN ONE!` : `${b.p.emoji} ${b.p.name} sinks it in ${b.strokes}`; bannerT = 2;
      ctx.sfx(b.strokes === 1 ? 'win' : 'good');
      ctx.send(b.id, { ui: 'wait', big: '⛳', text: b.strokes === 1 ? 'HOLE IN ONE!' : `In the hole! (${b.strokes})`, sub: `+${pts}${firstIn === b.id ? ' · first in +2' : ''}`, vibrate: [60, 40, 120] });
    }
    function endHole() {
      phase = 'over';
      balls.forEach(b => { if (!b.sunk) total[b.id] += maxStrokes(); });
      const best = balls.filter(b => b.sunk).sort((a, b) => a.strokes - b.strokes)[0];
      ctx.roundOver(`Hole ${hi + 1}: ${hole.name}${best ? ` · best ${best.p.name} (${best.strokes})` : ''}`, () => {
        if (hi + 1 < holes.length) return startHole();
        const awards = [];
        if (aces.length) awards.push({ id: aces[0], emoji: '🎯', title: 'Hole in one!' });
        const low = P.slice().sort((a, b) => total[a.id] - total[b.id])[0];
        if (low) awards.push({ id: low.id, emoji: '🏌️', title: `Fewest strokes · ${total[low.id]} total` });
        const fast = P.slice().sort((a, b) => firsts[b.id] - firsts[a.id])[0];
        if (fast && firsts[fast.id] > 1) awards.push({ id: fast.id, emoji: '🐇', title: `First in the cup ${firsts[fast.id]}×` });
        ctx.end({ awards });
      });
    }

    startHole();

    return {
      onInput(id, d) {
        const b = balls.find(x => x.id === id);
        if (!b || phase !== 'play' || b.sunk) return;
        const a = +d.a, p = Math.max(0, Math.min(1, +d.p || 0));
        if (!isFinite(a)) return;
        if (d.t === 'aim') { b.aim = { a, p }; b.aimT = 0.6; return; }
        if (d.t !== 'shot' || b.moving || p < 0.05 || b.strokes >= maxStrokes()) return;
        b.strokes++; b.aim = null; b.lx = b.x; b.ly = b.y;
        const v = TUNE.maxShot * p * p * 0.75 + TUNE.maxShot * p * 0.25; // finer control on soft putts
        b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v; b.moving = true;
        ctx.sfx('pop');
        ctx.send(id, { ui: 'wait', big: '⛳', text: 'Rolling…', sub: `Stroke ${b.strokes} of max ${maxStrokes()}` });
      },
      onRejoin(id) {
        const b = balls.find(x => x.id === id);
        if (b && phase === 'play' && !b.sunk && !b.moving) ctx.send(id, { ui: 'aim', label: label(b) });
      },
      step(h) {
        if (phase !== 'play') return;
        clock += h;
        const movers = (hole.movers || []).map(moverSeg);
        for (const b of balls) {
          if (b.sunk || !b.moving) continue;
          const sp = Math.hypot(b.vx, b.vy);
          const sub = Math.max(1, Math.ceil(sp * h / 5)), hh = h / sub;
          for (let k = 0; k < sub && b.moving; k++) {
            const sand = (hole.sand || []).some(r => inRect(b.x, b.y, r));
            for (const s of hole.slopes || []) if (inRect(b.x, b.y, s)) { b.vx += s[4] * hh; b.vy += s[5] * hh; }
            let v = Math.hypot(b.vx, b.vy);
            if (v > 0) {
              const dec = TUNE.decel * (sand ? TUNE.sandMult : 1) * hh, nv = Math.max(0, v - dec) * Math.exp(-TUNE.damping * (sand ? 3 : 1) * hh);
              b.vx *= nv / v; b.vy *= nv / v; v = nv;
            }
            if (v > TUNE.maxV) { b.vx *= TUNE.maxV / v; b.vy *= TUNE.maxV / v; }
            b.x += b.vx * hh; b.y += b.vy * hh;
            for (const s of segs) collideSeg(b, s, 0, 0, TUNE.wall);
            for (const m of movers) if (collideSeg(b, m.s, m.vx, m.vy, TUNE.wall)) ctx.sfx('bump');
            for (const bp of hole.bumpers || []) {
              const dx = b.x - bp[0], dy = b.y - bp[1], dd = Math.hypot(dx, dy), m = TUNE.r + bp[2];
              if (dd < m && dd > 0) {
                const nx = dx / dd, ny = dy / dd, vn = b.vx * nx + b.vy * ny;
                b.x = bp[0] + nx * m; b.y = bp[1] + ny * m;
                if (vn < 0) { b.vx -= (1 + TUNE.bumper) * vn * nx; b.vy -= (1 + TUNE.bumper) * vn * ny; ctx.sfx('bump'); }
              }
            }
            const cd = Math.hypot(b.x - hole.cup[0], b.y - hole.cup[1]);
            if (cd < TUNE.cupR) {
              if (Math.hypot(b.vx, b.vy) < TUNE.capture) { sinkBall(b); break; }
              b.vx += (hole.cup[0] - b.x) * 8 * hh; b.vy += (hole.cup[1] - b.y) * 8 * hh; // lip-out wobble
            }
            if ((hole.water || []).some(r => inRect(b.x, b.y, r)) || !inPoly(b.x, b.y, hole.shape)) {
              b.x = b.lx; b.y = b.ly; b.vx = b.vy = 0; b.moving = false; b.strokes++; // penalty stroke
              ctx.send(b.id, { note: '💦 Splash! +1 penalty stroke', vibrate: 200 }); ctx.sfx('bad');
            }
            if (Math.hypot(b.vx, b.vy) < TUNE.rest && b.moving) { b.vx = b.vy = 0; b.moving = false; }
          }
        }
        // ball vs ball
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], c = balls[j];
          if (a.sunk || c.sunk) continue;
          const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
          if (d >= TUNE.r * 2 || d === 0) continue;
          const nx = dx / d, ny = dy / d, ov = TUNE.r * 2 - d;
          a.x -= nx * ov / 2; a.y -= ny * ov / 2; c.x += nx * ov / 2; c.y += ny * ov / 2;
          const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (rel <= 0) continue;
          const j2 = rel * (1 + TUNE.ballE) / 2;
          a.vx -= j2 * nx; a.vy -= j2 * ny; c.vx += j2 * nx; c.vy += j2 * ny;
          a.moving = c.moving = true; ctx.sfx('bump');
        }
        for (const b of balls) {
          if (b.sunk || b.moving || b.wasMoving !== true) { b.wasMoving = b.moving; continue; }
          b.wasMoving = false; // just came to rest
          if (b.strokes >= maxStrokes()) { ctx.send(b.id, { ui: 'wait', big: '🙈', text: 'Picked up', sub: `Max ${maxStrokes()} strokes on this hole` }); continue; }
          ctx.send(b.id, { ui: 'aim', label: label(b) });
        }
      },
      update(dt) {
        bannerT -= dt;
        for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
        parts = parts.filter(p => p.life > 0);
        for (const b of balls) if (b.aimT > 0) b.aimT -= dt;
        if (phase !== 'play') return;
        t -= dt;
        const done = balls.every(b => b.sunk || (!b.moving && (b.strokes >= maxStrokes() || !ctx.isConnected(b.id))));
        if (done || t <= 0) endHole();
      },
      render(g, W, H) {
        g.fillStyle = '#0c2416'; g.fillRect(0, 0, W, H);
        g.save(); ctx.fit(WW, WH);
        // fairway
        g.beginPath(); hole.shape.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
        g.fillStyle = '#3fae5a'; g.fill();
        g.save(); g.clip();
        g.fillStyle = 'rgba(255,255,255,.05)'; for (let x = 0; x < WW; x += 80) g.fillRect(x, 0, 40, WH);
        for (const s of hole.slopes || []) {
          g.fillStyle = 'rgba(20,80,40,.35)'; g.fillRect(s[0], s[1], s[2], s[3]);
          g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 4;
          for (let y = s[1] + 40; y < s[1] + s[3]; y += 90) for (let x = s[0] + 50; x < s[0] + s[2]; x += 110) {
            const a = Math.atan2(s[5], s[4]); g.save(); g.translate(x, y); g.rotate(a);
            g.beginPath(); g.moveTo(-18, 0); g.lineTo(18, 0); g.lineTo(8, -9); g.moveTo(18, 0); g.lineTo(8, 9); g.stroke(); g.restore();
          }
        }
        for (const r of hole.sand || []) { g.fillStyle = '#e8d19a'; g.beginPath(); g.ellipse(r[0] + r[2] / 2, r[1] + r[3] / 2, r[2] / 2, r[3] / 2, 0, 0, 6.29); g.fill(); }
        for (const r of hole.water || []) { g.fillStyle = '#2b7bd6'; g.fillRect(r[0], r[1], r[2], r[3]); g.fillStyle = 'rgba(255,255,255,.18)'; for (let y = r[1] + 20; y < r[1] + r[3]; y += 34) g.fillRect(r[0] + 10 + (y % 20), y, r[2] - 30, 4); }
        g.restore();
        g.lineCap = 'round'; g.strokeStyle = '#7a4a24'; g.lineWidth = 12;
        for (const s of segs) { g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.stroke(); }
        g.strokeStyle = '#ffb13d'; g.lineWidth = 14;
        for (const m of (hole.movers || []).map(moverSeg)) { g.beginPath(); g.moveTo(m.s[0], m.s[1]); g.lineTo(m.s[2], m.s[3]); g.stroke(); }
        for (const bp of hole.bumpers || []) { g.beginPath(); g.arc(bp[0], bp[1], bp[2], 0, 6.29); g.fillStyle = '#ff4f8b'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke(); }
        // cup + flag
        g.beginPath(); g.arc(hole.cup[0], hole.cup[1], TUNE.cupR, 0, 6.29); g.fillStyle = '#111'; g.fill();
        g.fillStyle = '#fff'; g.fillRect(hole.cup[0] - 2, hole.cup[1] - 90, 4, 90);
        g.fillStyle = '#ff3d5a'; g.beginPath(); g.moveTo(hole.cup[0] + 2, hole.cup[1] - 90); g.lineTo(hole.cup[0] + 50, hole.cup[1] - 76); g.lineTo(hole.cup[0] + 2, hole.cup[1] - 62); g.fill();
        // tee
        g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(hole.tee[0] - 60, hole.tee[1] - 45, 120, 90);
        // aim previews
        for (const b of balls) {
          if (!b.aim || b.aimT <= 0 || b.moving || b.sunk) continue;
          const len = 30 + b.aim.p * 220;
          g.setLineDash([10, 10]); g.strokeStyle = b.p.color; g.lineWidth = 4; g.globalAlpha = Math.min(1, b.aimT * 2);
          g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x + Math.cos(b.aim.a) * len, b.y + Math.sin(b.aim.a) * len); g.stroke();
          g.setLineDash([]); g.globalAlpha = 1;
        }
        for (const b of balls) {
          if (b.sunk) continue;
          g.globalAlpha = ctx.isConnected(b.id) ? 1 : 0.4;
          g.beginPath(); g.arc(b.x + 2, b.y + 3, TUNE.r, 0, 6.29); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill();
          g.beginPath(); g.arc(b.x, b.y, TUNE.r, 0, 6.29); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 4; g.strokeStyle = b.p.color; g.stroke();
          g.font = '24px serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillText(b.p.emoji, b.x, b.y - 12);
          g.globalAlpha = 1;
        }
        for (const p of parts) { g.globalAlpha = Math.max(0, p.life); g.fillStyle = p.c; g.fillRect(p.x - 3, p.y - 3, 6, 6); }
        g.globalAlpha = 1;
        g.restore();
        const u = W / 100;
        g.textAlign = 'left'; g.textBaseline = 'top'; g.font = `900 ${1.8 * u}px Outfit, sans-serif`; g.fillStyle = '#c8ffd9';
        g.fillText(`HOLE ${hi + 1}/${holes.length} · ${hole.name.toUpperCase()} · PAR ${hole.par}`, 2.4 * u, 2 * u);
        g.textAlign = 'right'; g.fillStyle = t < 10 ? '#ff6b6b' : '#fff'; g.fillText(`⏱ ${Math.max(0, Math.ceil(t))}`, W - 2.4 * u, 2 * u);
        g.font = `700 ${1.15 * u}px Outfit, sans-serif`;
        balls.slice(0, 12).forEach((b, i) => {
          g.fillStyle = b.sunk ? '#3ddc84' : '#fff';
          g.fillText(`${b.p.emoji} ${b.p.name} · ${b.sunk ? '✓ ' : ''}${b.strokes}`, W - 2.4 * u, 5 * u + i * 1.7 * u);
        });
        if (bannerT > 0) {
          g.globalAlpha = Math.min(1, bannerT * 2); g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = `900 ${4 * u}px Outfit, sans-serif`; g.lineWidth = 0.5 * u; g.strokeStyle = 'rgba(0,0,0,.6)';
          g.strokeText(banner, W / 2, H * 0.12); g.fillStyle = '#fff'; g.fillText(banner, W / 2, H * 0.12); g.globalAlpha = 1;
        }
      },
    };
  },
});
