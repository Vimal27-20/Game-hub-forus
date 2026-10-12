# 003 — Party Pack v2: Design

- **Status:** Implemented
- **Requirements:** [requirements.md](requirements.md)

## Overview

The game loop, timers, scoring and session state move out of `tv.js` into a reusable **runner** (`public/runner.js`). Every game, old and new, talks only to the runner through `ctx`, which gives these features to all eleven games without each game reimplementing them:

- pause (R1)
- rejoin (R2)
- settings (R4)
- live scores, round scoreboards and awards (R5)
- no-repeat content (R6)
- fixed-step physics (R8)

`tv.js` becomes the **shell**: menus, remote navigation, the Back trap, the pause overlay, results and session standings. Content banks move to `public/content/*.js`, so they can be tested and grown without touching game code.

The runner has no DOM or socket dependency of its own. It is given `stage`, `canvas`, `send` and `now`, so the same code runs on the TV and in Node tests (R9).

```
          ┌────────────── tv.js (shell) ───────────────┐
 socket ─▶│ menu · focus nav · Back trap · pause overlay │
          │ results · standings · settings persistence  │
          └──────────────┬──────────────────────────────┘
                         │ start(def, players, settings) / pause / resume / input / leave / rejoin
                  ┌──────▼──────┐   ctx    ┌──────────────────┐
                  │ runner.js   │─────────▶│ games/*.js (11)  │
                  │ clock, step,│◀─────────│ create(ctx) → inst│
                  │ timers,     │  hooks   └──────────────────┘
                  │ scores, pick│──▶ content/*.js (banks, session memory)
                  └─────────────┘
```

## Runner (`public/runner.js`)

`HuddleRunner.create(env)` returns a runner. `env` provides `{ stage, canvas, send(id, msg), sfx, toast, isConnected(id), memory, onEnd(result), onRoundOver(info), onError(err) }`.

| Method | Behaviour |
|---|---|
| `start(def, players, settings)` | Builds `ctx`, shows the intro card (how-to + active settings, 3 s, skippable: R4.3), then calls `def.create(ctx)` |
| `frame(dtSeconds)` | Called each animation frame. While not paused: advance game time, run `step(1/120)` from an accumulator (max 10 steps/frame: R8.1), call `update(dt)`, fire due `after` timers. Always calls `render` |
| `pause()` / `resume()` | Freezes game time, steps, timers and input; calls `inst.onPause(bool)`. While paused, phones get `{ui:'paused'}`, and resume re-sends each player's last UI (R1.4) |
| `input(id, d)` | Forwards to `inst.onInput` unless paused or in an interlude |
| `leave(id)` / `rejoin(id)` | Call `onLeave` / `onRejoin`; rejoin re-sends the player's last UI (R2.2) |
| `skip()` | Skips the intro card or round scoreboard |
| `stop()` | Calls `destroy`, clears timers and the stage |

### Game context (`ctx`), the contract for all games

Additions to spec 001 R8:

| Member | Purpose |
|---|---|
| `settings` | Resolved per-game settings (`{ rounds: 5, … }`) |
| `room` | `{ length: 'quick'\|'standard'\|'long', difficulty: 'chill'\|'normal'\|'wild' }` |
| `diff` | Difficulty multiplier: chill 0.8, normal 1, wild 1.25 |
| `after(sec, fn)` | **Game-time** timer: pauses with the game, cleared on stop. Returns a handle for `cancel(h)` |
| `score(id, delta)` | Adds points; the live strip animates the change (R5.1). Returns the new total |
| `scores()` | A copy of all scores |
| `roundOver(title, next)` | Shows the round scoreboard (gains since the last call), and phones show gains. It closes after 4 s, or on OK / the VIP's Next, then calls `next()` (R5.2) |
| `pick(bank, list, n, key)` | Picks `n` items not used this session from `list`, using `key(item)` as the identity, and resets the bank when it runs out (R6.1) |
| `variant(gameId, pool)` | Picks a round modifier different from the last one used for that game (R6.3) |
| `end(opts)` | Ends the game with runner scores, plus `opts.awards: [{ id, emoji, title }]` (R5.3) |
| `smooth(cur, target, dt, tau)` | Exponential smoothing for joystick input (R8.3, tau ≈ 0.04 s) |

Game definition additions: `category` (`action` \| `brains` \| `social` \| `creative`), `how: [string, string, string]`, `settings: [{ id, label, options: [{ v, label }], def: { quick, standard, long } | value }]`, and optional `step(h)` and `onPause(p)` on the instance.

### Scores, awards and standings

- The runner owns the scores. The live strip (`#strip`, bottom of the TV, top 8 by score) animates `+N` popups within one frame of `score()` (R5.1). Games keep the bottom 4.5 rem of the screen clear.
- Final results: `onEnd` fires the moment `end()` is called. The shell renders the podium, all scores and awards, and phones get `{ui:'result', rank, of, score, award}` in the same tick (R5.3, R5.5). If a game passes no awards, the runner adds "Top scorer".
- **Session standings** (R5.4) give party points per game: 1st 5, 2nd 3, 3rd 2, every other finisher 1, and ties share a rank. They are stored in `sessionStorage['huddle-session']` together with the games played, the used-content memory and variant history. This lets a TV reload restore everything (R2.5).

## Shell (`public/tv.js`)

### Navigation and Back (R1, R3.3)

- **History trap:** on load the shell calls `history.replaceState({h:0})` then `pushState({h:1})`. On `popstate` it pushes again and treats the event as **Back**. Keydown Back (Escape, Backspace, GoBack, 461, 10009) is also treated as Back. Events within 350 ms of each other are de-duplicated, because some TV browsers fire both.
- **Back** follows a mode table:

  | Mode | Back does |
  |---|---|
  | game | Pause |
  | paused | Quit to the menu |
  | intro or scoreboard | Pause |
  | results | Menu |
  | setup panel | Close the panel |
  | menu | Nothing |

- **Focus:** each screen declares a list of focus rows, and arrows move between and within rows. Focused items get `.focus` with a visible ring and a `tick` sound. Mouse click works too.

### Main menu (R3.3, R3.4)

- **Tabs:** *Games* · *Settings* · *How to play*.
- **Games tab:** a hero panel for the focused game, plus rows by category (Action, Brains, Social, Creative).
- **Setup panel:** OK on a game opens the setup panel, which shows the game's settings as rows (←/→ to change) and a **Start** button. Start is focused, so OK then OK starts with the defaults.
- **Right panel:** QR code, the **short link** `host/CODE` (R3.1), the room code, and players sorted by session standings with their party points.

### Pause (R1.2–R1.4)

The pause overlay offers Resume, Restart game, Settings and Quit to menu. While paused, phones show "Paused", and the VIP's phone has Resume, Restart and Quit, sent as `sys` actions `resume`, `restart` and `quit`.

### Phones

- `play.js` reads the room code from `?r=`, from the `/CODE` path, or from its saved code.
- New UIs: `paused`, `aim`, `dpad`, `react`, `number` and `text`. The `menu` UI is redesigned with categories, a game sheet with settings, and room settings. `wait` gains `skip`, a "Next ▶" button for the VIP. `result` gains `award` and the actions *Play again* / *Next game* / *Menu*.
- New VIP `sys` actions: `pause`, `resume`, `restart`, `skip`, `setting` (`{game, key, value}`), `room` (`{key, value}`) and `next`.

### Server (R2.4, R3.1)

- `PLAYER_GRACE_MS` becomes 15 min.
- `GET /:code([A-Za-z]{4})` serves `play.html`. Room codes never equal a reserved route (`PLAY`).
- The short link is `PUBLIC_URL/CODE`.

### `/` chooser (R3.2)

Two big buttons: **Start on this TV** and **Join with my phone**. If the browser has a saved room and key, a third button **Rejoin room ABCD** appears first.

## Protocol additions

| Direction | Message | Shape |
|---|---|---|
| TV → phone | `paused` | `{ ui:'paused' }` (VIP renders the controls) |
| TV → phone | `aim` | `{ ui:'aim', label }`; phone sends `{t:'aim', a, p}` at ≤10 Hz while dragging and `{t:'shot', a, p}` on release (a in radians, TV axes; p 0–1) |
| TV → phone | `dpad` | `{ ui:'dpad', btn }`; phone sends `{t:'dir', d:0..3}` (0 up, 1 right, 2 down, 3 left) and `{t:'btn', down}` |
| TV → phone | `react` | `{ ui:'react', r, seq:[{ at, kind:'wait'\|'fake'\|'go', show, color }] }`; phone plays `seq` locally and sends `{t:'react', r, ms}`, or `{t:'react', r, foul:'early'\|'fake'}` |
| TV → phone | `number` | `{ ui:'number', prompt, unit }`; phone sends `{t:'number', v}` |
| TV → phone | `text` | `{ ui:'text', prompt, max }`; phone sends `{t:'text', text}`. TV may reply `{note}` to reject |
| TV → phone | `menu` | `{ ui:'menu', games:[{ id, title, emoji, category, tagline, how, min, max, time, controls, colors, settings:[{ id, label, options, value }] }], room, focus }` |
| phone → TV | `sys` | `a`: `menu` `pick` `focus` `quit` `again` `lobby` `pause` `resume` `restart` `skip` `setting` `room` `next` |

**Quick Draw fairness:** reaction time is measured on each phone, from the moment the `go` step is displayed until the tap. Network latency therefore doesn't affect who wins.

## Games

Every game uses `ctx.score`, `ctx.roundOver`, `ctx.end({ awards })`, `onRejoin`, and keeps its tuning in one `TUNE` block scaled by `ctx.diff` (R8.2).

| Game | Settings (quick / standard / long) | Freshness (R6) | Rejoin (R2.3) |
|---|---|---|---|
| Bumper Brawl | Rounds 3/5/7; Arena size S/M/L | Arenas: Classic, Ice rink, Donut (hole in centre), Pinball pegs, Gusty wind. No repeats in a row | Body freezes while away; returns next round |
| Tug Rally | Best of 3/5/7 | Modifiers: Classic, Slippery rope, Golden beats (2× taps), Short field, Mud (heavy) | Keeps team; tap UI re-sent |
| Quiz Clash | Questions 8/12/16; Timer 10/15/20 s | 150 Qs in 7 categories; styles: 4-choice, true/false, closest number (shared `numbers` bank) | Current question re-sent |
| Undercover | Rounds 2/3/4; Clue laps 1/2 | 15 categories × 8 words, no repeats per session | Turns skip absent players |
| Doodle Dash | Turns per player 1/1/2; Draw time 60/75/90 s; Word difficulty | 200 words in 3 tiers, no repeats | Drawer re-gets canvas; guessers re-get guess box |
| ⛳ Mini Golf | Holes 3/5/7 | 10 holes (walls, bumpers, movers, slopes, sand, water), no repeats | Ball waits at rest |
| 🐍 Light Trails | Rounds 3/5/7; Speed | Modifiers: Classic, Wrap edges, Blocks, Shrinking arena, Speed-up | Returns next round |
| 🌋 Lava Rise | Rounds 2/3/4 | Modifiers: Classic, Crumbling, Moving platforms, Springs, Ice, Wind; procedural towers | Returns next round |
| 🤠 Quick Draw | Rounds 5/8/12 | Variants: Flash, Word, Target emoji, Countdown; fakes scale with difficulty | Waits for the next round |
| 🎭 Fake Out | Rounds 3/5/7; Write time 45/60/75 s | 60 facts + house lies, no repeats | Re-gets the write/vote UI |
| 📏 Close Call | Questions 6/8/12 | 60 number questions (shared `numbers` bank) | Re-gets the number pad |

### Physics tuning (R8.2, units: world px and seconds, at Normal difficulty)

| Game | Constants |
|---|---|
| Bumper | accel 1700, damping 1.9/s, max speed 1100, dash impulse 640 (cooldown 1.1 s), restitution 0.95 × bump 1.22, radius 34. Ice: damping 0.5. Wind: ±420 accel gusts every 4–7 s |
| Light Trails | 96×54 grid, 14 cells/s × diff, boost 1.8× for 1.2 s (cooldown 5 s) |
| Lava Rise | gravity 2600, jump −1050 (release cut ×0.45), run accel 5200 (air ×0.6), max run 520, coyote 0.1 s, jump buffer 0.12 s, lava 40 → +2.2/s² × diff, bonk bounce −800 / stun 0.6 s |
| Mini Golf | max shot 1500 × diff^0.3, rolling decel 260/s² + damping 0.6/s (sand ×5), wall restitution 0.72, bumper ×1.25, ball–ball e 0.9, cup capture at speed < 900 within r 18 |
| Tug Rally | effort decay 2.6/s (slippery 4.2), force gain 70, rope damping 1.4/s, verlet rope 34 nodes × 12 iterations |

## Testing (R9)

- `test/runner.test.js`: game-time timers pause; fixed step count is independent of frame rate; `pick` doesn't repeat until a bank is exhausted; `variant` never repeats back to back; `roundOver` can be skipped; standings maths.
- `test/content.test.js`: bank sizes (R6.2), no duplicates, every quiz item is well-formed, and number answers are finite.
- `test/games.test.js`: **bot playthrough** of all eleven games in jsdom (canvas stubbed). Bots answer whatever UI they were last sent. At 30 % of the run one player leaves and rejoins 5 s later. Each test asserts the game reaches `end` with every player scored and no errors.
- `test/server.test.js`: the short link route, the reserved code and the 15-minute grace period.

## Alternatives considered

- **Keep timers on `setTimeout`.** Rejected because they can't pause, and pause is R1.
- **One physics engine (Matter.js) for every game.** Rejected: it adds a dependency and a build step, it's heavier on TV browsers, and these games are simple enough that hand-tuned code feels better and is easier to read.
- **Measure Quick Draw reactions on the TV.** Rejected because network jitter (20–120 ms) would decide the winner. Phone-side timing is fair.

## Risks

- **Scope.** Eleven games of changes is large. The bot playthrough test is the safety net, and every game must pass it before it's listed in the menu.
- **Content accuracy.** Quiz, Close Call and Fake Out facts are hand-written. Each bank entry was chosen from well-established facts, and players can flag wrong ones as an issue.
- **TV browser performance.** Light Trails draws trails into an offscreen canvas incrementally rather than redrawing every cell each frame.
