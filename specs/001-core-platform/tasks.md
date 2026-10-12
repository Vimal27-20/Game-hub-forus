# 001 — Core platform: Tasks

- **Design:** [design.md](design.md)

- [x] 1. Relay server with rooms, seats and VIP — _R2, R3, R5_
  - **Verify:** `npm test` (R2, R3.*, R5.*)
- [x] 2. Character reservation — _R4_
  - **Verify:** `npm test` (R4)
- [x] 3. Phone and TV reconnect with grace timers — _R6, R7_
  - **Verify:** `npm test` (R6.*, R7.*)
- [x] 4. QR code, join URL and health endpoints — _R1_
  - **Verify:** `npm test` (R1.*)
- [x] 5. Five launch games on the plug-in contract — _R8_
  - **Verify:** manual. With 2+ phones, play each game to the results screen. Then check that Back on the TV returns to the lobby.
- [x] 6. Extract `createApp()` and add contract tests — _all_
  - **Verify:** `npm test` green in CI on Node 22 and 24.
