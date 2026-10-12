# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- TV store apps from one codebase: LG webOS, Samsung Tizen, and Android TV / Fire TV through Capacitor (spec 002).
- `public/platform.js` adapter: remote Back/OK keys on every TV and platform-native app exit.
- `scripts/build-tv.mjs`, which builds store bundles against a hosted hub (`HUDDLE_SERVER_URL`).
- Store icons and banners generated from SVG (`npm run icons`).
- `/healthz` endpoint, `ALLOWED_ORIGINS` CORS setting, graceful shutdown, a Dockerfile and a Render blueprint.
- Contract tests for the socket protocol and the TV builds, plus ESLint, CI, a release workflow and Dependabot.
- A spec-driven workflow (`specs/`), with baseline spec 001 for the core platform, and `CLAUDE.md`.

### Changed
- The server moved to `server/` (`createApp()` factory + `server/index.js`). Start it with `npm start` as before.
- TV page assets use relative paths so the page works when packaged.
- The minimum Node version is now 22.

### Fixed
- `player:char` now rejects empty ids and requests from non-player sockets.
- Kicking a player clears their reconnect timer, and closing a room clears every player timer.

## [1.0.0] - 2026-10-12

### Added
- First version: TV-hosted lobby, QR join, five games (Bumper Brawl, Undercover, Quiz Clash, Doodle Dash, Tug Rally), character select, session trophies, and rejoin after a disconnect.
