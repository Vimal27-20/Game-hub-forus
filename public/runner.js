// Game runner: game clock, fixed-step physics, game-time timers, pause, scores,
// round scoreboards, no-repeat content and results. No DOM/socket of its own, so
// the same code runs on the TV and in Node tests.
// Spec: specs/003-party-pack-v2/design.md (Runner).
(function (root) {
  const STEP = 1 / 120; // physics step (R8.1)
  const MAX_STEPS = 10; // per frame, so a stalled tab can't spiral
  const DIFF = { chill: 0.8, normal: 1, wild: 1.25 };
  const PARTY_POINTS = [0, 5, 3, 2]; // by rank; everyone else who played gets 1

  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };
  const optionList = s => s.options.map(o => (o && typeof o === 'object' ? o : { v: o, label: String(o) }));

  // Per-game settings: chosen value if valid, else the default for the room's game length.
  function resolveSettings(def, room, chosen) {
    const out = {};
    for (const s of def.settings || []) {
      const opts = optionList(s), ok = v => opts.some(o => o.v === v);
      let v = chosen && chosen[s.id];
      if (!ok(v)) v = s.def && typeof s.def === 'object' ? s.def[room.length] : s.def;
      if (!ok(v)) v = opts[0].v;
      out[s.id] = v;
    }
    return out;
  }

  // Ties share a rank. Returns [{ id, score, rank }] best first.
  function rank(scores) {
    const list = Object.keys(scores).map(id => ({ id, score: scores[id] })).sort((a, b) => b.score - a.score);
    let r = 0, prev = null;
    list.forEach((x, i) => { if (x.score !== prev) r = i + 1; x.rank = r; prev = x.score; });
    return list;
  }
  const partyPoints = r => PARTY_POINTS[r] || 1;

  // Session memory (R6.1, R6.3): what content each bank has used, and the last variant per game.
  // `data` is a plain object the shell persists in sessionStorage.
  function createMemory(data) {
    data = data || {};
    data.used = data.used || {};
    data.variants = data.variants || {};
    const keyOf = x => (typeof x === 'string' ? x : x && x.id != null ? String(x.id) : JSON.stringify(x));
    return {
      data,
      pick(bank, list, n, key) {
        key = key || keyOf;
        let used = new Set(data.used[bank] || []);
        let fresh = shuffle(list.filter(x => !used.has(key(x))));
        if (fresh.length < n) { // bank exhausted: use what's left, then start a new cycle
          used = new Set();
          const firstKeys = new Set(fresh.map(key));
          fresh = fresh.concat(shuffle(list.filter(x => !firstKeys.has(key(x)))));
        }
        const out = fresh.slice(0, n);
        out.forEach(x => used.add(key(x)));
        data.used[bank] = Array.from(used);
        return out;
      },
      variant(game, pool) {
        const last = data.variants[game];
        const choices = pool.length > 1 ? pool.filter(v => keyOf(v) !== last) : pool;
        const v = choices[Math.random() * choices.length | 0];
        data.variants[game] = keyOf(v);
        return v;
      },
    };
  }

  function create(env) {
    const memory = env.memory || createMemory();
    const introSec = env.introSec == null ? 3 : env.introSec;
    const roundSec = env.roundSec == null ? 4 : env.roundSec;
    let def = null, inst = null, ctx = null, players = [], settings = {}, room = {};
    let scores = {}, roundBase = {}, timers = [], timerId = 0;
    let gameTime = 0, acc = 0, paused = false, ended = false, intro = null, interlude = null, lastUI = {};

    const safe = fn => { try { return fn(); } catch (e) { if (env.onError) env.onError(e); else console.error(e); } };
    function send(id, msg) { if (msg && msg.ui) lastUI[id] = msg; env.send(id, msg); }
    const live = () => players.filter(p => env.isConnected(p.id));

    function buildCtx() {
      const size = () => (env.size ? env.size() : { W: 1920, H: 1080 });
      return {
        players: players.map(p => Object.assign({}, p)),
        settings, room, diff: DIFF[room.difficulty] || 1,
        stage: env.stage, canvas: env.canvas, g: env.g,
        get W() { return size().W; }, get H() { return size().H; },
        get time() { return gameTime; },
        // Fit a fixed-size world into the screen (letterboxed). Call inside render.
        fit(ww, wh) {
          const z = size(), s = Math.min(z.W / ww, z.H / wh);
          env.g.translate((z.W - ww * s) / 2, (z.H - wh * s) / 2); env.g.scale(s, s);
          return s;
        },
        send, sendAll: msg => players.forEach(p => send(p.id, msg)),
        isConnected: id => env.isConnected(id),
        live,
        sfx: k => env.sfx && env.sfx(k), toast: t => env.toast && env.toast(t),
        shuffle,
        after(sec, fn) { const id = ++timerId; timers.push({ id, at: gameTime + sec, fn }); return id; },
        cancel(id) { timers = timers.filter(t => t.id !== id); },
        score(id, delta) {
          if (!(id in scores) || !delta) return scores[id] || 0;
          scores[id] += delta;
          if (env.onScore) env.onScore(id, delta, scores[id], Object.assign({}, scores));
          return scores[id];
        },
        scores: () => Object.assign({}, scores),
        roundOver(title, next) {
          const gains = {};
          for (const id in scores) gains[id] = scores[id] - (roundBase[id] || 0);
          roundBase = Object.assign({}, scores);
          interlude = { t: roundSec, next };
          if (env.onRoundOver) env.onRoundOver({ title, gains, scores: Object.assign({}, scores) });
          for (const p of players) {
            send(p.id, { ui: 'wait', big: '📊', text: title, sub: `+${gains[p.id] || 0} this round · ${scores[p.id]} total`, skip: true });
          }
        },
        pick: (bank, list, n, key) => memory.pick(bank, list, n, key),
        variant: pool => memory.variant(def.id, pool),
        smooth: (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / (tau || 0.04))),
        end(opts) {
          if (ended) return;
          if (Array.isArray(opts)) { opts.forEach(r => { if (r.id in scores) scores[r.id] = r.score; }); opts = {}; }
          ended = true;
          const ranked = rank(scores);
          const awards = (opts && opts.awards || []).filter(a => a && a.id in scores);
          if (!awards.length && ranked[0] && ranked[0].score > 0) awards.push({ id: ranked[0].id, emoji: '🏆', title: 'Top scorer' });
          if (env.onEnd) env.onEnd({ def, ranked, awards, scores: Object.assign({}, scores), settings });
        },
      };
    }

    function begin() {
      intro = null;
      if (env.onBegin) env.onBegin();
      inst = safe(() => def.create(ctx)) || {};
    }
    function finishInterlude() {
      const next = interlude && interlude.next;
      interlude = null;
      if (env.onRoundEnd) env.onRoundEnd();
      if (next) safe(next);
    }
    function runTimers() {
      if (!timers.length) return;
      const due = timers.filter(t => t.at <= gameTime).sort((a, b) => a.at - b.at || a.id - b.id);
      if (!due.length) return;
      timers = timers.filter(t => t.at > gameTime);
      for (const t of due) { if (ended || !inst) return; safe(t.fn); }
    }

    const runner = {
      start(gameDef, plist, opts) {
        runner.stop();
        opts = opts || {};
        def = gameDef; players = plist.slice(); room = opts.room || { length: 'standard', difficulty: 'normal' };
        settings = resolveSettings(def, room, opts.settings);
        scores = {}; players.forEach(p => { scores[p.id] = 0; });
        roundBase = Object.assign({}, scores); timers = []; gameTime = 0; acc = 0;
        paused = false; ended = false; interlude = null; lastUI = {};
        ctx = buildCtx();
        if (env.onIntro) env.onIntro({ def, settings, room });
        for (const p of players) send(p.id, { ui: 'wait', big: def.emoji, text: def.title, sub: (def.how || [])[0] || 'Look at the TV', skip: true });
        intro = { t: introSec };
        if (introSec <= 0) begin();
      },
      frame(dt) {
        if (!def || paused) return;
        dt = Math.min(Math.max(dt, 0), 0.25);
        if (intro) { intro.t -= dt; if (intro.t <= 0) begin(); return; }
        if (interlude) { interlude.t -= dt; if (interlude.t <= 0) finishInterlude(); return; }
        const i = inst;
        if (!i || ended) return;
        gameTime += dt;
        if (i.step) {
          acc += dt;
          let n = 0;
          while (acc >= STEP && n < MAX_STEPS && inst === i && !ended && !interlude) { safe(() => i.step(STEP)); acc -= STEP; n++; }
          if (n === MAX_STEPS) acc = 0;
        }
        if (i.update && inst === i && !ended && !interlude) safe(() => i.update(dt));
        if (inst === i && !ended) runTimers();
      },
      render(g, W, H) { if (inst && inst.render && !ended) safe(() => inst.render(g, W, H)); },
      pause() {
        if (!def || ended || paused) return false;
        paused = true;
        if (inst && inst.onPause) safe(() => inst.onPause(true));
        return true;
      },
      resume() {
        if (!paused) return false;
        paused = false;
        if (inst && inst.onPause) safe(() => inst.onPause(false));
        for (const p of players) if (lastUI[p.id] && env.isConnected(p.id)) env.send(p.id, lastUI[p.id]);
        return true;
      },
      skip() {
        if (paused) return false;
        if (intro) { begin(); return true; }
        if (interlude) { finishInterlude(); return true; }
        return false;
      },
      input(id, d) {
        if (!inst || paused || intro || interlude || ended || !(id in scores) || !inst.onInput) return;
        safe(() => inst.onInput(id, d));
      },
      leave(id) { if (inst && !ended && id in scores && inst.onLeave) safe(() => inst.onLeave(id)); },
      rejoin(id) {
        if (!def || ended || !(id in scores)) return false;
        if (paused) env.send(id, { ui: 'paused' });
        else if (lastUI[id]) env.send(id, lastUI[id]);
        if (inst && inst.onRejoin) safe(() => inst.onRejoin(id));
        return true;
      },
      has: id => !!def && !ended && id in scores,
      lastUI: id => lastUI[id],
      stop() {
        if (inst && inst.destroy) safe(() => inst.destroy());
        inst = null; def = null; ctx = null; timers = []; intro = null; interlude = null; paused = false;
        if (env.stage) env.stage.innerHTML = '';
      },
      get mode() { return !def ? 'idle' : ended ? 'ended' : paused ? 'paused' : intro ? 'intro' : interlude ? 'interlude' : 'play'; },
      get def() { return def; },
      get settings() { return settings; },
      get scores() { return Object.assign({}, scores); },
      get time() { return gameTime; },
      memory,
    };
    return runner;
  }

  const api = { create, createMemory, resolveSettings, rank, partyPoints, optionList, DIFF, STEP };
  root.HuddleRunner = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // eslint-disable-line no-undef -- Node tests
})(typeof window !== 'undefined' ? window : {});
