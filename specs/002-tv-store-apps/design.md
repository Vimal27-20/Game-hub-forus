# 002 — TV store apps: Design

- **Status:** Implemented (pending on-device QA)
- **Requirements:** [requirements.md](requirements.md)

## Overview

The existing TV host page (`public/tv.html`) is packaged as-is into each store's web-app format. A build step copies the TV files into `dist/<platform>/`, renames `tv.html` to `index.html`, bundles the Socket.IO client and writes a `config.js` holding the hosted server URL. A small runtime adapter, `public/platform.js`, hides the per-platform differences in remote keys and app exit. The phones keep using the hosted `/play` page with no install.

## Architecture

```
public/ (single source)            scripts/build-tv.mjs           dist/
  tv.html ──────────────────────▶  copy + rename        ──────▶   webos/   + appinfo.json, icons  → ares-package → .ipk
  tv.js, tv.css, games/, …         write config.js                tizen/   + config.xml, icon     → Tizen Studio → .wgt
  platform.js (adapter)            socket.io client               android/ → npx cap sync → android/ (Gradle) → .aab/.apk
platforms/<os>/ templates ─────▶   fill {{vars}} from package.json "huddle"
assets/*.svg ── scripts/make-icons.mjs (headless Chrome) ──▶ assets/generated/*.png (committed)
```

### Runtime adapter (`window.HuddlePlatform`)

| Member | Behaviour |
|---|---|
| `name` | `web`, `webos`, `tizen` or `android`, from `HUDDLE_CONFIG.platform` |
| `serverUrl` | `''` when served by the hub; otherwise the configured URL |
| `api(path)` | `serverUrl + path` |
| `connect()` | `io()` same-origin, or `io(serverUrl)` with websocket first |
| `isBack(e)` / `isOk(e)` | Key normalisation (R3) |
| `exit()` | Platform exit (R4); a no-op in a normal browser |

On Android, Capacitor's `backButton` event is re-dispatched as a `keydown` with `key: 'GoBack'`, so `tv.js` has a single key path.

### App identity

App identity is set in one place, `package.json` → `"huddle"`:

| Field | Used by |
|---|---|
| `appId` | webOS `id`, Tizen widget id, Android `applicationId` (also in `capacitor.config.json`) |
| `appName`, `vendor` | Store titles |
| `tizenPackageId` | 10-character Tizen package id |

**App IDs are permanent once published.** Change them before the first store submission, never after.

## Interfaces

- **Build:** `HUDDLE_SERVER_URL=https://… npm run build:tv` (or `build:webos`, `build:tizen`, `build:android`).
- **Generated `config.js`:** `window.HUDDLE_CONFIG = { serverUrl, platform, version }`.
- **Server:** `ALLOWED_ORIGINS` env (spec 001, R1.5) for CORS. The default `*` is safe because nothing uses cookies or credentials.

## Requirement coverage

| Requirement | Covered by | Verified by |
|---|---|---|
| R1 | `build-tv.mjs` URL validation and `config.js` | `test/platform.test.js` R1 |
| R2 | Relative paths in `tv.html`; `HuddlePlatform.api/connect` | test R2; manual file:// load against a live server |
| R3 | `platform.js` `isBack`/`isOk`; `preventDefault` in `tv.js` | test R3 |
| R4 | `platform.js` `exit()`, Capacitor listener | test R4; on-device QA |
| R5 | `android/app/src/main/AndroidManifest.xml`, `res/drawable/banner.png` | on-device QA |
| R6 | `platforms/*` templates, `make-icons.mjs` | test R1/R6 |
| R7 | `Dockerfile`, `render.yaml` | `docker build`; `/healthz` |

## Alternatives considered

- **Hosted web app inside a thin launcher (load `https://hub/tv` in the wrapper).** It's simpler and always up to date. However, LG and Samsung review policies discourage apps that are just a remote URL, the app won't start cleanly when the network is slow, and every TV would depend on the server's TLS and uptime just to show a splash. Rejected in favour of a local bundle that only needs the network for the socket.
- **A framework rewrite (React or Enact).** It adds a build pipeline for no user-visible gain. The vanilla client already runs on every TV browser engine we target.
- **A native tvOS app.** It needs a full rewrite. That's a non-goal for now.

## Risks

- **Old TV engines.** The supported floor is 2021+ TVs: webOS 6 (Chromium 79) and Tizen 6 (Chromium 76). `public/**` must stay ES2019, so no `?.` or `??`. ESLint enforces this (`ecmaVersion: 2019`). Some CSS (`aspect-ratio`, `min()`) needs Chromium 79–88 and may lay out imperfectly on the oldest supported TVs; on-device QA (task 9) must check Doodle Dash and Quiz Clash.
- **Store review of network-only apps.** The app clearly shows the "Reconnecting to the server…" state, and the store listing must say that it needs internet and phones.
- **Version drift on Android.** `versionCode`/`versionName` live in `android/app/build.gradle`. Bump them with `package.json` on every release (release checklist in CONTRIBUTING.md).
