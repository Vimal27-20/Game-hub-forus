# 002 — TV store apps: Requirements

- **Status:** In progress (code done, on-device QA and store submission pending; see [tasks.md](tasks.md))
- **Owner:** @Vimal27-20
- **Related:** [001-core-platform](../001-core-platform/requirements.md)

## Problem

Today the TV opens HUDDLE in its web browser and needs a laptop on the same Wi-Fi running the server. That's fiddly, and most people never find the TV's browser. HUDDLE should be an installable app in the TV app stores that works on any network.

## Goals

- Installable apps for LG webOS (LG Content Store), Samsung Tizen (Samsung Apps TV), and Android TV / Google TV / Fire TV (Google Play and Amazon Appstore).
- All stores ship from one codebase. The TV host web code is never forked per platform.
- No laptop needed: the apps connect to a hosted hub over HTTPS.

## Non-goals

- **Apple TV (tvOS).** tvOS has no web view, so the TV host would have to be rewritten natively. Revisit with its own spec if demand justifies it.
- **Phone apps in the App Store or Google Play.** The controller is a web page by design: players scan and play with no install. A store-wrapped controller would also risk rejection under App Store guideline 4.2 (minimum functionality).
- **Offline or LAN-only play from a store app.** Store builds need the hosted hub. LAN play stays available through the browser flow.

## Requirements

### R1 — Configured hub server

**User story:** As a maintainer, I want to set the hub URL at build time, so that store apps connect to production without code changes.

1. WHEN a TV bundle is built THE SYSTEM SHALL write the `HUDDLE_SERVER_URL` value into the bundle's `config.js`.
2. IF `HUDDLE_SERVER_URL` is missing or not a valid URL THEN THE SYSTEM SHALL fail the build with a clear message.
3. IF `HUDDLE_SERVER_URL` is not `https` THEN THE SYSTEM SHALL warn that stores reject cleartext traffic.

### R2 — One TV client, two delivery modes

1. WHILE served by the hub server THE SYSTEM SHALL use same-origin URLs, so the existing browser flow keeps working.
2. WHILE running as a packaged app THE SYSTEM SHALL load all assets from relative paths in the bundle, and SHALL reach the API and socket at the configured server URL.

### R3 — Remote control keys

1. THE SYSTEM SHALL treat Escape, Backspace, `GoBack`, `XF86Back`, webOS keyCode 461 and Tizen keyCode 10009 as Back.
2. THE SYSTEM SHALL treat Enter, Select and keyCode 13 as OK.
3. WHEN Back is pressed THE SYSTEM SHALL stop the platform's default navigation.

### R4 — Exit behaviour

1. WHEN Back is pressed in the lobby THE SYSTEM SHALL exit the app through the platform API: `tizen.application…exit()` on Tizen, Capacitor `App.exitApp()` on Android, `window.close()` on webOS.
2. WHEN Back is pressed in a game THE SYSTEM SHALL return to the lobby. In results it SHALL also return to the lobby.
3. WHEN the Android hardware Back button is pressed THE SYSTEM SHALL route it through the same key handling.

### R5 — Android TV and Fire TV launcher

1. THE SYSTEM SHALL declare `LEANBACK_LAUNCHER`, a 320×180 banner and landscape orientation.
2. THE SYSTEM SHALL declare touchscreen and leanback as not required, so both Google TV and Fire TV accept the same APK.

### R6 — Store-ready packages

1. THE SYSTEM SHALL generate webOS `appinfo.json` and Tizen `config.xml` from templates, filling in app id, name, vendor and version from `package.json`.
2. THE SYSTEM SHALL require the version to be numeric `x.y.z`.
3. THE SYSTEM SHALL include the store icons each platform requires: webOS 80×80 and 130×130 plus a splash, Tizen 512×512, Android banner 320×180.
4. THE SYSTEM SHALL restrict the Tizen network access and CSP to the hub origin and Google Fonts.

### R7 — Hosted hub

1. THE SYSTEM SHALL ship a container image definition and a one-click host config, and both SHALL set `PUBLIC_URL` and expose `/healthz`.
