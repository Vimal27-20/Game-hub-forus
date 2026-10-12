# CLAUDE.md

Guidance for Claude Code (and humans) working in this repository.

## What this is

HUDDLE is a party game hub. The **TV is the host**: it runs the games. **Phones are controllers**: they scan a QR code and need no install. A small Node server relays messages between them. The TV host also ships as store apps for LG webOS, Samsung Tizen and Android TV / Fire TV.

## Spec-driven workflow (required)

Every behaviour change starts in [`specs/`](specs/README.md). Before writing code:

1. **Find the spec.** Locate the spec that owns the behaviour (`specs/NNN-*/`). If none does, create one from `specs/_template/`, starting with `requirements.md` only, and ask the user to confirm the requirements before designing.
2. **Check the design.** Read `requirements.md` → `design.md` → `tasks.md`. If the change isn't covered by the design, update the design first and say so.
3. **Implement task by task.** Implement in `tasks.md` order. Tick each task in the same change as its code.
4. **Name tests after requirements.** Tests cite requirement IDs in their names (`test('R3: …')`). A requirement with no test needs a written manual check in `tasks.md`.
5. **Keep specs in sync.** When behaviour, a protocol message, an env var or a file path changes, update the spec in the same commit. A stale spec is a bug.

For small fixes that don't change behaviour (typos, refactors, dependency bumps), you can skip the spec, but say so in the PR.

## Commands

```bash
npm install            # Node >= 22
npm start              # hub on :3000. Open /tv on the TV, phones scan the QR code
npm run dev            # same, restarts on file changes
npm run check          # lint + tests: run before every commit
npm test               # node:test contract tests (test/*.test.js)
npm run lint           # ESLint (correctness rules only)

HUDDLE_SERVER_URL=https://<hub> npm run build:tv    # dist/webos, dist/tizen, dist/android
npm run package:webos                                # .ipk via LG ares-cli (npx)
npm run build:android && npx cap open android        # then build the .aab in Android Studio
npm run icons                                        # re-render store PNGs from assets/*.svg (needs Chrome)
```

## Architecture rules

- **Game logic runs on the TV** (`public/tv.js` + `public/games/*.js`). The server (`server/app.js`) must stay a relay: rooms, seats, reconnect keys. Never add game rules to the server.
- **The socket protocol is a contract** documented in `specs/001-core-platform/design.md`. Any new event or `{ui:…}` message must be added there and covered by a test in `test/server.test.js` when it touches the server.
- **One TV client for every platform.** Per-platform behaviour goes in `public/platform.js` (`window.HuddlePlatform`) and never in `if (webOS)` branches scattered through `tv.js` or the games. Store metadata lives in `platforms/<os>/` templates, filled from `package.json` → `"huddle"`.
- **TV assets must use relative paths** (`tv.css`, not `/tv.css`) and must call the server through `HuddlePlatform.api()` / `HuddlePlatform.connect()`, because packaged apps load from `file://`. The build test fails on root-absolute paths.
- **The phone page (`/play`) is always served by the hub.** It's never packaged.
- **New games** are one file `public/games/<id>.js` calling `Hub.register({...})` (contract in spec 001, design § Game plug-in contract), plus one `<script>` line in `public/tv.html`. Use `ctx.after()` for timers so they're cleared when the game ends. Clean up in `destroy()`.

## Code style

- **Browser code (`public/**`) is plain ES2019 scripts, no build step and no frameworks.** No `?.` or `??`: 2021-era TVs run Chromium 76–79. ESLint enforces this.
- Server and scripts are CommonJS (`server/`, `test/`) or ESM (`scripts/*.mjs`). Node ≥ 22, with no transpiler.
- Match the surrounding code: compact, with comment density like the existing files and a short header comment on each file that says what it does and which spec it implements.
- Escape all user text before it goes into HTML: use `esc()` from `shared.js`. Player names reach the TV from untrusted phones.
- No formatter is enforced. Don't reformat lines you aren't changing.

## Reliability rules

- Validate every socket payload on the server (type, length, role). Treat phones as untrusted.
- Timers in the server must be cleared on every path that deletes a room or player (see `close()` in `server/app.js`).
- Game code must survive a player disconnecting mid-round (`onLeave`) and rejoining (`onRejoin`). Never assume a player id in `ctx.players` is still connected; use `ctx.isConnected(id)`.
- Exceptions in game `update`/`render` are caught by the loop, but log them. Never silently swallow them in game logic.
- Run `npm run check` before committing. CI runs the same checks plus a TV build on Node 22 and 24.

## Design guidelines (TV and phone UI)

- The TV is viewed from 3 m away. Keep text at 24 px or larger at 1080p, use high contrast, and stay inside a 5% safe area from each edge.
- Everything on the TV must be operable with only ← → ↑ ↓, OK and Back. Never require a pointer.
- Every remote action gives audible feedback (`sfx`) and a visible focus state.
- The phone UI is one-thumb. Keep tap targets at 48 px or larger, and send haptics through `vibrate` in UI messages.
- Colours: background `#0b0b12`, accent `#ff3d5a`, highlight `#ffb13d`. Use the Outfit font with a `system-ui` fallback.

## Releases

Bump the version in **both** `package.json` and `android/app/build.gradle` (`versionCode` +1, `versionName`), update `CHANGELOG.md`, then tag `vX.Y.Z`. The Release workflow builds the TV bundles and the webOS `.ipk` as artifacts. See CONTRIBUTING.md § Releasing.

## Don't

- Don't commit `dist/`, `android/app/src/main/assets/public/`, signing keys (`*.jks`, `*.keystore`, `*.p12`, Tizen `author.p12`), or `.env` files.
- Don't change app ids in `package.json` → `"huddle"` or `capacitor.config.json` after a store release.
- Don't add dependencies to the browser code. Server dependencies need a reason in the PR.
