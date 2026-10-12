# 001 — Core platform: Design

- **Status:** Implemented
- **Requirements:** [requirements.md](requirements.md)

## Overview

This is a thin relay server with the game logic on the TV. The TV page is the authoritative host: it runs a 60 fps loop, owns all game state and tells each phone what to render. The server keeps only rooms, seats and reconnect keys, all in memory, and forwards messages.

Why this design:
- Games are pure client JavaScript, so adding one needs no server deploy.
- The server stays tiny and stateless across restarts. Rooms are disposable.
- Latency is one hop each way (phone → server → TV), which is enough for a joystick brawler at LAN or nearby-region distances.

## Architecture

```
 phone (play.js)  ──in──▶  server/app.js  ──in──▶  TV (tv.js + games/*.js)
       ▲                     rooms Map                    │
       └────────msg───────── relay only ◀──host:send──────┘
```

| File | Role |
|---|---|
| `server/app.js` | `createApp()` factory: Express, Socket.IO, rooms. No game logic. |
| `server/index.js` | Process entry: listen, graceful SIGTERM. |
| `public/tv.js` | Lobby, game runner, results, remote-key handling. |
| `public/play.js` | Controller. Renders `{ui:…}` messages and sends input. |
| `public/games/*.js` | One file per game, registered with `Hub.register`. |
| `public/shared.js` | Character list, game registry, `esc`, `shuffle`. |
| `public/platform.js` | TV platform adapter (see spec 002). |

## Interfaces

> Extended by [spec 003](../003-party-pack-v2/design.md#protocol-additions): new UIs (`paused`, `aim`, `dpad`, `react`, `number`, `text`), new VIP `sys` actions, the `/CODE` short link, and the runner `ctx` (scores, round scoreboards, settings, no-repeat content, pause).

### Socket events

| Direction | Event | Payload | Ack |
|---|---|---|---|
| TV → S | `host:create` | `{ code?, hostKey? }` | `{ code, hostKey, players }` |
| TV → S | `host:send` | `{ to: playerId \| 'all', msg }` | — |
| TV → S | `host:kick` | `playerId` | — |
| S → TV | `players` | `PublicPlayer[]` | — |
| S → TV | `player:join` | `{ id, reconnect }` | — |
| S → TV | `player:leave` | `{ id }` | — |
| S → TV | `in` | `{ id, d }` | — |
| Phone → S | `player:join` | `{ code, name, key? }` | `{ ok, id, key, name, char, hostOnline }` or `{ error }` |
| Phone → S | `player:char` | `charId` | `{ ok }` or `{ error }` |
| Phone → S | `in` | input object (below) | — |
| S → Phone | `lobby` | `{ players: PublicPlayer[] }` | — |
| S → Phone | `msg` | UI message (below) | — |
| S → Phone | `host:gone` / `host:back` / `room:closed` / `kicked` | — / reason | — |

`PublicPlayer = { id, name, char, connected, vip }`. It never includes `key` or `socket`.

### UI messages (TV → phone, `msg.ui`)

`menu`, `wait`, `joystick`, `choices`, `secret`, `turn`, `draw`, `guess`, `tap`, `result`.
Optional fields on any message: `vibrate` (number or pattern), `note` (toast text), `focus` (game id highlighted on the VIP menu), `allowChar` (lets the player change character while waiting).

### Input messages (phone → TV, `in.d.t`)

`sys` (with `a`: `menu` | `pick` | `focus` | `quit` | `again` | `lobby`; only the VIP's are obeyed, except `menu`), `joy`, `btn`, `tap`, `choice`, `ready`, `done`, `guess`, `pts`, `undo`, `clear`.

### Game plug-in contract

```js
Hub.register({
  id, title, emoji, genre, tagline, time, controls,
  min, max,                 // player limits
  colors: [from, to],       // tile gradient
  create(ctx) {             // returns the game instance
    return { update(dt), render(g, W, H), onInput(id, d), onLeave(id), onRejoin(id), destroy() };
  },
});
```

`ctx` provides `players`, `stage` (DOM layer), `canvas`, `g` (2D context), `W`/`H`, `fit(ww, wh)`, `send(id, msg)`, `sendAll(msg)`, `isConnected(id)`, `after(sec, fn)` (auto-cleared timers), `sfx(kind)`, `toast(text)`, and `end(results | null)`, where `results` is `[{ id, score }]`.

### Environment

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `PUBLIC_URL` | — | Public base URL for join links and QR codes (set this when hosted) |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS origins for the API and socket |

## Requirement coverage

| Requirement | Covered by | Test |
|---|---|---|
| R1 | `server/app.js` routes, CORS middleware | `test/server.test.js` R1.* |
| R2 | `newCode()`, `host:create` | R2 |
| R3 | `player:join`, `cleanName`, `pickVip` | R3.* |
| R4 | `player:char` | R4 |
| R5 | `in`, `host:send`, `host:kick` role checks | R5.* |
| R6 | `key` lookup, `dropTimer` | R6.* |
| R7 | `hostKey`, `killTimer` | R7.* |
| R8 | `tv.js` `startGame` / `endGame` | manual: play each game to the results screen |

## Error handling and edge cases

- **Late joiners mid-game:** they get `wait` with `allowChar`, and join the next game.
- **More players than the game's `max`:** the extras get "Room is full for this game".
- **Input from a non-player socket:** dropped by the server.
- **Exceptions in game code:** caught per frame in `tv.js`, so a bug can't freeze the loop.

## Risks

- **All state is in memory.** A server restart drops every room. That's acceptable for party sessions, and the TV recreates a room on reconnect. Multi-instance hosting would need sticky sessions plus the Socket.IO Redis adapter. That's out of scope until it's needed.
