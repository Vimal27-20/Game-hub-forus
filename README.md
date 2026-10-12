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

| Game | Type | Players | Phone controls |
|---|---|---|---|
| 💥 Bumper Brawl | Physics brawler: ram each other off a shrinking arena. Bumper posts appear in rounds 2 and 3. | 2–12 | Joystick + DASH |
| 🕵️ Undercover | Secret roles: everyone gets the word except the spy. Players take turns giving clues, then vote. A caught spy can still steal the round by guessing the word. | 3–12 | Hold-to-reveal card, Done, vote |
| 🧠 Quiz Clash | Speed trivia (45 questions, includes Irish ones). Faster answers and streaks score more. | 1–12 | 4 coloured answer buttons |
| 🎨 Doodle Dash | One player draws on their phone, the drawing appears live on the TV, and everyone else guesses. | 2–12 | Drawing canvas / guess box |
| 🪢 Tug Rally | Red vs Blue tug-of-war with rope physics, best of 3. | 2–12 | Big tap button |

Every game also has character select (12 characters, each taken once), session trophies, and automatic rejoin when a phone locks or refreshes.

**TV remote:** use ← → to browse, OK to play, and Back to quit to the lobby. Back in the lobby exits the app. The first player to join gets 👑 and can also pick games from their phone.

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
public/tv.js         TV host: lobby, game runner (60 fps loop), results
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
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the spec-driven workflow and [CLAUDE.md](CLAUDE.md) for the architecture rules (it's also what Claude Code follows in this repo).

## License

[MIT](LICENSE) © 2026 Vimal Kumar Veeraragavan
