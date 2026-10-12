# 004 — Word Grid and Netflix-style menu: Tasks

- **Design:** [design.md](design.md)

- [x] 1. Dictionary build script (SCOWL ≤ 60, profanity filtered) and committed `content/dict.js` — _R2.2_
  - **Verify:** `test/wordgrid.test.js` (R2.2)
- [x] 2. Board generator and solver, scoring, unique bonus, round reveal — _R1.1, R1.3–R1.7, R2.1_
  - **Verify:** `test/wordgrid.test.js`; bot playthrough in `test/games.test.js`
- [x] 3. Phone `grid` controller: drag-trace with backtrack, tap mode, diagonal-friendly hit areas, live feedback — _R1.2, R1.3_
  - **Verify:** `npm run smoke` (phone: traced path C-A-T sends [0,1,2])
- [x] 4. Netflix-style menu: billboard + vertically scrolling rows, sideways-scrolling rows, ‹ › arrows — _R3_
  - **Verify:** `npm run smoke` (the last tile of every row is reachable by remote and fully on screen; the billboard follows focus)
- [x] 5. gzip compression; README, CHANGELOG, THIRD_PARTY_NOTICES — _R2.2_
