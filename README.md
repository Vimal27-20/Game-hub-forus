# HUDDLE — TV party game hub

[![CI](https://github.com/Vimal27-20/Game-hub-forus/actions/workflows/ci.yml/badge.svg)](https://github.com/Vimal27-20/Game-hub-forus/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

The TV is the host. It shows the games, a QR code and a 4-letter room code.
Everyone joins by scanning the QR code with their phone, and the phone becomes their controller. Nobody installs anything on their phone.

HUDDLE runs in any TV browser, and it also ships as an installable app for **LG webOS**, **Samsung Tizen**, and **Android TV / Google TV / Fire TV**.

## Quick start (local Wi-Fi)

```bash
npm install
npm start
```

The terminal prints two addresses:

- `http://<your-computer-ip>:3000/tv`: open this on the TV
- `http://<your-computer-ip>:3000/play`: phones open this (the QR code does it for them)

The TV and all the phones must be on the **same Wi-Fi** as the computer running the server.

## Games

Eleven games in four groups. Each has its own settings, and rounds change arena, layout or rules so no two rounds play the same.

| Game | Group | What happens | Phone controls | Players |
|---|---|---|---|---|
| 💥 Bumper Brawl | Action | Ram rivals off a shrinking arena. Arenas: Classic, Ice Rink, Donut, Pinball, Gusty | Joystick + DASH | 2–12 |
| 🐍 Light Trails | Action | Light cycles. Don't hit any trail. Modes: Wrap, Blocks, Closing In, Overdrive | Arrow pad + BOOST | 2–12 |
| 🌋 Lava Rise | Action | Climb a tower as lava rises, and bonk heads. Crumbling, sliding, spring, icy and windy towers | Joystick + JUMP | 1–12 |
| ⛳ Mini Golf Mayhem | Action | Everyone putts the same hole at once, and balls collide. 10 holes with bumpers, movers, slopes, sand and water | Drag back, release | 1–12 |
| 🪢 Tug Rally | Action | Red vs Blue rope physics. Slippery, Golden Beats, Short Field and Mud rounds | Tap fast | 2–12 |
| 🤠 Quick Draw | Action | Tap first when the real signal appears; fake-outs are fouls. Timed on each phone, so lag never decides | One big button | 2–12 |
| 🧠 Quiz Clash | Brains | 182 questions in 7 categories: 4-choice, true/false and closest-number | Answer buttons, number pad | 1–12 |
| 📏 Close Call | Brains | "How many…?" questions. Closest wins, exact hits get a bonus | Number pad | 1–12 |
| 🕵️ Undercover | Social | Find the spy who doesn't know the secret word. 16 categories | Hold-to-reveal, vote | 3–12 |
| 🎭 Fake Out | Social | Write a fake answer to a weird true fact, then spot the truth | Type, then vote | 3–12 |
| 🎨 Doodle Dash | Creative | Draw on your phone, it appears live on the TV, and everyone guesses. 206 words in 3 levels | Canvas, guess box | 2–12 |

Questions, words and facts don't repeat within a night.

**Every game also has:**

- **A pause menu.** Back on the TV pauses; Back again quits to the menu. The 👑 phone can pause, resume, restart or quit too.
- **Rejoin.** Close the browser or lock the phone, open the link again, and you're back in the same game with your points (seats are kept for 15 minutes).
- **Fast results.** A live score strip, a round scoreboard (OK to skip), and instant final results with a podium and awards.
- **Tonight's standings.** Party points across every game played tonight (1st 5 · 2nd 3 · 3rd 2 · everyone else 1).
- **Settings.** Room-wide game length, difficulty, sound and vibration, plus each game's own options (rounds, timers, arena size, speed…).

**TV remote:** ← → ↑ ↓ to move, OK to select, Back to pause or go back. Back never leaves the website.
**Phones:** scan the QR code, or open the short link shown on the TV (for example `huddle-hub-btwi.onrender.com/ABCD`).

## Play anywhere: host the hub

**Live hub:** https://huddle-hub-btwi.onrender.com. Open `/tv` on any TV browser, and phones scan the QR code from any network.

For the store apps (or to play without a laptop), deploy the hub once and set `PUBLIC_URL`:

| Option | How |
|---|---|
| Render | New → Blueprint → this repo (uses [`render.yaml`](render.yaml)), then set `PUBLIC_URL` to the service URL |
| Docker | `docker build -t huddle . && docker run -p 3000:3000 -e PUBLIC_URL=https://your.host huddle` |
| Any Node 22+ host | `npm ci --omit=dev && npm start` with `PORT` and `PUBLIC_URL` set |

Environment variables are listed in [`.env.example`](.env.example).

## TV store apps

```bash
HUDDLE_SERVER_URL=https://your.host npm run build:tv   # → dist/webos, dist/tizen, dist/android
```

| Store | Build | Guide |
|---|---|---|
| LG Content Store (webOS) | `npm run package:webos` → `dist/*.ipk` | [platforms/README.md#lg-webos](platforms/README.md#lg-webos) |
| Samsung Apps TV (Tizen) | `npm run build:tizen` → package `dist/tizen` in Tizen Studio | [platforms/README.md#samsung-tizen](platforms/README.md#samsung-tizen) |
| Google Play (Android TV / Google TV) and Amazon Appstore (Fire TV) | `npm run build:android` → `npx cap open android` → signed `.aab` / `.apk` | [platforms/README.md#android-tv--fire-tv](platforms/README.md#android-tv--fire-tv) |

Phones never need an app: they always use the hosted `/play` page.

## How it works

```
server/app.js        relay: rooms, seats, reconnect keys, QR codes (no game logic)
server/index.js      process entry
public/tv.js         TV shell: menus, remote navigation, Back trap, pause, results, standings
public/runner.js     game runner: clock, fixed-step physics, timers, scores, rounds, no-repeat content
public/content/      question, word and fact banks
public/platform.js   TV platform adapter: remote keys, app exit, server URL
public/play.js       phone controller: renders whatever UI the TV asks for
public/games/*.js    one file per game, registered with Hub.register()
scripts/build-tv.mjs packages the TV host for each store
platforms/           webOS / Tizen templates and the store guide
android/             Capacitor project for Android TV / Fire TV
specs/               requirements → design → tasks for every feature
```

The **game logic runs on the TV**, and the server only passes messages along. The full socket protocol and the game plug-in contract are in [specs/001-core-platform/design.md](specs/001-core-platform/design.md).

## Adding a game

Write a spec first (see [specs/README.md](specs/README.md)). Then create `public/games/mygame.js` and add a `<script>` tag for it in `public/tv.html`:

```js
Hub.register({
  id: 'mygame', title: 'My Game', emoji: '🎯', genre: 'Party', tagline: 'One-line pitch',
  min: 2, max: 12, time: '3 min', controls: 'Tap', colors: ['#ff0066', '#ffcc00'],
  create(ctx) {
    ctx.sendAll({ ui: 'tap', label: 'GO!' });
    return {
      onInput(id, d) {},
      update(dt) {},
      render(g, W, H) {},
    };
  },
});
```

## Development

```bash
npm run dev     # restart on change
npm run check   # lint + tests (run before every commit)
npm run smoke   # drives the real TV and phone pages in headless Chrome, screenshots in smoke-out/
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the spec-driven workflow and [CLAUDE.md](CLAUDE.md) for the architecture rules (it's also what Claude Code follows in this repo).

## License

[MIT](LICENSE) © 2026 Vimal Kumar Veeraragavan
