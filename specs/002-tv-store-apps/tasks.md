# 002 — TV store apps: Tasks

- **Design:** [design.md](design.md)

## Code (done)

- [x] 1. Server: CORS for `/api` and the socket, `/healthz`, `createApp()` factory — _001 R1.4, R1.5_
  - **Verify:** `npm test` (R1.*)
- [x] 2. `public/config.js` and `public/platform.js` adapter; relative paths in `tv.html`; `tv.js` routes keys and URLs through the adapter — _R2, R3, R4_
  - **Verify:** `npm test` (platform R2–R4). The packaged `dist/webos/index.html` opened from `file://` against a local hub showed the room code, QR code and join URL.
- [x] 3. `scripts/build-tv.mjs` with webOS and Tizen templates — _R1, R6_
  - **Verify:** `npm test` (R1/R6)
- [x] 4. Icons and banners from SVG (`npm run icons`) — _R6.3_
  - **Verify:** files exist in `assets/generated/`; the build test checks webOS references.
- [x] 5. Capacitor Android project with the leanback launcher, banner, and touchscreen not required — _R5_
  - **Verify:** see manual QA below.
- [x] 6. `Dockerfile` + `render.yaml` — _R7_

## Release (to do)

- [ ] 7. Decide final app identity in `package.json` → `huddle` and in `capacitor.config.json` — _R6.1_
  - These are permanent after the first publish.
- [x] 8. Deploy the hub (Render, Fly or Railway) with `PUBLIC_URL` set; confirm `GET /healthz` works over HTTPS — _R7_
  - Live at https://huddle-hub-btwi.onrender.com (Render free plan, from `render.yaml`).
  - **Verified 2026-10-12:** `/healthz`, `/api/info` (https base), `/api/qr`, CORS `*`; a live socket round trip (host create → phone join → input → host message); and the packaged `dist/webos` loaded from `file://` showed the room code, QR code and join URL.
  - Before store release: switch to a paid always-on plan (the free plan sleeps after 15 min idle).
- [ ] 9. On-device QA on each platform — _R3, R4, R5_
  - [ ] LG webOS (Developer Mode app): install, join with 2 phones, play one game, Back in game → lobby, Back in lobby → exits.
  - [ ] Samsung Tizen (Developer Mode): same checklist.
  - [ ] Android TV emulator or Google TV device: the app appears on the home row with its banner; same checklist.
  - [ ] Fire TV stick: same checklist.
- [ ] 10. Store accounts and signing
  - [ ] LG Seller Lounge account; submit the `.ipk`.
  - [ ] Samsung Apps TV Seller Office; Tizen author + distributor certificates; submit the `.wgt`.
  - [ ] Google Play Console (TV form factor + TV screenshots); signed `.aab`.
  - [ ] Amazon Developer Console (Fire TV); signed `.apk`.
- [ ] 11. Store listing assets: 1920×1080 screenshots of the lobby and each game, privacy policy URL, "needs internet and phones" in the description.
