# 003 — Party Pack v2: Tasks

- **Design:** [design.md](design.md)

- [x] 1. Server: 15-minute seat grace, `/CODE` short link, reserved codes — _R2.4, R3.1_
  - **Verify:** `npm test` (server 003 R2.4, R3.1)
- [x] 2. Runner: game clock, fixed step, game-time timers, pause, scores, round scoreboard, `pick`, `variant`, end and awards — _R1.2, R4, R5, R6.1, R6.3, R8.1_
  - **Verify:** `test/runner.test.js` (15 tests)
- [x] 3. Content banks: quiz 182 (32 true/false), numbers 66, doodle 206, spy 16×8, Fake Out 62 — _R6.2, R6.4_
  - **Verify:** `test/content.test.js`
- [x] 4. TV shell: menu tabs, category rows, setup panel, focus nav, history trap, pause overlay, results v2, session standings, settings, persistence — _R1, R2.5, R3.3, R3.4, R4.1, R4.4, R5_
  - **Verify:** `npm run smoke` (TV flow: remote keys, Back → pause → Back → menu, browser Back stays on site, TV reload keeps room and standings)
- [x] 5. Phone: short link code, categorized VIP menu with game sheet and settings, pause controls, paused screen, new UIs (aim, dpad, react, number, text), result actions — _R1.4, R2.1, R3.5, R5.6_
  - **Verify:** `npm run smoke` (phone flow in 390×844 mobile emulation)
- [x] 6. `/` chooser with Rejoin — _R2.1, R3.2_
  - **Verify:** headless Chrome check: with a saved room, "Rejoin room WXYZ" is the first button and links to `/WXYZ`
- [x] 7. Upgrade the existing five games to the runner (settings, freshness, rejoin, awards, step) — _R2.3, R4.2, R6.3, R8_
  - **Verify:** `test/games.test.js` bot playthroughs (2 and 6 players, leave + rejoin + pause)
- [x] 8. New games: Mini Golf, Light Trails, Lava Rise, Quick Draw, Fake Out, Close Call — _R7, R8_
  - **Verify:** `test/games.test.js` bot playthroughs, plus every game played in real Chrome with 4 simulated phones and screenshotted (no console errors)
- [x] 9. Docs: spec 001 protocol pointer, README game list, CHANGELOG, CLAUDE.md game contract — _all_

## Follow-ups (not blocking)

- [ ] Play-test each new game with real people and tune the `TUNE` blocks (lava speed, golf power curve, trail speed).
- [ ] Measure 60 fps with 8 players on a real 2021 TV browser (R9.3). Lint enforces ES2019 already.
